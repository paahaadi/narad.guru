from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from narad.adapters.tier2.acled import AcledAdapter
from narad.adapters.tier2.firms import FirmsAdapter
from narad.adapters.tier2.gdelt import GdeltAdapter
from narad.adapters.tier2.google_news import GoogleNewsAdapter
from narad.adapters.tier2.news_api import NewsApiAdapter
from narad.adapters.tier2.opensky import OpenSkyAdapter


def _mock_httpx_response(body: str, status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.text = body
    resp.json.return_value = json.loads(body) if body.strip().startswith(("{", "[")) else {}
    resp.raise_for_status = MagicMock()
    return resp


@pytest.mark.asyncio
async def test_acled_adapter_parses_conflict_events(settings) -> None:
    payload = json.dumps({
        "data": [
            {
                "data_id": "12345",
                "event_date": "2026-03-28",
                "event_type": "Battles",
                "sub_event_type": "Armed clash",
                "actor1": "Group A",
                "actor2": "Group B",
                "country": "India",
                "admin1": "Chhattisgarh",
                "latitude": "19.10",
                "longitude": "81.95",
                "fatalities": "3",
                "notes": "Armed clash in Bastar district.",
            },
        ],
    })

    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier2.acled.httpx.AsyncClient", return_value=mock_client):
        adapter = AcledAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.doc_type == "event"
    assert doc.geometry == (19.10, 81.95)
    assert doc.metadata["source"] == "acled"
    assert "Battles" in doc.title


@pytest.mark.asyncio
async def test_firms_adapter_parses_fire_hotspots(settings) -> None:
    csv_body = (
        "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,"
        "confidence,version,bright_t31,frp,daynight\n"
        "24.5,85.3,320.5,1.0,1.0,2026-03-28,0630,N,85,2.0,290.1,18.5,D\n"
    )

    mock_resp = _mock_httpx_response(csv_body)
    mock_resp.text = csv_body
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier2.firms.httpx.AsyncClient", return_value=mock_client):
        adapter = FirmsAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.doc_type == "event"
    assert doc.geometry == (24.5, 85.3)
    assert doc.metadata["source"] == "firms"


@pytest.mark.asyncio
async def test_opensky_adapter_parses_aircraft_telemetry(settings) -> None:
    payload = json.dumps({
        "time": 1711612800,
        "states": [
            [
                "a12345",       # icao24
                "AIC101  ",     # callsign
                "India",        # origin_country
                1711612800,     # time_position
                1711612800,     # last_contact
                77.1,           # longitude
                28.6,           # latitude
                10000.0,        # baro_altitude
                False,          # on_ground
                250.0,          # velocity
                90.0,           # true_track
                0.0,            # vertical_rate
                None,           # sensors
                10100.0,        # geo_altitude
                "1234",         # squawk
                False,          # spi
                0,              # position_source
            ],
        ],
    })

    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier2.opensky.httpx.AsyncClient", return_value=mock_client):
        adapter = OpenSkyAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.doc_type == "telemetry"
    assert doc.geometry == (28.6, 77.1)
    assert doc.metadata["source"] == "opensky"


@pytest.mark.asyncio
async def test_gdelt_adapter_parses_news_events(settings) -> None:
    payload = json.dumps({
        "articles": [
            {
                "url": "https://example.com/article1",
                "title": "India trade policy update",
                "seendate": "20260328T120000Z",
                "domain": "example.com",
                "language": "English",
                "sourcecountry": "India",
                "tone": "-2.5",
            },
        ],
    })

    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier2.gdelt.httpx.AsyncClient", return_value=mock_client):
        adapter = GdeltAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.metadata["source"] == "gdelt"
    assert "India" in doc.title


@pytest.mark.asyncio
async def test_google_news_adapter_parses_rss(settings) -> None:
    rss_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0">'
        '<channel>'
        '<item>'
        '<title>Breaking News India</title>'
        '<link>https://news.google.com/test1</link>'
        '<pubDate>Mon, 06 Apr 2026 10:00:00 GMT</pubDate>'
        '<description>Details about breaking news.</description>'
        '</item>'
        '</channel>'
        '</rss>'
    )
    
    with patch("narad.adapters.tier2.google_news.fetch_text", return_value=rss_xml):
        adapter = GoogleNewsAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)
        
    assert len(docs) == 1
    doc = docs[0]
    assert doc.title == "Breaking News India"
    assert doc.doc_type == "news_report"
    assert doc.metadata["source"] == "google_news"


@pytest.mark.asyncio
async def test_news_api_adapter_parses_json(settings) -> None:
    settings.newsapi_key = "test_key"
    payload = json.dumps({
        "status": "ok",
        "totalResults": 1,
        "articles": [
            {
                "source": {"id": "reuters", "name": "Reuters"},
                "author": "John Doe",
                "title": "Market Rally in Mumbai",
                "description": "Indian markets hit record highs.",
                "url": "https://reuters.com/india-news",
                "publishedAt": "2026-04-06T12:00:00Z",
                "content": "Full content here."
            }
        ]
    })
    
    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier2.news_api.httpx.AsyncClient", return_value=mock_client):
        adapter = NewsApiAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.title == "Market Rally in Mumbai"
    assert doc.metadata["source_name"] == "Reuters"
    assert doc.metadata["author"] == "John Doe"

