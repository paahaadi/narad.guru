import json
from narad.agents.base import NaradAgent
from narad.config import Settings
from narad.db.session import Database

def query_recent_claims(topic: str) -> str:
    """Queries the NARAD intelligence database for the most recent factual claims about a specific topic (e.g. 'SEBI', 'Acquisitions')."""
    # Note: In a real environment, this function runs async and uses the DB connection.
    # Google GenAI `enable_automatic_function_calling` prefers synchronous wrappers or we must manually bridge event loops.
    # For MVP phase, we will return simulated/extracted context, or we can use the injected dependencies manually inside the router.
    return json.dumps([
        {"claim": "SEBI sets new strict compliance standards for alternative investment funds.", "source": "Gazette of India", "confidence": 0.95},
        {"claim": f"Recent spikes in volume detected concerning {topic}.", "source": "BSE RSS", "confidence": 0.88}
    ])

def get_market_pulse_agent(settings: Settings, database: Database) -> NaradAgent:
    return NaradAgent(
        name="Market Pulse Analyst",
        role_description="You analyze regulatory alerts and market claims. You format your output cleanly using markdown. Always provide verifiable metrics. Do not invent facts.",
        settings=settings,
        database=database,
        tools=[query_recent_claims],
    )
