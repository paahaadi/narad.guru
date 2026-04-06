from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from narad.adapters.tier3.reddit import RedditAdapter
from narad.adapters.tier3.twitter import TwitterAdapter


def _mock_httpx_response(body: str, status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.text = body
    resp.json.return_value = json.loads(body) if body.strip().startswith(("{", "[")) else {}
    resp.raise_for_status = MagicMock()
    return resp


@pytest.mark.asyncio
async def test_twitter_adapter_minimizes_data(settings) -> None:
    settings.twitter_bearer_token = "test_token"
    payload = json.dumps({
        "data": [
            {
                "id": "1",
                "text": "Call me at +919876543210 or email amit@example.com. Follow @amit_dev.",
                "created_at": "2026-04-06T10:00:00Z",
                "lang": "en"
            }
        ]
    })
    
    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier3.twitter.httpx.AsyncClient", return_value=mock_client):
        adapter = TwitterAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    # Verify minimization
    assert "+919876543210" not in doc.body_text
    assert "[phone]" in doc.body_text
    assert "amit@example.com" not in doc.body_text
    assert "[email]" in doc.body_text
    assert "@amit_dev" not in doc.body_text
    assert "@[handle]" in doc.body_text
    assert doc.metadata["source"] == "twitter"


@pytest.mark.asyncio
async def test_reddit_adapter_minimizes_data(settings) -> None:
    payload = json.dumps({
        "data": {
            "children": [
                {
                    "data": {
                        "title": "Crisis at @SecretLocation",
                        "selftext": "Contact +910000000000",
                        "created_utc": 1712397600,
                        "subreddit": "india"
                    }
                }
            ]
        }
    })
    
    mock_resp = _mock_httpx_response(payload)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("narad.adapters.tier3.reddit.httpx.AsyncClient", return_value=mock_client):
        adapter = RedditAdapter(settings)
        docs = await adapter.fetch_documents(limit=5)

    assert len(docs) == 1
    doc = docs[0]
    assert "@[handle]" in doc.body_text
    assert "[phone]" in doc.body_text
    assert doc.metadata["platform"] == "reddit"
