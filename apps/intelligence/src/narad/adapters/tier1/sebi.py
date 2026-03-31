from __future__ import annotations

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import fetch_text, find_text_any, is_after, rss_documents


class SebiAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="SEBI RSS",
            slug="sebi_rss",
            source_type="rss",
            trust_tier=1,
            authority_level="official",
            base_url="https://www.sebi.gov.in",
            update_cadence_seconds=900,
            config={"rss_url": "https://www.sebi.gov.in/sebirss.xml"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        xml_text = await fetch_text(self.definition.config["rss_url"])

        def metadata_factory(item) -> dict[str, object]:
            category = find_text_any(item, ("category",)) or ""
            return {
                "source": "sebi",
                "category": category,
                "circular_number": find_text_any(item, ("sebi:circularNumber", "circularNumber", "guid")) or "",
            }

        documents = rss_documents(
            xml_text,
            limit=limit,
            source_slug=self.definition.slug,
            doc_type="circular",
            metadata_factory=metadata_factory,
        )
        return [document for document in documents if is_after(document.published_at, since)]
