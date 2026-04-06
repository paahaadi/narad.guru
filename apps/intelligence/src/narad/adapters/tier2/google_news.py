"""Google News RSS Adapter — Tier 2 open news aggregator."""

from __future__ import annotations

from datetime import datetime

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.adapters.tier1._common import fetch_text, is_after, rss_documents
from narad.config import Settings

_DEFAULT_GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search?q=India&hl=en-IN&gl=IN&ceid=IN:en"
)

class GoogleNewsAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="Google News (India)",
            slug="google-news",
            source_type="rss",
            trust_tier=2,
            authority_level="open_data",
            base_url="https://news.google.com",
            update_cadence_seconds=900,  # 15 minutes
            config={"rss_url": _DEFAULT_GOOGLE_NEWS_RSS},
        )

    async def fetch_documents(self, limit: int, since: datetime | None = None) -> list[RawDocument]:
        """Fetch and parse Google News RSS stream."""
        rss_url = self.definition.config.get("rss_url", _DEFAULT_GOOGLE_NEWS_RSS)
        
        xml_text = await fetch_text(rss_url)
        documents = rss_documents(
            xml_text,
            limit=limit,
            source_slug=self.definition.slug,
            doc_type="news_report",
            metadata_factory=lambda item: {
                "source": "google_news",
                "relevance": "india",
            },
        )
        # Filter by 'since' timestamp
        return [doc for doc in documents if is_after(doc.published_at, since)]
