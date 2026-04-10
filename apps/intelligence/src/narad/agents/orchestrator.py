from __future__ import annotations

import logging
from typing import Any

try:
    import google.generativeai as genai
except ImportError:
    genai = None

from narad.config import Settings
from narad.db.session import Database
from narad.agents.base import NaradAgent
from narad.agents.personas.market_pulse import get_market_pulse_agent
from narad.agents.personas.forensics import get_forensics_agent

logger = logging.getLogger("narad.agents.orchestrator")

class AgentOrchestrator(NaradAgent):
    """The Supervisor Agent that classifies intent and routes user prompts."""

    def __init__(self, settings: Settings, database: Database):
        super().__init__(
            name="NARAD Supervisor",
            role_description=(
                "You are the top-level supervisor for the NARAD platform. "
                "Instead of answering directly, your goal is to analyze the user's prompt and "
                "return exactly ONE word corresponding to the correct specialized sub-agent: "
                "return 'MARKET' if the query relies on news, claims, SEBI, or regulatory updates. "
                "return 'FORENSICS' if the query is investigating specific companies, people, or entity graphs. "
                "return 'GENERAL' if it is a generic platform question."
            ),
            settings=settings,
            database=database,
        )
        
        # Instantiate sub-agents
        self.market_agent = get_market_pulse_agent(settings, database)
        self.forensics_agent = get_forensics_agent(settings, database)

    async def execute_turn(self, prompt: str, history: list[dict[str, Any]] | None = None) -> str:
        """Determines the correct agent, then invokes it."""
        try:
            # First pass: classify
            classification = await self.generate_response(prompt, history=[])
            classification = classification.strip().upper()

            if "MARKET" in classification:
                logger.info(f"Routing to Market Pulse Analyst: {prompt}")
                return await self.market_agent.generate_response(prompt, history)
            elif "FORENSICS" in classification:
                logger.info(f"Routing to Digtial Forensics: {prompt}")
                return await self.forensics_agent.generate_response(prompt, history)
            else:
                # Fallback to general responses internally to avoid excessive hops
                logger.info("Routing as GENERAL")
                general_agent = NaradAgent(
                    name="NARAD Assistant",
                    role_description="You are a helpful general assistant for the NARAD sovereign intelligence platform.",
                    settings=self.settings,
                    database=self.database,
                )
                return await general_agent.generate_response(prompt, history)

        except Exception as exc:
            logger.exception("Orchestrator failed to execute turn.")
            return f"Error: The orchestrator encountered a failure ({exc})."
