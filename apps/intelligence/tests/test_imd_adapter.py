from __future__ import annotations

import pytest

import narad.adapters.tier1.imd as imd_module
from narad.adapters.tier1.imd import ImdAdapter


@pytest.mark.asyncio
async def test_imd_adapter_emits_geolocated_station_documents_from_embedded_feed(settings, monkeypatch) -> None:
    html = """
    <html>
      <body>
        <script>
          var stationPayload = {
            "stations": [
              {
                "latitude": 28.61,
                "longitude": 77.21,
                "label": "New Delhi",
                "title": "New Delhi",
                "state_code": "IN-DL",
                "station_id": "42182",
                "ajaxUrl": "responsive/LIP/sample4State.php"
              }
            ]
          };
        </script>
      </body>
    </html>
    """

    async def fake_fetch_text(url: str, **_: object) -> str:
        assert url == "https://mausam.imd.gov.in"
        return html

    monkeypatch.setattr(imd_module, "fetch_text", fake_fetch_text)
    monkeypatch.setattr(imd_module, "collect_links", lambda *_args, **_kwargs: [])

    adapter = ImdAdapter(settings)
    documents = await adapter.fetch_documents(limit=5)

    assert len(documents) == 1
    document = documents[0]
    assert document.title == "IMD station weather update: New Delhi"
    assert document.doc_type == "telemetry"
    assert document.geometry == (28.61, 77.21)
    assert document.fetch_url == "https://mausam.imd.gov.in/responsive/LIP/sample4State.php"
    assert document.metadata["source"] == "imd"
    assert document.metadata["feed"] == "station_map"
    assert document.metadata["station_id"] == "42182"
    assert document.metadata["state_code"] == "IN-DL"
