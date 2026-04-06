from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from narad.config import Settings

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - package is installed in the app environment
    genai = None


@dataclass(slots=True)
class StoryCapsuleDraft:
    headline: str
    explanation: str
    key_facts: list[str] = field(default_factory=list)
    evidence_bundle: list[dict[str, str]] = field(default_factory=list)
    confidence: float = 0.65
    ai_model: str = "deterministic-fallback"
    ai_model_version: str = "phase-2b"


class LLMService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._configured = bool(settings.gemini_api_key and genai is not None)
        self._generation_models: dict[str, Any] = {}
        if self._configured:
            genai.configure(api_key=settings.gemini_api_key)
            for model_name in {
                settings.gemini_model,
                settings.gemini_model_mid,
                settings.gemini_model_large,
            }:
                self._generation_models[model_name] = genai.GenerativeModel(model_name)

    @property
    def configured(self) -> bool:
        return self._configured and bool(self._generation_models)

    def _resolve_model_name(self, model: str) -> str:
        match model:
            case "mid":
                return self._settings.gemini_model_mid
            case "large":
                return self._settings.gemini_model_large
            case _:
                return self._settings.gemini_model

    async def _generate_json(self, prompt: str, *, model: str = "default") -> Any:
        if not self.configured:
            return None

        model_name = self._resolve_model_name(model)

        def _call_model() -> Any:
            generation_model = self._generation_models.get(model_name)
            if generation_model is None and genai is not None:
                generation_model = genai.GenerativeModel(model_name)
                self._generation_models[model_name] = generation_model
            if generation_model is None:
                return None
            return generation_model.generate_content(prompt)

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(_call_model),
                timeout=self._settings.gemini_timeout_seconds,
            )
        except Exception:
            return None

        text = getattr(response, "text", "") or ""
        if not text:
            return None
        text = text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(line for line in lines if not line.startswith("```")).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None

    async def generate_json(self, prompt: str, *, model: str = "default") -> Any:
        return await self._generate_json(prompt, model=model)

    async def extract_claims(
        self,
        *,
        title: str,
        body_text: str,
        source_name: str,
    ) -> list[dict[str, object]]:
        payload = await self._generate_json(
            "\n".join(
                [
                    "Extract high-signal factual claims from the document as JSON.",
                    "Return a JSON array. Each item must contain:",
                    '  "text": string',
                    '  "confidence": number between 0 and 1',
                    '  "entities_mentioned": array of strings',
                    '  "event_type_hint": string',
                    f"Source: {source_name}",
                    f"Title: {title}",
                    f"Body: {body_text[:6000]}",
                ]
            )
        )
        if not isinstance(payload, list):
            return []
        results: list[dict[str, object]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            results.append(
                {
                    "text": text,
                    "confidence": float(item.get("confidence", self._settings.default_event_confidence)),
                    "entities_mentioned": [
                        str(entity).strip()
                        for entity in item.get("entities_mentioned", [])
                        if str(entity).strip()
                    ],
                    "event_type_hint": str(item.get("event_type_hint", "")).strip() or None,
                }
            )
        return results

    async def extract_entities(self, text: str) -> list[dict[str, object]]:
        payload = await self._generate_json(
            "\n".join(
                [
                    "Extract real-world named entities (companies, regulators, persons, locations).",
                    "Return a JSON array where each object has:",
                    '  "name": string (Canonical Title Case)',
                    '  "entity_type": enum [company, regulator, person, ministry, organization, location]',
                    '  "external_ids": object (look for CIN, ISIN, or PAN in the text next to the name, else empty object {})',
                    f"Text: {text[:4000]}",
                ]
            )
        )
        if not isinstance(payload, list):
            return []
        
        results: list[dict[str, object]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            results.append({
                "name": name,
                "entity_type": str(item.get("entity_type", "organization")).lower(),
                "external_ids": item.get("external_ids", {}) if isinstance(item.get("external_ids"), dict) else {}
            })
        return results


    async def build_story_capsule(
        self,
        *,
        title: str,
        summary: str,
        evidence_urls: list[str],
        key_facts: list[str] | None = None,
    ) -> StoryCapsuleDraft:
        facts = key_facts or [summary[:160] if summary else title]
        evidence_bundle = [{"type": "document", "url": url} for url in evidence_urls if url]
        explanation = summary or title
        if self.configured:
            payload = await self._generate_json(
                "\n".join(
                    [
                        "Write a concise event capsule as JSON.",
                        "Return an object with keys: headline, explanation, key_facts, confidence.",
                        f"Title: {title}",
                        f"Summary: {summary}",
                        f"Evidence URLs: {', '.join(evidence_urls) if evidence_urls else 'none'}",
                        f"Key facts: {json.dumps(facts[:5])}",
                    ]
                ),
                model="mid",
            )
            if isinstance(payload, dict):
                llm_headline = str(payload.get("headline", "")).strip() or title
                llm_explanation = str(payload.get("explanation", "")).strip() or explanation
                llm_facts = [
                    str(fact).strip()
                    for fact in payload.get("key_facts", [])
                    if str(fact).strip()
                ]
                llm_confidence = float(payload.get("confidence", self._settings.default_event_confidence))
                return StoryCapsuleDraft(
                    headline=llm_headline[:120],
                    explanation=llm_explanation,
                    key_facts=(llm_facts or facts)[:5],
                    evidence_bundle=evidence_bundle,
                    confidence=max(min(llm_confidence, 1.0), 0.0),
                    ai_model=self._settings.gemini_model,
                    ai_model_version="phase-3a",
                )
        return StoryCapsuleDraft(
            headline=title,
            explanation=explanation,
            key_facts=facts[:5],
            evidence_bundle=evidence_bundle,
            confidence=self._settings.default_event_confidence,
            ai_model=self._settings.gemini_model if self._settings.gemini_api_key else "deterministic-fallback",
            ai_model_version="phase-3a",
        )
