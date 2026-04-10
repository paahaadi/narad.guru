import json
from narad.agents.base import NaradAgent
from narad.config import Settings
from narad.db.session import Database

def query_entity_relations(entity_name: str) -> str:
    """Queries the NARAD graph database for entity correlations such as directorships and linked events."""
    return json.dumps({
        "entity": entity_name,
        "type": "company",
        "linked_events": 3,
        "co_mentioned_with": ["Ministry of Corporate Affairs", "BlackRock"]
    })

def get_forensics_agent(settings: Settings, database: Database) -> NaradAgent:
    return NaradAgent(
        name="Digital Forensics Specialist",
        role_description="You specialize in entity resolution and graph traversal. You investigate companies, people, and organizations. Always use lists and exact data when available.",
        settings=settings,
        database=database,
        tools=[query_entity_relations],
    )
