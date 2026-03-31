from __future__ import annotations

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import best_excerpt, collect_links, fetch_text, stable_external_id

INDIA_CODE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.indiacode.nic.in/",
    "Origin": "https://www.indiacode.nic.in",
    "Upgrade-Insecure-Requests": "1",
}


class IndiaCodeAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="India Code",
            slug="india_code",
            source_type="portal",
            trust_tier=1,
            authority_level="official",
            base_url="https://www.indiacode.nic.in/",
            update_cadence_seconds=3600,
            config={"landing_url": "https://www.indiacode.nic.in/"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        html_text = await fetch_text(
            self.definition.config["landing_url"],
            headers=INDIA_CODE_HEADERS,
            bootstrap_url=self.definition.config["landing_url"],
        )
        links = collect_links(html_text, self.definition.base_url or self.definition.config["landing_url"])
        page_excerpt = best_excerpt(html_text)
        documents: list[RawDocument] = []

        for link in links:
            lower = f"{link.text} {link.href}".lower()
            if not any(keyword in lower for keyword in ("act", "amendment", "law", "handle", "notification", "bill")):
                continue
            title = link.text or "India Code update"
            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, link.href, title),
                    title=title,
                    body_text=page_excerpt or title,
                    doc_type="bill",
                    fetch_url=link.href,
                    original_language="en",
                    metadata={
                        "source": "india_code",
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
                    title=link.text or "India Code update",
                    body_text=page_excerpt or link.text,
                    doc_type="bill",
                    fetch_url=link.href,
                    original_language="en",
                    metadata={"source": "india_code", "link_text": link.text},
                )
            )

        return documents
