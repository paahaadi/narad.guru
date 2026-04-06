"""
SOCMINT Public Signals Adapter
================================
Track 4C: Tier 3 social intelligence feed — public collection only.

Governance rules (hardcoded, non-negotiable):
  - trust_tier: 3
  - source_class: weak-signal (SOCMINT is corroborating signal only)
  - sensitivity_class: socmint
  - review_required: True (ALL records)
  - publication_eligible: False (SOCMINT never directly published)
  - visibility_tier: internal (raw signals never surface beyond analysts)
  - minimization_applied: True (names/handles stripped before storage)
  - data_retention_days: 90 (shorter retention per DPDPA minimization)
  - volatility_flag: True (content subject to deletion/takedown)

DPDPA Compliance:
  - Only public content is collected (no private/direct message scraping)
  - Personal identifiers are hashed or removed before storage
  - Content is stored only as a canonical claim/signal, not raw verbatim
  - Retention is bounded at 90 days
  - Analyst review required before any SOCMINT influences a published output

Data flow:
  RawDocument → ingestion pipeline → socmint_signals table
    → source_review_queue (review_type='socmint-gate')
    → canonical entity/event (if approved)
    → briefing/investigation (only if analyst explicitly links)
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

logger = logging.getLogger(__name__)

_GOVERNANCE_WARNING = (
    "SOCMINT adapter active. Only public content will be collected. "
    "All signals enter the governance review queue before any use. "
    "Personal identifiers will be minimized per DPDPA §5 data minimization."
)

# Patterns for data minimization: names, handles, phone numbers
_MINIMIZE_PATTERNS = [
    (re.compile(r"@[\w.]+"), "@[handle]"),                      # social handles
    (re.compile(r"\+?[0-9]{10,13}"), "[phone]"),                # phone numbers
    (re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b"), "[name]"),    # proper names (conservative)
    (re.compile(r"\b[\w.%-]+@[\w.-]+\.\w{2,}\b"), "[email]"),   # email addresses
]


def _apply_minimization(text: str) -> str:
    """Strip personal identifiers from text per DPDPA §5 data minimization."""
    for pattern, replacement in _MINIMIZE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text.strip()


def _content_fingerprint(text: str) -> str:
    """SHA-256 fingerprint of raw content for deduplication without storing verbatim."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class SocmintPublicAdapter(BaseSourceAdapter):
    definition = SourceDefinition(
        name="SOCMINT Public Signals",
        slug="socmint-public",
        source_type="scrape",
        trust_tier=3,
        authority_level="weak_signal",
        base_url=None,
        update_cadence_seconds=3_600,
        governance_approved=False,
        is_active=False,
        config={
            "note": "Public collection only; strict minimization and governance review required",
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
        """
        Production implementation will:
          1. Query configured keywords/entities from public social APIs
          2. Apply minimization BEFORE storing any content
          3. Generate a fingerprint of the raw content (store fingerprint, not verbatim)
          4. Return RawDocument with minimized body_text
          5. All documents tagged with review_required=True

        Currently returns empty list (governance gate: is_active=False).
        """
        if not self.definition.is_active:
            logger.debug("SOCMINT adapter inactive; governance gate not cleared. Returning empty.")
            return []

        logger.warning(_GOVERNANCE_WARNING)

        # TODO(phase-5): Implement SOCMINT collection
        # signals = await self._collect_public_signals(limit=limit, since=since)
        # return [self._to_raw_document(s) for s in signals]

        return []

    def _to_raw_document(self, signal: dict) -> RawDocument:
        """
        Convert a raw social signal to a minimized RawDocument.
        - Minimizes personal identifiers
        - Stores content fingerprint in metadata (not the raw text itself)
        - Flags for mandatory review queue
        """
        raw_text: str = signal.get("text", "")
        fingerprint = _content_fingerprint(raw_text)
        minimized_text = _apply_minimization(raw_text)

        platform = str(signal.get("platform", "unknown"))
        signal_type = str(signal.get("signal_type", "signal"))
        keywords = signal.get("matched_keywords", [])

        return RawDocument(
            external_id=f"socmint-{fingerprint[:16]}",
            title=f"[SOCMINT/{platform.upper()}] {minimized_text[:80]}",
            body_text=minimized_text[:2000],  # Cap at 2000 chars
            doc_type="socmint_signal",
            published_at=None,
            original_language=signal.get("language", "en"),
            geometry=None,
            metadata={
                "platform": platform,
                "signal_type": signal_type,
                "content_fingerprint": fingerprint,
                "matched_keywords": keywords,
                "minimization_applied": True,
                "review_required": True,
                "publication_eligible": False,
                "visibility_tier": "internal",
                "sensitivity_class": "socmint",
                "retain_days": 90,
            },
        )
