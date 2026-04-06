"""
/internal — AI Intelligence Assistant Endpoints
================================================
Track 4D: Provides AI-assisted analysis for the NARAD web tier.
These endpoints are INTERNAL — they must never be exposed publicly.
They are only called server-side from the Next.js API routes.

Authentication: INTERNAL_API_KEY header (shared secret between services).

Endpoints:
  POST /internal/suggest         → Entity/event suggestions for investigations
  POST /internal/draft-briefing  → AI-drafted briefing sections

Governance:
  - All responses carry verificationRequired: true
  - Outputs are suggestions only — no autonomous publishing
  - Confidence scores are always surfaced per item
  - LLM is called with a sovereignty-safe prompt contract that instructs
    the model never to present AI-output as verified factual claims
"""
from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from narad.config import Settings
from narad.dependencies import settings_dependency
from narad.services.llm import LLMService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

# ── Auth ─────────────────────────────────────────────────────────────────────


async def internal_auth(
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    settings: Settings = Depends(settings_dependency),
) -> None:
    expected = getattr(settings, "internal_api_key", None)
    if expected and x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── Request / response models ─────────────────────────────────────────────────


class SuggestRequest(BaseModel):
    investigationId: str
    context: str = Field(..., max_length=8000)
    tenantId: str


class EntitySuggestion(BaseModel):
    label: str
    type: str
    confidence: float


class EventSuggestion(BaseModel):
    label: str
    eventType: str
    confidence: float


class SuggestResponse(BaseModel):
    entities: list[EntitySuggestion] = []
    events: list[EventSuggestion] = []
    reasoning: str
    verificationRequired: bool = True


class DraftBriefingRequest(BaseModel):
    briefingId: str
    title: str
    audience: str | None = None
    context: str = Field(..., max_length=12000)
    sectionHints: list[str] = []
    tenantId: str


class DraftSection(BaseModel):
    title: str
    body: str
    confidence: float = 0.65


class DraftBriefingResponse(BaseModel):
    briefingId: str
    sections: list[DraftSection]
    model: str
    verificationRequired: bool = True


# ── Prompt helpers (sovereignty-safe) ────────────────────────────────────────


def _suggest_prompt(context: str) -> str:
    return "\n".join([
        "You are an intelligence-analysis assistant. Analyse the investigation context below.",
        "Return a JSON object with keys: entities, events, reasoning.",
        "  entities: list of {label, type, confidence} — possible entities mentioned or implied.",
        "  events: list of {label, eventType, confidence} — possible events referenced.",
        "  reasoning: one-sentence explanation of the analysis basis.",
        "Types: person, organization, location, vessel, aircraft, facility, document.",
        "Confidence is 0.0–1.0. Do NOT present these as verified facts.",
        "They are SUGGESTIONS ONLY, requiring analyst verification.",
        "",
        f"Context:\n{context}",
    ])


def _draft_briefing_prompt(
    title: str,
    audience: str | None,
    context: str,
    section_hints: list[str],
) -> str:
    hints_line = ""
    if section_hints:
        hints_line = f"Preferred section headings: {', '.join(section_hints[:6])}\n"

    return "\n".join([
        "You are an intelligence-briefing assistant. Write a structured briefing draft.",
        f"Briefing title: {title}",
        f"Audience: {audience or 'analyst'}",
        hints_line,
        "Return a JSON object with key 'sections': list of {title, body, confidence}.",
        "body should be 2–5 sentences of substantive draft prose.",
        "confidence is 0.0–1.0, reflecting how grounded the section is in the context.",
        "Do NOT invent facts not present in the context.",
        "Mark uncertain items with '[UNVERIFIED]' in the body.",
        "This output REQUIRES analyst review. Do not present it as final.",
        "",
        f"Source context:\n{context[:8000]}",
    ])


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/suggest",
    response_model=SuggestResponse,
    dependencies=[Depends(internal_auth)],
)
async def suggest_entities(
    payload: SuggestRequest,
    request: Request,
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> Any:
    """
    Generate entity/event suggestions for an investigation.
    All outputs are flagged verificationRequired=True.
    """
    llm = LLMService(settings)

    if not llm.configured:
        logger.info("LLM not configured; returning empty suggestions for investigation %s", payload.investigationId)
        return SuggestResponse(
            reasoning="AI service is not configured. Please provide GEMINI_API_KEY to enable suggestions.",
        )

    prompt = _suggest_prompt(payload.context)
    result: Any = await llm.generate_json(prompt)

    if not isinstance(result, dict):
        return SuggestResponse(
            reasoning="AI service returned an unexpected response. Try again or use manual analysis.",
        )

    raw_entities = result.get("entities") or []
    raw_events = result.get("events") or []
    reasoning = str(result.get("reasoning") or "Analysis complete.")

    entities = []
    for item in raw_entities[:8]:
        if isinstance(item, dict) and item.get("label"):
            entities.append(EntitySuggestion(
                label=str(item["label"]).strip()[:200],
                type=str(item.get("type", "unknown")).lower().strip()[:50],
                confidence=max(0.0, min(1.0, float(item.get("confidence", 0.55)))),
            ))

    events = []
    for item in raw_events[:8]:
        if isinstance(item, dict) and item.get("label"):
            events.append(EventSuggestion(
                label=str(item["label"]).strip()[:200],
                eventType=str(item.get("eventType", "event")).lower().strip()[:50],
                confidence=max(0.0, min(1.0, float(item.get("confidence", 0.55)))),
            ))

    return SuggestResponse(
        entities=entities,
        events=events,
        reasoning=reasoning[:500],
    )


@router.post(
    "/draft-briefing",
    response_model=DraftBriefingResponse,
    dependencies=[Depends(internal_auth)],
)
async def draft_briefing(
    payload: DraftBriefingRequest,
    request: Request,
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> Any:
    """
    AI-draft a set of briefing sections grounded in source context.
    Outputs are always flagged verificationRequired=True.
    Analyst must explicitly review, edit, and save as a new version before publishing.
    """
    llm = LLMService(settings)

    if not llm.configured:
        logger.info("LLM not configured; returning scaffold sections for briefing %s", payload.briefingId)
        scaffold = (
            [
                DraftSection(title=h, body="[No AI service — write this section manually.]", confidence=0.0)
                for h in (payload.sectionHints or ["Executive Summary", "Key Findings", "Recommended Actions"])
            ]
        )
        return DraftBriefingResponse(
            briefingId=payload.briefingId,
            sections=scaffold,
            model="deterministic-fallback",
        )

    prompt = _draft_briefing_prompt(
        title=payload.title,
        audience=payload.audience,
        context=payload.context,
        section_hints=payload.sectionHints,
    )

    result = await llm.generate_json(prompt, model="mid")

    if not isinstance(result, dict) or "sections" not in result:
        return DraftBriefingResponse(
            briefingId=payload.briefingId,
            sections=[
                DraftSection(
                    title=h,
                    body="[AI draft failed — write this section manually.]",
                    confidence=0.0,
                )
                for h in (payload.sectionHints or ["Executive Summary", "Key Findings", "Recommended Actions"])
            ],
            model=settings.gemini_model_mid,
        )

    sections = []
    for s in result["sections"][:10]:
        if isinstance(s, dict) and s.get("title"):
            sections.append(DraftSection(
                title=str(s["title"]).strip()[:200],
                body=str(s.get("body", "")).strip()[:3000],
                confidence=max(0.0, min(1.0, float(s.get("confidence", 0.65)))),
            ))

    return DraftBriefingResponse(
        briefingId=payload.briefingId,
        sections=sections,
        model=settings.gemini_model_mid,
    )
