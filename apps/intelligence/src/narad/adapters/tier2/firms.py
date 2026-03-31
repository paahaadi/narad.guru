"""NASA FIRMS Fire Data adapter — Tier 2 structured API source."""

from __future__ import annotations

import csv
import io
from datetime import datetime

import httpx

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.adapters.tier1._common import USER_AGENT, parse_datetime, stable_external_id
from narad.config import Settings


def _severity_from_confidence(confidence: str) -> str:
    lower = confidence.strip().lower()
    if lower in ("nominal", "low"):
        return "low"
    if lower == "high":
        return "medium"
    # Numeric confidence values
    try:
        value = float(confidence)
    except (TypeError, ValueError):
        return "low"
    if value > 80:
        return "high"
    if value > 50:
        return "medium"
    return "low"


class FirmsAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="NASA FIRMS Fire Data",
            slug="firms",
            source_type="api",
            trust_tier=2,
            authority_level="research",
            base_url="https://firms.modaps.eosdis.nasa.gov",
            update_cadence_seconds=900,
        )

    async def fetch_documents(
        self, limit: int, since: datetime | None = None
    ) -> list[RawDocument]:
        map_key = self._settings.firms_map_key
        url = (
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv"
            f"/{map_key}/VIIRS_SNPP_NRT/IND/1"
        )
        headers = {"User-Agent": USER_AGENT, "Accept": "text/csv"}

        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers=headers
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        reader = csv.DictReader(io.StringIO(response.text))
        documents: list[RawDocument] = []

        for row in reader:
            if len(documents) >= limit:
                break

            try:
                latitude = float(row["latitude"])
                longitude = float(row["longitude"])
            except (KeyError, TypeError, ValueError):
                continue

            bright_ti4 = row.get("bright_ti4", "")
            confidence = row.get("confidence", "low")
            acq_date = row.get("acq_date", "")
            acq_time = row.get("acq_time", "")
            satellite = row.get("satellite", "")
            frp = row.get("frp", "")

            severity = _severity_from_confidence(confidence)
            published_at = parse_datetime(f"{acq_date}T{acq_time}:00") if acq_date else None

            title = f"FIRMS fire detection at ({latitude:.3f}, {longitude:.3f})"
            body_text = (
                f"Thermal anomaly detected by {satellite or 'VIIRS_SNPP'} "
                f"at ({latitude:.4f}, {longitude:.4f}). "
                f"Brightness: {bright_ti4}, FRP: {frp}, Confidence: {confidence}."
            )

            documents.append(
                RawDocument(
                    external_id=stable_external_id(
                        "firms", f"{latitude},{longitude}", acq_date
                    ),
                    title=title,
                    body_text=body_text,
                    doc_type="event",
                    published_at=published_at,
                    original_language="en",
                    geometry=(latitude, longitude),
                    metadata={
                        "source": "firms",
                        "event_type": "fire_thermal_anomaly",
                        "severity": severity,
                        "bright_ti4": bright_ti4,
                        "confidence": confidence,
                        "acq_date": acq_date,
                        "acq_time": acq_time,
                        "satellite": satellite,
                        "frp": frp,
                    },
                )
            )

        return documents
