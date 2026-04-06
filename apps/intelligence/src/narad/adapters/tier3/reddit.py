"""Reddit JSON Adapter — Tier 3 social signals."""

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

_REDDIT_INDIA_URL = "https://www.reddit.com/r/india/new.json"

class RedditAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="Reddit Signals",
            slug="reddit",
            source_type="api",
            trust_tier=3,
            authority_level="weak_signal",
            base_url="https://www.reddit.com",
            update_cadence_seconds=1800,  # 30 minutes
            config={
                "source_class": "weak-signal",
                "sensitivity_class": "socmint",
                "review_required": True,
                "publication_eligible": False,
                "minimization_applied": True,
            },
        )
        self._user_agent = settings.reddit_user_agent or USER_AGENT

    async def fetch_documents(self, limit: int, since: datetime | None = None) -> list[RawDocument]:
        """Fetch matching posts; apply strict DPDPA minimization."""
        logger.warning(GOVERNANCE_WARNING)

        headers = {"User-Agent": self._user_agent}
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
            # Querying /r/india/new
            response = await client.get(_REDDIT_INDIA_URL, params={"limit": min(limit, 100)})
            response.raise_for_status()
            payload = response.json()

        children: list[dict] = payload.get("data", {}).get("children", [])
        documents: list[RawDocument] = []

        for child in children:
            data = child.get("data", {})
            raw_title = str(data.get("title", ""))
            raw_text = str(data.get("selftext", ""))
            if not raw_title:
                continue

            # Minimized combined content
            full_text = f"{raw_title}\n{raw_text}"
            fingerprint = content_fingerprint(full_text)
            minimized_text = apply_minimization(full_text)
            
            # Reddit timestamp is in seconds
            published_at = datetime.fromtimestamp(data.get("created_utc", 0))
            
            documents.append(
                RawDocument(
                    external_id=f"reddit-{fingerprint[:16]}",
                    title=f"[Reddit] {minimized_text[:80]}",
                    body_text=minimized_text[:3000],
                    doc_type="socmint_signal",
                    published_at=published_at,
                    original_language="en",
                    metadata={
                        "source": "reddit",
                        "platform": "reddit",
                        "subreddit": data.get("subreddit"),
                        "content_fingerprint": fingerprint,
                        "review_required": True,
                        "minimization_applied": True,
                        "sensitivity_class": "socmint",
                    },
                )
            )

        return documents
