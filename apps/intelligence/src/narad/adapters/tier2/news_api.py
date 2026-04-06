"""NewsAPI.org Adapter — Tier 2 commercial intelligence aggregator."""

from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)

_NEWS_API_BASE_URL = "https://newsapi.org/v2/everything"

class NewsApiAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="NewsAPI (Commercial)",
            slug="news-api",
            source_type="api",
            trust_tier=2,
            authority_level="commercial_aggregator",
            base_url="https://newsapi.org",
            update_cadence_seconds=1800,  # 30 minutes
        )
        self._api_key = settings.newsapi_key

    async def fetch_documents(self, limit: int, since: datetime | None = None) -> list[RawDocument]:
        """Fetch news from newsapi.org."""
        if not self._api_key:
            logger.warning("NewsAPI adapter: NEWSAPI_KEY not configured. Returning empty.")
            return []

        # Construct query: recent India-related news
        params = {
            "q": "India",
            "sortBy": "publishedAt",
            "apiKey": self._api_key,
            "pageSize": min(limit, 100),
            "language": "en",
        }
        
        if since:
            # NewsAPI expects ISO format
            params["from"] = since.isoformat()

        headers = {"User-Agent": USER_AGENT}

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
            response = await client.get(_NEWS_API_BASE_URL, params=params)
            
            if response.status_code == 401:
                logger.error("NewsAPI: Invalid API Key.")
                return []
            
            response.raise_for_status()
            payload = response.json()

        articles: list[dict] = payload.get("articles", [])
        documents: list[RawDocument] = []

        for art in articles:
            url = str(art.get("url", ""))
            title = clean_text(str(art.get("title", "")))
            content = clean_text(str(art.get("description", "") or art.get("content", "")))
            pub_at_str = str(art.get("publishedAt", ""))
            
            if not url or not title:
                continue
                
            published_at = parse_datetime(pub_at_str)
            
            documents.append(
                RawDocument(
                    external_id=stable_external_id("news-api", url, pub_at_str),
                    title=title,
                    body_text=content or title,
                    doc_type="news_report",
                    fetch_url=url,
                    published_at=published_at,
                    original_language="en",
                    metadata={
                        "source": "news_api",
                        "author": art.get("author"),
                        "source_name": art.get("source", {}).get("name"),
                        "raw_json": art,
                    },
                )
            )

        return documents
