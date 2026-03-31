from __future__ import annotations

import re
from datetime import datetime

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import collect_links, fetch_text, maybe_geometry, stable_external_id

DFSRA_TITLE = "Daily Flood Situation Report cum Advisories"
INDIA_CENTROID = (20.5937, 78.9629)
LAST_UPDATED_RE = re.compile(
    r"Last updated:\s*(\d{2}-\d{2}-\d{4})(?:\s+(\d{1,2}:\d{2}\s*[ap]m))?",
    re.IGNORECASE,
)


def _parse_last_updated(html_text: str) -> datetime | None:
    match = LAST_UPDATED_RE.search(html_text)
    if match is None:
        return None
    date_part = match.group(1)
    time_part = match.group(2)
    if time_part:
        try:
            return datetime.strptime(f"{date_part} {time_part.upper()}", "%d-%m-%Y %I:%M %p")
        except ValueError:
            return None
    try:
        return datetime.strptime(date_part, "%d-%m-%Y")
    except ValueError:
        return None


class CwcAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="Central Water Commission",
            slug="cwc",
            source_type="portal",
            trust_tier=1,
            authority_level="official",
            base_url="https://cwc.gov.in",
            update_cadence_seconds=900,
            config={"landing_url": "https://cwc.gov.in/en/fmo/dfsra"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        html_text = await fetch_text(self.definition.config["landing_url"])
        links = collect_links(html_text, self.definition.base_url or self.definition.config["landing_url"])
        published_at = _parse_last_updated(html_text)
        documents: list[RawDocument] = []

        for link in links:
            lower = f"{link.text} {link.href}".lower()
            if not (
                link.href.lower().endswith(".pdf")
                or any(keyword in lower for keyword in ("flood", "bulletin", "forecast", "warning", "river", "water"))
            ):
                continue
            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, link.href, link.text),
                    title=link.text,
                    body_text=f"{DFSRA_TITLE}. {link.text}".strip(),
                    doc_type="forecast",
                    fetch_url=link.href,
                    published_at=published_at,
                    original_language="en",
                    geometry=maybe_geometry(link.attrs),
                    metadata={
                        "source": "cwc",
                        "bulletin_text": link.text,
                    },
                )
            )
            if len(documents) >= limit:
                break

        if not documents:
            body_text = DFSRA_TITLE
            if published_at is not None:
                body_text = f"{body_text}. Last updated {published_at.strftime('%d-%m-%Y %I:%M %p')}"
            documents.append(
                RawDocument(
                    external_id=stable_external_id(
                        self.definition.slug,
                        self.definition.config["landing_url"],
                        published_at.isoformat() if published_at is not None else DFSRA_TITLE,
                    ),
                    title=DFSRA_TITLE,
                    body_text=body_text,
                    doc_type="forecast",
                    fetch_url=str(self.definition.config["landing_url"]),
                    published_at=published_at,
                    original_language="en",
                    geometry=INDIA_CENTROID,
                    metadata={
                        "source": "cwc",
                        "page": "dfsra",
                        "last_updated": published_at.isoformat() if published_at is not None else None,
                        "coverage": "national",
                        "geometry_strategy": "india_centroid",
                    },
                )
            )

        return documents
