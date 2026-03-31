"""ACLED Conflict Data adapter — Tier 2 structured API source."""

from __future__ import annotations

from datetime import datetime

import httpx

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.adapters.tier1._common import (
    USER_AGENT,
    clean_text,
    parse_datetime,
    stable_external_id,
)
from narad.config import Settings

_EVENT_TYPE_MAP: dict[str, str] = {
    "battles": "armed_conflict",
    "protests": "civil_unrest",
    "riots": "civil_unrest",
    "strategic developments": "strategic_development",
}


def _map_event_type(raw_type: str) -> str:
    return _EVENT_TYPE_MAP.get(raw_type.lower(), "civil_unrest")


def _severity_from_fatalities(fatalities: int) -> str:
    if fatalities > 10:
        return "critical"
    if fatalities > 3:
        return "high"
    if fatalities > 0:
        return "medium"
    return "low"


class AcledAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="ACLED Conflict Data",
            slug="acled",
            source_type="api",
            trust_tier=2,
            authority_level="research",
            base_url="https://api.acleddata.com",
            update_cadence_seconds=3600,
        )

    async def fetch_documents(
        self, limit: int, since: datetime | None = None
    ) -> list[RawDocument]:
        params: dict[str, str | int] = {
            "key": self._settings.acled_api_key,
            "email": self._settings.acled_email,
            "country": "India",
            "limit": limit,
        }
        if since is not None:
            params["event_date"] = since.strftime("%Y-%m-%d")
            params["event_date_where"] = ">="

        url = "https://api.acleddata.com/acled/read"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers=headers
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        payload = response.json()
        rows: list[dict] = payload.get("data", [])

        documents: list[RawDocument] = []
        for row in rows[:limit]:
            data_id = str(row.get("data_id", ""))
            event_date_str = str(row.get("event_date", ""))
            event_type_raw = str(row.get("event_type", ""))
            sub_event_type = str(row.get("sub_event_type", ""))
            actor1 = str(row.get("actor1", ""))
            actor2 = str(row.get("actor2", ""))
            notes = clean_text(str(row.get("notes", "")))

            try:
                fatalities = int(row.get("fatalities", 0))
            except (TypeError, ValueError):
                fatalities = 0

            try:
                latitude = float(row["latitude"])
                longitude = float(row["longitude"])
                geometry: tuple[float, float] | None = (latitude, longitude)
            except (KeyError, TypeError, ValueError):
                geometry = None

            event_type = _map_event_type(event_type_raw)
            severity = _severity_from_fatalities(fatalities)
            published_at = parse_datetime(event_date_str)

            title = f"ACLED: {event_type_raw}"
            if actor1:
                title = f"{title} — {actor1}"

            body_parts = [notes] if notes else []
            if sub_event_type:
                body_parts.append(f"Sub-event: {sub_event_type}")
            if actor2:
                body_parts.append(f"Actor 2: {actor2}")
            if fatalities:
                body_parts.append(f"Fatalities: {fatalities}")
            body_text = ". ".join(body_parts) or title

            documents.append(
                RawDocument(
                    external_id=stable_external_id("acled", data_id, event_date_str),
                    title=title,
                    body_text=body_text,
                    doc_type="event",
                    published_at=published_at,
                    original_language="en",
                    geometry=geometry,
                    metadata={
                        "source": "acled",
                        "event_type": event_type,
                        "severity": severity,
                        "sub_event_type": sub_event_type,
                        "actor1": actor1,
                        "actor2": actor2,
                        "fatalities": fatalities,
                        "data_id": data_id,
                    },
                )
            )

        return documents
