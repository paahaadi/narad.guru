"""OpenSky Network adapter — Tier 2 ADS-B telemetry source."""

from __future__ import annotations

from datetime import datetime

import httpx

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.adapters.tier1._common import USER_AGENT, stable_external_id
from narad.config import Settings

# India bounding box: lat 6-36, lon 68-98
_INDIA_BBOX_URL = (
    "https://opensky-network.org/api/states/all"
    "?lamin=6&lomin=68&lamax=36&lomax=98"
)


class OpenSkyAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="OpenSky Network",
            slug="opensky",
            source_type="api",
            trust_tier=2,
            authority_level="open_data",
            base_url="https://opensky-network.org",
            update_cadence_seconds=60,
        )

    async def fetch_documents(
        self, limit: int, since: datetime | None = None
    ) -> list[RawDocument]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        # Optional basic auth for higher rate limits
        auth: httpx.BasicAuth | None = None
        if self._settings.opensky_username and self._settings.opensky_password:
            auth = httpx.BasicAuth(
                username=self._settings.opensky_username,
                password=self._settings.opensky_password,
            )

        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers=headers, auth=auth
        ) as client:
            response = await client.get(_INDIA_BBOX_URL)
            response.raise_for_status()

        payload = response.json()
        states: list[list] = payload.get("states") or []

        documents: list[RawDocument] = []
        for sv in states[:limit]:
            # State vector indices:
            # [0]=icao24, [1]=callsign, [2]=origin_country,
            # [5]=longitude, [6]=latitude, [7]=baro_altitude,
            # [8]=on_ground, [9]=velocity, [10]=true_track
            icao24 = str(sv[0] or "").strip()
            callsign = str(sv[1] or "").strip()
            origin_country = str(sv[2] or "").strip()

            try:
                longitude = float(sv[5]) if sv[5] is not None else None
                latitude = float(sv[6]) if sv[6] is not None else None
            except (TypeError, ValueError):
                longitude = None
                latitude = None

            try:
                baro_altitude = float(sv[7]) if sv[7] is not None else None
            except (TypeError, ValueError):
                baro_altitude = None

            on_ground = bool(sv[8]) if len(sv) > 8 else False

            try:
                velocity = float(sv[9]) if sv[9] is not None else None
            except (TypeError, ValueError):
                velocity = None

            try:
                true_track = float(sv[10]) if sv[10] is not None else None
            except (TypeError, ValueError):
                true_track = None

            geometry: tuple[float, float] | None = None
            if latitude is not None and longitude is not None:
                geometry = (latitude, longitude)

            title = f"OpenSky: {callsign or icao24}"
            body_parts = [f"ICAO24: {icao24}"]
            if callsign:
                body_parts.append(f"Callsign: {callsign}")
            if origin_country:
                body_parts.append(f"Origin: {origin_country}")
            if baro_altitude is not None:
                body_parts.append(f"Altitude: {baro_altitude:.0f}m")
            if velocity is not None:
                body_parts.append(f"Velocity: {velocity:.1f}m/s")
            body_text = ". ".join(body_parts)

            documents.append(
                RawDocument(
                    external_id=stable_external_id("opensky", icao24, callsign or ""),
                    title=title,
                    body_text=body_text,
                    doc_type="telemetry",
                    original_language="en",
                    geometry=geometry,
                    metadata={
                        "source": "opensky",
                        "telemetry_only": True,
                        "icao24": icao24,
                        "callsign": callsign,
                        "origin_country": origin_country,
                        "baro_altitude": baro_altitude,
                        "on_ground": on_ground,
                        "velocity": velocity,
                        "true_track": true_track,
                    },
                )
            )

        return documents
