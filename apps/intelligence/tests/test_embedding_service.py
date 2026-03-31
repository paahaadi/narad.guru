from __future__ import annotations

import pytest

from narad.services import embedding as embedding_module
from narad.services.embedding import EmbeddingService


class FakeGenAI:
    def __init__(self, response: dict[str, object]) -> None:
        self._response = response
        self.configured_api_key: str | None = None
        self.last_kwargs: dict[str, object] | None = None

    def configure(self, *, api_key: str) -> None:
        self.configured_api_key = api_key

    async def embed_content_async(self, **kwargs: object) -> dict[str, object]:
        self.last_kwargs = kwargs
        return self._response


@pytest.mark.asyncio
async def test_embed_texts_truncates_provider_vectors_to_schema_dimensions(settings, monkeypatch) -> None:
    fake_genai = FakeGenAI({"embedding": [list(range(1536))]})
    monkeypatch.setattr(embedding_module, "genai", fake_genai)
    service = EmbeddingService(
        settings.model_copy(
            update={
                "gemini_api_key": "test-key",
                "embedding_dimensions": 768,
            }
        )
    )

    result = await service.embed_texts(["embedding payload"])

    assert fake_genai.configured_api_key == "test-key"
    assert fake_genai.last_kwargs is not None
    assert fake_genai.last_kwargs["output_dimensionality"] == 768
    assert len(result.vectors) == 1
    assert len(result.vectors[0]) == 768
    assert result.vectors[0][0] == 0.0
    assert result.vectors[0][-1] == 767.0


@pytest.mark.asyncio
async def test_embed_texts_falls_back_when_provider_vector_is_too_short(settings, monkeypatch) -> None:
    fake_genai = FakeGenAI({"embedding": [[0.25, 0.5, 0.75]]})
    monkeypatch.setattr(embedding_module, "genai", fake_genai)
    service = EmbeddingService(
        settings.model_copy(
            update={
                "gemini_api_key": "test-key",
                "embedding_dimensions": 8,
            }
        )
    )

    result = await service.embed_texts(["short vector"])

    assert len(result.vectors) == 1
    assert result.vectors[0] == service._fallback_vector("short vector")
