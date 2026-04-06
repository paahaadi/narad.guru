"""
SOCMINT Public Signals Base & Utilities
========================================
Track 4C: Tier 3 social intelligence feed — public collection only.
Contains shared logic for data minimization (DPDPA compliance) and fingerprinting.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

logger = logging.getLogger(__name__)

GOVERNANCE_WARNING = (
    "SOCMINT collection active. Only public content will be collected. "
    "All signals enter the governance review queue before any use. "
    "Personal identifiers minimized per DPDPA §5."
)

# Patterns for data minimization: names, handles, phone numbers
MINIMIZE_PATTERNS = [
    (re.compile(r"\b[\w.%-]+@[\w.-]+\.\w{2,}\b"), "[email]"),   # email addresses
    (re.compile(r"(?<!\w)@[\w.]+"), "@[handle]"),              # social handles (non-word boundary aware)
    (re.compile(r"\+?[0-9]{10,13}"), "[phone]"),                # phone numbers
    (re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b"), "[name]"),    # proper names (conservative)
]


def apply_minimization(text: str) -> str:
    """Strip personal identifiers from text per DPDPA §5 data minimization."""
    for pattern, replacement in MINIMIZE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text.strip()


def content_fingerprint(text: str) -> str:
    """SHA-256 fingerprint of raw content for deduplication without storing verbatim."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class SocmintPublicAdapter(BaseSourceAdapter):
    """
    Coordinator for SOCMINT sources. 
    In production, this might delegate to specific platform streamers.
    """
    definition = SourceDefinition(
        name="SOCMINT Coordinator",
        slug="socmint-public",
        source_type="coordinator",
        trust_tier=3,
        authority_level="weak_signal",
        base_url=None,
        update_cadence_seconds=3_600,
        governance_approved=False,
        is_active=False,
        config={
            "note": "Coordinator for platform collectors; strict minimization applied",
            "source_class": "weak-signal",
            "sensitivity_class": "socmint",
            "review_required": True,
            "publication_eligible": False,
            "visibility_tier": "internal",
            "minimization_applied": True,
            "data_retention_days": 90,
            "volatility_flag": True,
        },
    )

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def fetch_documents(
        self,
        limit: int,
        since: datetime | None = None,
    ) -> list[RawDocument]:
        """Coordinator fetch - currently handled by platform-specific adapters in registry."""
        return []
