from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from narad.adapters.base import BaseSourceAdapter, RawDocument, SourceDefinition
from narad.config import Settings

from ._common import best_excerpt, collect_links, fetch_text, maybe_geometry, stable_external_id

STATIONS_KEY_RE = re.compile(r'"stations"\s*:\s*\[', re.IGNORECASE)


def _extract_station_feed(html_text: str) -> list[dict[str, object]]:
    match = STATIONS_KEY_RE.search(html_text)
    if match is None:
        return []

    start = html_text.find("[", match.start())
    if start == -1:
        return []

    depth = 0
    in_string = False
    escaped = False
    end = -1

    for index in range(start, len(html_text)):
        char = html_text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == "[":
            depth += 1
            continue
        if char == "]":
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end == -1:
        return []

    try:
        payload = json.loads(html_text[start:end])
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


class ImdAdapter(BaseSourceAdapter):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.definition = SourceDefinition(
            name="India Meteorological Department",
            slug="imd",
            source_type="portal",
            trust_tier=1,
            authority_level="official",
            base_url="https://mausam.imd.gov.in",
            update_cadence_seconds=600,
            config={"landing_url": "https://mausam.imd.gov.in"},
        )

    async def fetch_documents(self, limit: int, since=None) -> list[RawDocument]:
        html_text = await fetch_text(self.definition.config["landing_url"])
        page_excerpt = best_excerpt(html_text)
        documents: list[RawDocument] = []
        station_feed = _extract_station_feed(html_text)

        for station in station_feed:
            try:
                latitude = float(station["latitude"])
                longitude = float(station["longitude"])
            except (KeyError, TypeError, ValueError):
                continue

            label = str(station.get("label") or station.get("title") or "").strip()
            if not label:
                continue

            station_id = str(station.get("station_id") or label).strip()
            state_code = str(station.get("state_code") or "").strip() or None
            title = f"IMD station weather update: {label}"
            body_text = f"Live IMD station weather update for {label}"
            if state_code:
                body_text = f"{body_text} ({state_code})"
            body_text = f"{body_text}. Derived from the IMD live station feed."
            ajax_url = station.get("ajaxUrl")
            fetch_url = (
                urljoin(self.definition.base_url or self.definition.config["landing_url"], str(ajax_url))
                if ajax_url
                else self.definition.config["landing_url"]
            )

            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, station_id, label),
                    title=title,
                    body_text=body_text,
                    doc_type="telemetry",
                    fetch_url=fetch_url,
                    original_language="en",
                    geometry=(latitude, longitude),
                    metadata={
                        "source": "imd",
                        "feed": "station_map",
                        "station_id": station_id,
                        "station_label": label,
                        "state_code": state_code,
                    },
                )
            )
            if len(documents) >= limit:
                return documents

        links = collect_links(html_text, self.definition.base_url or self.definition.config["landing_url"])

        for link in links:
            lower = f"{link.text} {link.href}".lower()
            if not any(
                keyword in lower
                for keyword in ("warning", "advisory", "weather", "forecast", "cyclone", "rain", "district")
            ):
                continue
            documents.append(
                RawDocument(
                    external_id=stable_external_id(self.definition.slug, link.href, link.text),
                    title=link.text,
                    body_text=page_excerpt or link.text,
                    doc_type="warning",
                    fetch_url=link.href,
                    original_language="en",
                    geometry=maybe_geometry(link.attrs),
                    metadata={
                        "source": "imd",
                        "warning_text": link.text,
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
                    doc_type="warning",
                    fetch_url=link.href,
                    original_language="en",
                    metadata={"source": "imd", "warning_text": link.text},
                )
            )

        return documents
