"""GDELT Global Events adapter — Tier 2 open data news source."""

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

_GDELT_API_URL = (
    "https://api.gdeltproject.org/api/v2/doc/doc"
    "?query=India&mode=ArtList&maxrecords=250&format=json"
)


def _is_india_relevant(article: dict) -> bool:
    source_country = str(article.get("sourcecountry", "")).lower()
    title = str(article.get("title", "")).lower()
    return "india" in source_country or "india" in title


class GdeltAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="GDELT Global Events",
            slug="gdelt",
            source_type="api",
            trust_tier=2,
            authority_level="open_data",
            base_url="https://api.gdeltproject.org",
            update_cadence_seconds=900,
        )

    async def fetch_documents(
        self, limit: int, since: datetime | None = None
    ) -> list[RawDocument]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers=headers
        ) as client:
            response = await client.get(_GDELT_API_URL)
            response.raise_for_status()

        payload = response.json()
        articles: list[dict] = payload.get("articles", [])

        documents: list[RawDocument] = []
        for article in articles:
            if len(documents) >= limit:
                break

            if not _is_india_relevant(article):
                continue

            url = str(article.get("url", ""))
            title = clean_text(str(article.get("title", "")))
            seendate = str(article.get("seendate", ""))
            domain = str(article.get("domain", ""))
            language = str(article.get("language", ""))
            source_country = str(article.get("sourcecountry", ""))

            if not url or not title:
                continue

            published_at = parse_datetime(seendate)

            body_text = title
            if domain:
                body_text = f"{body_text} (via {domain})"

            documents.append(
                RawDocument(
                    external_id=stable_external_id("gdelt", url, seendate),
                    title=title,
                    body_text=body_text,
                    doc_type="article",
                    fetch_url=url,
                    published_at=published_at,
                    original_language=language or "en",
                    metadata={
                        "source": "gdelt",
                        "event_type": "news_report",
                        "severity": "informational",
                        "domain": domain,
                        "language": language,
                        "sourcecountry": source_country,
                    },
                )
            )

        return documents
