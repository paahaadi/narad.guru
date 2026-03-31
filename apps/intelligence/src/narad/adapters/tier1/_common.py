from __future__ import annotations

import hashlib
import html
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx

from narad.adapters.base import RawDocument

USER_AGENT = "narad-intelligence/0.1 (+https://narad.guru)"
TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return WHITESPACE_RE.sub(" ", html.unescape(value)).strip()


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    return clean_text(TAG_RE.sub(" ", value))


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        parsed = None
    if parsed is not None:
        return parsed
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_after(candidate: datetime | None, since: datetime | None) -> bool:
    if candidate is None:
        return True
    if since is None:
        return True
    if candidate.tzinfo is None and since.tzinfo is not None:
        candidate = candidate.replace(tzinfo=since.tzinfo)
    elif candidate.tzinfo is not None and since.tzinfo is None:
        since = since.replace(tzinfo=candidate.tzinfo)
    return candidate > since


async def fetch_text(
    url: str,
    *,
    timeout: float = 30.0,
    headers: dict[str, str] | None = None,
    bootstrap_url: str | None = None,
) -> str:
    request_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if headers:
        request_headers.update(headers)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=request_headers) as client:
        if bootstrap_url:
            bootstrap_response = await client.get(bootstrap_url)
            bootstrap_response.raise_for_status()
        response = await client.get(url)
        response.raise_for_status()
        return response.text


def find_text_any(node: ElementTree.Element, names: tuple[str, ...]) -> str | None:
    def matches(tag: str, candidate: str) -> bool:
        if tag == candidate:
            return True
        if candidate.startswith("{") and "}" in candidate:
            return tag == candidate
        if "}" in tag:
            return tag.rsplit("}", 1)[-1] == candidate.rsplit(":", 1)[-1]
        return tag.rsplit(":", 1)[-1] == candidate.rsplit(":", 1)[-1]

    for child in node.iter():
        if child.text and child.text.strip():
            for name in names:
                if matches(child.tag, name):
                    return child.text.strip()
    for name in names:
        try:
            value = node.findtext(name)
        except SyntaxError:
            value = None
        if value and value.strip():
            return value.strip()
    return None


def stable_external_id(*parts: str) -> str:
    digest = hashlib.sha1("|".join(part.strip() for part in parts if part).encode("utf-8")).hexdigest()
    return digest[:24]


def rss_documents(
    xml_text: str,
    *,
    limit: int,
    source_slug: str,
    doc_type: str,
    original_language: str = "en",
    metadata_factory: Callable[[ElementTree.Element], dict[str, object]] | None = None,
    title_fallback: str = "Untitled update",
) -> list[RawDocument]:
    root = ElementTree.fromstring(xml_text)
    items = root.findall(".//item")
    documents: list[RawDocument] = []

    for item in items[:limit]:
        title = clean_text(find_text_any(item, ("title",))) or title_fallback
        description = strip_html(find_text_any(item, ("description", "content", "{http://purl.org/rss/1.0/modules/content/}encoded")))
        link = clean_text(find_text_any(item, ("link",))) or None
        guid = clean_text(find_text_any(item, ("guid",))) or link or stable_external_id(source_slug, title, link or "")
        published_at = parse_datetime(find_text_any(item, ("pubDate", "published", "updated")))
        metadata = {"feed_slug": source_slug}
        if metadata_factory is not None:
            metadata.update(metadata_factory(item))

        documents.append(
            RawDocument(
                external_id=guid,
                title=title,
                body_text=description or title,
                doc_type=doc_type,
                fetch_url=link,
                published_at=published_at,
                original_language=original_language,
                metadata=metadata,
            )
        )

    return documents


@dataclass(slots=True)
class LinkCandidate:
    href: str
    text: str
    attrs: dict[str, str]


class AnchorCollector(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.links: list[LinkCandidate] = []
        self._current_href: str | None = None
        self._current_attrs: dict[str, str] = {}
        self._current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "a":
            self._current_href = None
            self._current_attrs = {}
            self._current_text = []
            for key, value in attrs:
                if value is not None:
                    lowered = key.lower()
                    self._current_attrs[lowered] = value
                    if lowered == "href":
                        self._current_href = value

    def handle_data(self, data: str) -> None:
        if self._current_href is not None:
            self._current_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._current_href is not None:
            href = urljoin(self.base_url, self._current_href)
            text = clean_text("".join(self._current_text)) or href
            self.links.append(LinkCandidate(href=href, text=text, attrs=dict(self._current_attrs)))
            self._current_href = None
            self._current_attrs = {}
            self._current_text = []


def collect_links(html_text: str, base_url: str) -> list[LinkCandidate]:
    parser = AnchorCollector(base_url)
    parser.feed(html_text)
    parser.close()
    return parser.links


def best_excerpt(html_text: str, *, limit: int = 280) -> str:
    text = clean_text(TAG_RE.sub(" ", html_text))
    return text[:limit]


def maybe_geometry(attrs: dict[str, str]) -> tuple[float, float] | None:
    candidates = (
        ("lat", "lon"),
        ("latitude", "longitude"),
        ("data-lat", "data-lon"),
    )
    for lat_key, lon_key in candidates:
        lat = attrs.get(lat_key)
        lon = attrs.get(lon_key)
        if lat and lon:
            try:
                return float(lat), float(lon)
            except ValueError:
                continue
    return None
