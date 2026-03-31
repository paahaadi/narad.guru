from __future__ import annotations

import pytest

import narad.adapters.tier1.cwc as cwc_module
from narad.adapters.tier1.cwc import CwcAdapter


@pytest.mark.asyncio
async def test_cwc_adapter_emits_fallback_advisory_document_when_page_has_no_links(settings, monkeypatch) -> None:
    html = """
    <html>
      <head><title>Daily Flood Situation Report cum Advisories</title></head>
      <body>
        <div>Daily Flood Situation Report cum Advisories</div>
        <div>Last updated: 27-03-2026 4:33 pm</div>
      </body>
    </html>
    """

    async def fake_fetch_text(url: str, **_: object) -> str:
        assert url == "https://cwc.gov.in/en/fmo/dfsra"
        return html

    monkeypatch.setattr(cwc_module, "fetch_text", fake_fetch_text)
    monkeypatch.setattr(cwc_module, "collect_links", lambda *_args, **_kwargs: [])

    adapter = CwcAdapter(settings)
    documents = await adapter.fetch_documents(limit=5)

    assert len(documents) == 1
    document = documents[0]
    assert document.title == "Daily Flood Situation Report cum Advisories"
    assert document.fetch_url == "https://cwc.gov.in/en/fmo/dfsra"
    assert document.doc_type == "forecast"
    assert document.geometry == cwc_module.INDIA_CENTROID
    assert document.metadata["source"] == "cwc"
    assert document.metadata["page"] == "dfsra"
    assert document.metadata["last_updated"] == "2026-03-27T16:33:00"
    assert document.metadata["coverage"] == "national"
    assert document.metadata["geometry_strategy"] == "india_centroid"
    assert "Last updated 27-03-2026 04:33 PM" in document.body_text
