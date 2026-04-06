"""
Commercial AIS (Automatic Identification System) Adapter
=========================================================
Track 4C: Tier 3 licensed data feed.

This adapter connects to a commercial AIS provider (e.g. MarineTraffic,
Spire, exactEarth). It is intentionally INACTIVE until:
  1. A valid API credential is configured (AIS_COMMERCIAL_API_KEY)
  2. governance_approved is flipped to True by a platform admin
  3. The source record is enabled via the admin API

Governance contract:
  - trust_tier: 3
  - source_class: source-of-record
  - sensitivity_class: licensed
  - review_required: True (all records enter source_review_queue)
  - publication_eligible: False (requires governance gate per incident)
  - data_retention_days: 365
  - visibility_tier: analyst (never published externally)
"""
from __future__ import annotations

import logging
from datetime import datetime

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

logger = logging.getLogger(__name__)

_GOVERNANCE_WARNING = (
    "Commercial AIS adapter is Tier 3 / licensed. "
    "Set AIS_COMMERCIAL_API_KEY and governance_approved=True before enabling. "
    "Returning empty document list."
)


class CommercialAisAdapter(BaseSourceAdapter):
    definition = SourceDefinition(
        name="Commercial AIS (Placeholder)",
        slug="ais-commercial",
        source_type="api",
        trust_tier=3,
        authority_level="licensed",
        base_url=None,  # Set via AIS_COMMERCIAL_BASE_URL
        update_cadence_seconds=86_400,
        governance_approved=False,
        is_active=False,
        config={
            "note": "Licensed feed; requires contract credential and governance approval",
            "source_class": "source-of-record",
            "sensitivity_class": "licensed",
            "review_required": True,
            "publication_eligible": False,
            "data_retention_days": 365,
            "visibility_tier": "analyst",
        },
    )

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key: str | None = getattr(settings, "ais_commercial_api_key", None)
        self._base_url: str | None = getattr(settings, "ais_commercial_base_url", None)

    async def fetch_documents(
        self,
        limit: int,
        since: datetime | None = None,
    ) -> list[RawDocument]:
        """
        Production implementation will:
          1. Authenticate with licensed AIS provider
          2. Query vessel track data within configured AOI (areas of interest)
          3. Return RawDocument per vessel record with metadata:
               - MMSI, vessel name, flag state, position, speed, heading
               - Destination port, ETA
          4. Documents enter source_review_queue before any publication

        Governance gate: returns empty list until credentials configured
        and governance_approved is True.
        """
        if not self._api_key:
            logger.warning(_GOVERNANCE_WARNING)
            return []

        # TODO(phase-5): Implement licensed AIS API calls
        # from narad.adapters.tier3._ais_client import AisApiClient
        # client = AisApiClient(self._api_key, self._base_url)
        # vessels = await client.get_vessels(limit=limit, since=since)
        # return [self._to_raw_document(v) for v in vessels]

        logger.info("CommercialAisAdapter: API key present but connector not yet implemented; returning empty.")
        return []

    # --- Private helpers (to be implemented when connector activates) ---

    def _to_raw_document(self, vessel: dict) -> RawDocument:
        """Convert a licensed AIS vessel record to a minimized RawDocument."""
        mmsi = str(vessel.get("mmsi", "unknown"))
        vessel_name = str(vessel.get("shipname", "Unknown Vessel"))
        flag = str(vessel.get("flag", "unknown"))
        lat = float(vessel.get("lat", 0))
        lon = float(vessel.get("lon", 0))

        return RawDocument(
            external_id=f"ais-{mmsi}",
            title=f"AIS: {vessel_name} ({flag})",
            body_text=(
                f"Vessel: {vessel_name}\nMMSI: {mmsi}\nFlag: {flag}\n"
                f"Position: {lat:.4f}N {lon:.4f}E\n"
                f"Speed: {vessel.get('speed', '?')} kn\n"
                f"Destination: {vessel.get('destination', 'unknown')}"
            ),
            doc_type="ais_vessel_position",
            published_at=None,
            original_language="en",
            geometry=(lat, lon) if lat and lon else None,
            metadata={
                "mmsi": mmsi,
                "flag": flag,
                "sensitivity_class": "licensed",
                "review_required": True,
                "publication_eligible": False,
            },
        )
