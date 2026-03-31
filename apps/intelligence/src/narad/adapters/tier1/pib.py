from __future__ import annotations

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import fetch_text, find_text_any, is_after, rss_documents

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
}


def _extract_ministry(item) -> str:
    return (
        find_text_any(item, ("category",))
        or find_text_any(item, ("dc:creator", "{http://purl.org/dc/elements/1.1/}creator"))
        or ""
    )


class PIBAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="PIB RSS",
            slug="pib_rss",
            source_type="rss",
            trust_tier=1,
            authority_level="official",
            base_url="https://pib.gov.in",
            update_cadence_seconds=300,
            config={"rss_url": settings.pib_rss_url},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        xml_text = await fetch_text(
            self._settings.pib_rss_url,
            headers=BROWSER_HEADERS,
            bootstrap_url="https://www.pib.gov.in/",
        )
        documents = rss_documents(
            xml_text,
            limit=limit,
            source_slug=self.definition.slug,
            doc_type="press_release",
            metadata_factory=lambda item: {
                "source": "pib",
                "ministry": _extract_ministry(item),
            },
        )
        return [document for document in documents if is_after(document.published_at, since)]
