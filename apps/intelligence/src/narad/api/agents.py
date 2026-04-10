from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from narad.config import Settings
from narad.db.session import Database
from narad.dependencies import database_dependency, settings_dependency
from narad.agents.orchestrator import AgentOrchestrator

router = APIRouter(tags=["agents"])

class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, Any]] | None = None

@router.post("/chat")
async def chat_with_narad(
    request: ChatRequest,
    settings: Annotated[Settings, Depends(settings_dependency)],
    database: Annotated[Database, Depends(database_dependency)],
):
    orchestrator = AgentOrchestrator(settings, database)
    response_text = await orchestrator.execute_turn(request.message, request.history)
    
    return {
        "reply": response_text
    }
