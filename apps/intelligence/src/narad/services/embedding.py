from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from narad.config import Settings

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - package is installed in the app environment
    genai = None


@dataclass(slots=True)
class EmbeddingResult:
    vectors: list[list[float]]


class EmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._configured = bool(settings.gemini_api_key and genai is not None)
        if self._configured:
            genai.configure(api_key=settings.gemini_api_key)

    def _fallback_vector(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        vector: list[float] = []
        for index in range(self._settings.embedding_dimensions):
            byte = digest[index % len(digest)]
            vector.append((byte / 255.0) * 2.0 - 1.0)
        return vector

    def _normalize_vector(self, text: str, vector: list[float]) -> list[float]:
        normalized = [float(value) for value in vector]
        expected_dimensions = self._settings.embedding_dimensions
        if len(normalized) == expected_dimensions:
            return normalized
        if len(normalized) > expected_dimensions:
            return normalized[:expected_dimensions]
        return self._fallback_vector(text)

    async def _gemini_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not self._configured or genai is None:
            return [self._fallback_vector(text) for text in texts]
        try:
            response: Any = await genai.embed_content_async(
                model=self._settings.gemini_embedding_model,
                content=texts,
                output_dimensionality=self._settings.embedding_dimensions,
            )
        except Exception:
            return [self._fallback_vector(text) for text in texts]

        embeddings = response.get("embedding") if isinstance(response, dict) else None
        if embeddings is None:
            embeddings = response.get("embeddings") if isinstance(response, dict) else None
        if not isinstance(embeddings, list):
            return [self._fallback_vector(text) for text in texts]
        if embeddings and isinstance(embeddings[0], dict):
            raw_vectors = [list(item.get("values", [])) for item in embeddings]
        else:
            raw_vectors = [list(item) for item in embeddings]
        if len(raw_vectors) != len(texts):
            return [self._fallback_vector(text) for text in texts]
        return [self._normalize_vector(text, vector) for text, vector in zip(texts, raw_vectors, strict=True)]

    async def embed_texts(self, texts: list[str]) -> EmbeddingResult:
        normalized = [text.strip() for text in texts if text.strip()]
        if not normalized:
            return EmbeddingResult(vectors=[])
        return EmbeddingResult(vectors=await self._gemini_embeddings(normalized))


def vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"
