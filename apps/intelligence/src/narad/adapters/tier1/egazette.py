from __future__ import annotations

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import best_excerpt, collect_links, fetch_text, maybe_geometry, stable_external_id


class EgazetteAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="Gazette of India",
            slug="egazette",
            source_type="portal",
            trust_tier=1,
            authority_level="official",
            base_url="https://egazette.gov.in",
            update_cadence_seconds=1800,
            config={"landing_url": "https://egazette.gov.in"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        html_text = await fetch_text(self.definition.config["landing_url"])
        links = collect_links(html_text, self.definition.base_url or self.definition.config["landing_url"])
        page_excerpt = best_excerpt(html_text)
        documents: list[RawDocument] = []

        for link in links:
            lower = f"{link.text} {link.href}".lower()
            if not any(keyword in lower for keyword in ("gazette", "notification", ".pdf", "ordinance", "gaz")):
                continue
            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, link.href, link.text),
                    title=link.text,
                    body_text=page_excerpt or link.text,
                    doc_type="gazette",
                    fetch_url=link.href,
                    original_language="en",
                    geometry=maybe_geometry(link.attrs),
                    metadata={
                        "source": "egazette",
                        "link_text": link.text,
                    },
                )
            )
            if len(documents) >= limit:
                break

        if not documents and links:
            link = links[0]
            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, link.href, link.text),
                    title=link.text,
                    body_text=page_excerpt or link.text,
                    doc_type="gazette",
                    fetch_url=link.href,
                    original_language="en",
                    metadata={"source": "egazette", "link_text": link.text},
                )
            )

        return documents
