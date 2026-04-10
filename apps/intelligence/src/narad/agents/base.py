from __future__ import annotations

import logging
from typing import Any, Callable

try:
    import google.generativeai as genai
    from google.generativeai.types import content_types
except ImportError:
    genai = None

from narad.config import Settings
from narad.db.session import Database

logger = logging.getLogger("narad.agents")

class NaradAgent:
    """Base class for functional AI Agents within NARAD."""

    def __init__(
        self,
        name: str,
        role_description: str,
        settings: Settings,
        database: Database,
        tools: list[Callable[..., Any]] | None = None,
    ):
        self.name = name
        self.role_description = role_description
        self.settings = settings
        self.database = database
        self.tools = tools or []
        self._model = self._init_model()

    def _init_model(self) -> Any:
        if not genai or not self.settings.gemini_api_key:
            return None

        genai.configure(api_key=self.settings.gemini_api_key)
        
        system_instruction = f"You are NARAD Agent: {self.name}. {self.role_description}"
        
        # Tools must be properly formatted to pass to Gemini
        return genai.GenerativeModel(
            model_name=self.settings.gemini_model,
            system_instruction=system_instruction,
            tools=self.tools if self.tools else None,
        )

    async def generate_response(self, prompt: str, history: list[dict[str, Any]] | None = None) -> str:
        if not self._model:
            return "Intelligence engine offline. (Agent API keys missing)."

        formatted_history = []
        if history:
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                formatted_history.append({"role": role, "parts": [msg["content"]]})

        try:
            chat = self._model.start_chat(history=formatted_history, enable_automatic_function_calling=bool(self.tools))
            response = await chat.send_message_async(prompt)
            return response.text
        except Exception as exc:
            logger.exception(f"Agent {self.name} failed to generate response")
            return f"[{self.name}] Error communicating with intelligence layer: {exc}"
