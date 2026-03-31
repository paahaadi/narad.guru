from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from narad.config import Settings
from narad.db.session import Database
from narad.services.llm import LLMService


@dataclass(slots=True)
class SectorForecastResult:
    sector_name: str
    friction_change_pct: float
    period_label: str
    narrative: str


async def rebuild_sector_forecasts(
    database: Database,
    *,
    tenant_id: UUID,
    settings: Settings,
    llm_service: LLMService | None = None,
) -> dict[str, Any]:
    llm = llm_service or LLMService(settings)
    digest_rows = await database.fetch(
        """
        SELECT digest, projected_at
        FROM projections.regulatory_digest
        WHERE tenant_id = $1
          AND projected_at >= now() - (($2 * 2)::text || ' days')::interval
        ORDER BY projected_at DESC
        """,
        tenant_id,
        settings.sector_forecast_window_days,
        tenant_id=tenant_id,
    )

    if not digest_rows:
        return {"status": "noop", "tenant_id": str(tenant_id), "count": 0}

    recent_counter: Counter[str] = Counter()
    previous_counter: Counter[str] = Counter()
    cutoff = datetime.now(UTC) - timedelta(days=settings.sector_forecast_window_days)
    for row in digest_rows:
        payload = row["digest"] if isinstance(row["digest"], dict) else json.loads(str(row["digest"]))
        sectors = payload.get("lex_pulse", {}).get("affected_sectors", [])
        if not isinstance(sectors, list):
            continue
        target_counter = recent_counter if row["projected_at"] >= cutoff else previous_counter
        for sector in sectors:
            if isinstance(sector, str) and sector.strip():
                target_counter[sector.strip()] += 1

    period_label = f"Last {settings.sector_forecast_window_days} days"
    results: list[SectorForecastResult] = []
    for sector_name, recent_count in recent_counter.most_common(6):
        previous_count = previous_counter.get(sector_name, 0)
        friction_change_pct = _change_percentage(recent_count, previous_count)
        narrative = await _forecast_narrative(
            llm,
            sector_name=sector_name,
            recent_count=recent_count,
            previous_count=previous_count,
            friction_change_pct=friction_change_pct,
            period_label=period_label,
        )
        results.append(
            SectorForecastResult(
                sector_name=sector_name,
                friction_change_pct=friction_change_pct,
                period_label=period_label,
                narrative=narrative,
            )
        )

    for result in results:
        await database.execute(
            """
            INSERT INTO lex_pulse.sector_forecasts (
                tenant_id,
                sector_name,
                friction_change_pct,
                period_label,
                narrative
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (tenant_id, sector_name, period_label)
            DO UPDATE SET
                friction_change_pct = EXCLUDED.friction_change_pct,
                narrative = EXCLUDED.narrative,
                updated_at = now()
            """,
            tenant_id,
            result.sector_name,
            result.friction_change_pct,
            result.period_label,
            result.narrative,
            tenant_id=tenant_id,
        )

    return {
        "status": "rebuilt",
        "tenant_id": str(tenant_id),
        "count": len(results),
        "period_label": period_label,
        "sectors": [asdict(result) for result in results],
    }


def _change_percentage(recent_count: int, previous_count: int) -> float:
    if previous_count <= 0:
        return 100.0 if recent_count > 0 else 0.0
    return round(((recent_count - previous_count) / previous_count) * 100, 2)


async def _forecast_narrative(
    llm_service: LLMService,
    *,
    sector_name: str,
    recent_count: int,
    previous_count: int,
    friction_change_pct: float,
    period_label: str,
) -> str:
    payload = await llm_service.generate_json(
        "\n".join(
            [
                "Write one concise analyst narrative for a sector forecast card.",
                "Return JSON with key: narrative.",
                f"Sector: {sector_name}",
                f"Period: {period_label}",
                f"Recent regulatory count: {recent_count}",
                f"Previous regulatory count: {previous_count}",
                f"Friction change percent: {friction_change_pct}",
            ]
        )
    )
    if isinstance(payload, dict):
        narrative = str(payload.get("narrative", "")).strip()
        if narrative:
            return narrative
    trend = "accelerated" if friction_change_pct > 0 else "cooled" if friction_change_pct < 0 else "held steady"
    return (
        f"{sector_name} regulatory friction {trend} over {period_label.lower()}, with "
        f"{recent_count} qualifying digests versus {previous_count} in the prior window."
    )
