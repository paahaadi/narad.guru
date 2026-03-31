from __future__ import annotations

import asyncio
import time
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx

from narad.config import Settings, get_settings


@dataclass(slots=True)
class TranslationResult:
    text: str
    source_language: str | None
    target_language: str
    translated: bool


def _normalize_language(language: str | None) -> str | None:
    normalized = (language or "").strip().lower()
    return normalized or None


class TranslationService:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = client
        self._request_timestamps: deque[float] = deque()
        self._rate_lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return all(
            [
                self._settings.bhashini_api_key.strip(),
                self._settings.bhashini_user_id.strip(),
                self._settings.bhashini_pipeline_id.strip(),
            ]
        )

    async def translate(
        self,
        text: str | None,
        source_language: str | None = None,
        target_language: str | None = None,
    ) -> TranslationResult:
        normalized_text = (text or "").strip()
        normalized_source = _normalize_language(source_language)
        normalized_target = _normalize_language(target_language) or self._settings.bhashini_target_language

        if not normalized_text:
            return TranslationResult(
                text="",
                source_language=normalized_source,
                target_language=normalized_target,
                translated=False,
            )

        if normalized_source in (None, normalized_target):
            return TranslationResult(
                text=normalized_text,
                source_language=normalized_source or normalized_target,
                target_language=normalized_target,
                translated=False,
            )

        translated_text = await self._translate_via_bhashini(
            normalized_text,
            source_language=normalized_source,
            target_language=normalized_target,
        )
        if not translated_text:
            return TranslationResult(
                text=normalized_text,
                source_language=normalized_source,
                target_language=normalized_target,
                translated=False,
            )

        return TranslationResult(
            text=translated_text,
            source_language=normalized_source,
            target_language=normalized_target,
            translated=translated_text != normalized_text,
        )

    async def _translate_via_bhashini(
        self,
        text: str,
        *,
        source_language: str,
        target_language: str,
    ) -> str | None:
        if not self.configured:
            return None

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": source_language,
                            "targetLanguage": target_language,
                        },
                        "serviceId": self._settings.bhashini_pipeline_id,
                    },
                }
            ],
            "inputData": {
                "input": [
                    {
                        "source": text,
                    }
                ]
            },
        }
        headers = {
            "Authorization": self._settings.bhashini_api_key,
            "userID": self._settings.bhashini_user_id,
            "Content-Type": "application/json",
        }

        backoff_seconds = 0.5
        for _attempt in range(3):
            await self._rate_limit()
            try:
                response = await self._post_json(
                    "/services/inference/pipeline",
                    payload,
                    headers=headers,
                )
                translated_text = self._extract_translation(response)
                if translated_text:
                    return translated_text
            except httpx.HTTPError:
                pass

            await asyncio.sleep(backoff_seconds)
            backoff_seconds *= 2

        return None

    async def _rate_limit(self) -> None:
        limit = max(self._settings.bhashini_max_rpm, 1)
        window_seconds = 60.0

        async with self._rate_lock:
            now = time.monotonic()
            while self._request_timestamps and now - self._request_timestamps[0] >= window_seconds:
                self._request_timestamps.popleft()

            if len(self._request_timestamps) >= limit:
                sleep_seconds = max(window_seconds - (now - self._request_timestamps[0]), 0.0)
                if sleep_seconds > 0:
                    await asyncio.sleep(sleep_seconds)
                now = time.monotonic()
                while self._request_timestamps and now - self._request_timestamps[0] >= window_seconds:
                    self._request_timestamps.popleft()

            self._request_timestamps.append(time.monotonic())

    async def _post_json(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        headers: dict[str, str],
    ) -> dict[str, Any]:
        if self._client is not None:
            response = await self._client.post(path, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else {}

        base_url = self._settings.bhashini_base_url.rstrip("/")
        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=self._settings.bhashini_timeout_seconds,
        ) as client:
            response = await client.post(path, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else {}

    def _extract_translation(self, payload: dict[str, Any]) -> str | None:
        for task_response in self._iter_task_responses(payload):
            for output_item in task_response:
                target = output_item.get("target")
                if isinstance(target, str) and target.strip():
                    return target.strip()
        return None

    def _iter_task_responses(self, payload: dict[str, Any]) -> Iterable[list[dict[str, Any]]]:
        pipeline_response = payload.get("pipelineResponse")
        if not isinstance(pipeline_response, list):
            return ()

        results: list[list[dict[str, Any]]] = []
        for task in pipeline_response:
            if not isinstance(task, dict):
                continue
            output = task.get("output")
            if isinstance(output, list):
                normalized_output = [item for item in output if isinstance(item, dict)]
                if normalized_output:
                    results.append(normalized_output)
        return results
