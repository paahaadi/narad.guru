from __future__ import annotations

import json

import pytest

from narad.db.session import _setup_connection


class FakeConnection:
    def __init__(self) -> None:
        self.executed: list[str] = []
        self.codecs: list[dict[str, object]] = []

    async def execute(self, query: str) -> None:
        self.executed.append(query)

    async def set_type_codec(
        self,
        type_name: str,
        *,
        schema: str,
        encoder,
        decoder,
        **kwargs,
    ) -> None:
        self.codecs.append(
            {
                "type_name": type_name,
                "schema": schema,
                "encoder": encoder,
                "decoder": decoder,
                "format": kwargs["format"],
            }
        )


@pytest.mark.asyncio
async def test_setup_connection_sets_json_codecs() -> None:
    conn = FakeConnection()

    await _setup_connection(conn)  # type: ignore[arg-type]

    assert conn.executed == ["SET TIME ZONE 'UTC'"]
    assert [codec["type_name"] for codec in conn.codecs] == ["json", "jsonb"]
    assert all(codec["schema"] == "pg_catalog" for codec in conn.codecs)
    assert all(codec["format"] == "text" for codec in conn.codecs)

    for codec in conn.codecs:
        encoded = codec["encoder"]({"severity": "high"})
        assert isinstance(encoded, str)
        assert codec["decoder"](encoded) == {"severity": "high"}
        assert codec["decoder"](json.dumps(["a", "b"])) == ["a", "b"]
