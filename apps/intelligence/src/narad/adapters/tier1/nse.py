from __future__ import annotations

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import fetch_text, is_after, rss_documents

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
    "Referer": "https://www.nseindia.com/rss-feed",
    "Origin": "https://www.nseindia.com",
}


class NseAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="NSE RSS",
            slug="nse_rss",
            source_type="rss",
            trust_tier=1,
            authority_level="official",
            base_url="https://www.nseindia.com",
            update_cadence_seconds=600,
            config={"rss_url": "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        xml_text = await fetch_text(
            self.definition.config["rss_url"],
            headers=NSE_HEADERS,
            bootstrap_url="https://www.nseindia.com/rss-feed",
        )

        documents = rss_documents(
            xml_text,
            limit=limit,
            source_slug=self.definition.slug,
            doc_type="filing",
            metadata_factory=lambda item: {
                "source": "nse",
                "category": item.findtext("category", default="") or "",
            },
        )
        return [document for document in documents if is_after(document.published_at, since)]
