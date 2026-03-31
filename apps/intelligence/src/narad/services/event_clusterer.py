from __future__ import annotations

from narad.config import Settings


class EventClusterer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def classify_event_type(self, _: str | None = None) -> str:
        return self._settings.default_event_type
