"""Twitter v2 Adapter — Tier 3 social signals."""

from __future__ import annotations

import logging
from datetime import datetime

import httpx
from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.adapters.tier1._common import USER_AGENT, parse_datetime
from narad.adapters.tier3.socmint_public import (
    GOVERNANCE_WARNING,
    apply_minimization,
    content_fingerprint,
)
from narad.config import Settings

logger = logging.getLogger(__name__)

_TWITTER_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"

class TwitterAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="X (Twitter) Signals",
            slug="twitter",
            source_type="api",
            trust_tier=3,
            authority_level="weak_signal",
            base_url="https://api.twitter.com",
            update_cadence_seconds=1800,  # 30 minutes
            config={
                "source_class": "weak-signal",
                "sensitivity_class": "socmint",
                "review_required": True,
                "publication_eligible": False,
                "minimization_applied": True,
            },
        )
        self._bearer_token = settings.twitter_bearer_token

    async def fetch_documents(self, limit: int, since: datetime | None = None) -> list[RawDocument]:
        """Fetch matching tweets; apply strict DPDPA minimization."""
        if not self._bearer_token:
            logger.warning("TwitterAdapter: TWITTER_BEARER_TOKEN not configured. Returning empty.")
            return []

        logger.warning(GOVERNANCE_WARNING)

        # Basic query for India-related crisis signals
        query = "India (crisis OR protest OR hazard OR regulatory)"
        params = {
            "query": query,
            "max_results": min(limit, 100),
            "tweet.fields": "created_at,author_id,lang",
        }
        if since:
            params["start_time"] = since.isoformat(timespec="seconds") + "Z"

        headers = {
            "Authorization": f"Bearer {self._bearer_token}",
            "User-Agent": USER_AGENT,
        }

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
            response = await client.get(_TWITTER_SEARCH_URL, params=params)
            
            if response.status_code == 401:
                logger.error("TwitterAdapter: Invalid Bearer Token.")
                return []
            
            response.raise_for_status()
            payload = response.json()

        tweets: list[dict] = payload.get("data", [])
        documents: list[RawDocument] = []

        for tweet in tweets:
            raw_text = str(tweet.get("text", ""))
            if not raw_text:
                continue

            fingerprint = content_fingerprint(raw_text)
            minimized_text = apply_minimization(raw_text)
            
            published_at = parse_datetime(tweet.get("created_at"))
            
            documents.append(
                RawDocument(
                    external_id=f"twitter-{fingerprint[:16]}",
                    title=f"[Twitter] {minimized_text[:80]}",
                    body_text=minimized_text[:2000],
                    doc_type="socmint_signal",
                    published_at=published_at,
                    original_language=tweet.get("lang", "en"),
                    metadata={
                        "source": "twitter",
                        "platform": "twitter",
                        "content_fingerprint": fingerprint,
                        "review_required": True,
                        "minimization_applied": True,
                        "sensitivity_class": "socmint",
                    },
                )
            )

        return documents
