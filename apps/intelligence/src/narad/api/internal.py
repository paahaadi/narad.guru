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


# ══════════════════════════════════════════════════════════════════════════════
# Phase 5 — Decision Intelligence Endpoints
# ══════════════════════════════════════════════════════════════════════════════


class RecommendRequest(BaseModel):
    targetType: str = Field(..., description="event | entity | investigation | district")
    targetId: str
    context: str = Field(..., max_length=10000)
    tenantId: str


class RecommendationItem(BaseModel):
    recommendationType: str
    title: str
    summary: str
    impactSummary: str | None = None
    reasoning: str
    evidenceRefs: list[dict[str, str]] = []
    confidence: float = 0.55


class RecommendResponse(BaseModel):
    targetType: str
    targetId: str
    recommendations: list[RecommendationItem] = []
    model: str
    verificationRequired: bool = True


class ImpactSummaryRequest(BaseModel):
    scope: str = Field(..., description="district | entity | sector")
    scopeId: str
    context: str = Field(..., max_length=10000)
    tenantId: str


class ImpactDimension(BaseModel):
    dimension: str
    severity: str
    description: str
    confidence: float = 0.55


class ImpactSummaryResponse(BaseModel):
    scope: str
    scopeId: str
    overallSeverity: str
    narrative: str
    dimensions: list[ImpactDimension] = []
    model: str
    verificationRequired: bool = True


# ── Phase 5 Prompt helpers ────────────────────────────────────────────────────


def _recommend_prompt(target_type: str, context: str) -> str:
    return "\n".join([
        "You are a sovereign-intelligence decision support assistant.",
        f"Analyse the following {target_type} context and generate actionable recommendations.",
        "Return a JSON object with key 'recommendations': list of objects with keys:",
        "  recommendationType: one of (action, risk_mitigation, escalation, investigation_lead, policy, monitoring)",
        "  title: short heading (max 100 chars)",
        "  summary: 2-3 sentence actionable recommendation",
        "  impactSummary: 1 sentence on potential impact if recommendation is followed",
        "  reasoning: 1-2 sentences explaining the basis from evidence",
        "  evidenceRefs: list of {type, label} citing specific evidence from context",
        "  confidence: 0.0-1.0",
        "",
        "RULES:",
        "- Return at most 5 recommendations",
        "- Each recommendation must be grounded in the provided context",
        "- Do NOT invent facts not present in context",
        "- These are SUGGESTIONS requiring analyst verification",
        "- Include specific evidence references",
        "",
        f"Context:\n{context[:8000]}",
    ])


def _impact_summary_prompt(scope: str, context: str) -> str:
    return "\n".join([
        "You are an intelligence-analysis assistant specialising in impact assessment.",
        f"Analyse the following context for the {scope} and generate a structured impact summary.",
        "Return a JSON object with keys:",
        "  overallSeverity: one of (critical, high, medium, low)",
        "  narrative: 3-5 sentence overall impact assessment",
        "  dimensions: list of {dimension, severity, description, confidence} where:",
        "    dimension: one of (human, economic, legal, infrastructure, environmental, political, social, reputational)",
        "    severity: one of (critical, high, medium, low)",
        "    description: 1-2 sentence impact for this dimension",
        "    confidence: 0.0-1.0",
        "",
        "RULES:",
        "- Ground all assessments in the provided context",
        "- Do NOT speculate beyond what is evidenced",
        "- This is an UNVERIFIED assessment requiring analyst review",
        "",
        f"Context:\n{context[:8000]}",
    ])


# ── Phase 5 Endpoints ────────────────────────────────────────────────────────


@router.post(
    "/recommend",
    response_model=RecommendResponse,
    dependencies=[Depends(internal_auth)],
)
async def generate_recommendations(
    payload: RecommendRequest,
    request: Request,
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> Any:
    """
    Generate structured decision recommendations for a target (event/entity/investigation/district).
    All outputs carry verificationRequired=True.
    """
    llm = LLMService(settings)

    if not llm.configured:
        logger.info("LLM not configured; returning empty recommendations for %s/%s", payload.targetType, payload.targetId)
        return RecommendResponse(
            targetType=payload.targetType,
            targetId=payload.targetId,
            recommendations=[
                RecommendationItem(
                    recommendationType="monitoring",
                    title="Manual review required",
                    summary="AI service is not configured. An analyst should review this item manually and determine appropriate actions.",
                    reasoning="Automated recommendation generation requires a configured LLM service (GEMINI_API_KEY).",
                    confidence=0.0,
                ),
            ],
            model="deterministic-fallback",
        )

    prompt = _recommend_prompt(payload.targetType, payload.context)
    result = await llm.generate_json(prompt, model="mid")

    if not isinstance(result, dict) or "recommendations" not in result:
        return RecommendResponse(
            targetType=payload.targetType,
            targetId=payload.targetId,
            recommendations=[
                RecommendationItem(
                    recommendationType="monitoring",
                    title="AI analysis inconclusive",
                    summary="The AI service could not generate structured recommendations. Manual analyst review is advised.",
                    reasoning="LLM returned an unparseable response.",
                    confidence=0.0,
                ),
            ],
            model=settings.gemini_model_mid,
        )

    valid_types = {"action", "risk_mitigation", "escalation", "investigation_lead", "policy", "monitoring"}
    recommendations: list[RecommendationItem] = []
    for item in result["recommendations"][:5]:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        rec_type = str(item.get("recommendationType", "monitoring")).strip()
        if rec_type not in valid_types:
            rec_type = "monitoring"
        evidence = []
        for ref in (item.get("evidenceRefs") or [])[:5]:
            if isinstance(ref, dict) and ref.get("label"):
                evidence.append({
                    "type": str(ref.get("type", "context")).strip()[:50],
                    "label": str(ref["label"]).strip()[:200],
                })
        recommendations.append(RecommendationItem(
            recommendationType=rec_type,
            title=str(item["title"]).strip()[:100],
            summary=str(item.get("summary", "")).strip()[:500],
            impactSummary=str(item.get("impactSummary", "")).strip()[:300] or None,
            reasoning=str(item.get("reasoning", "")).strip()[:500],
            evidenceRefs=evidence,
            confidence=max(0.0, min(1.0, float(item.get("confidence", 0.55)))),
        ))

    return RecommendResponse(
        targetType=payload.targetType,
        targetId=payload.targetId,
        recommendations=recommendations,
        model=settings.gemini_model_mid,
    )


@router.post(
    "/impact-summary",
    response_model=ImpactSummaryResponse,
    dependencies=[Depends(internal_auth)],
)
async def generate_impact_summary(
    payload: ImpactSummaryRequest,
    request: Request,
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> Any:
    """
    Generate a structured impact assessment for a scope (district/entity/sector).
    All outputs carry verificationRequired=True.
    """
    llm = LLMService(settings)

    if not llm.configured:
        logger.info("LLM not configured; returning empty impact for %s/%s", payload.scope, payload.scopeId)
        return ImpactSummaryResponse(
            scope=payload.scope,
            scopeId=payload.scopeId,
            overallSeverity="medium",
            narrative="AI service is not configured. Impact assessment requires manual analyst review.",
            dimensions=[],
            model="deterministic-fallback",
        )

    prompt = _impact_summary_prompt(payload.scope, payload.context)
    result = await llm.generate_json(prompt, model="mid")

    if not isinstance(result, dict):
        return ImpactSummaryResponse(
            scope=payload.scope,
            scopeId=payload.scopeId,
            overallSeverity="medium",
            narrative="AI analysis could not be completed. Manual review required.",
            dimensions=[],
            model=settings.gemini_model_mid,
        )

    valid_severities = {"critical", "high", "medium", "low"}
    valid_dimensions = {"human", "economic", "legal", "infrastructure", "environmental", "political", "social", "reputational"}

    overall = str(result.get("overallSeverity", "medium")).lower().strip()
    if overall not in valid_severities:
        overall = "medium"

    narrative = str(result.get("narrative", "Impact assessment pending review.")).strip()[:1000]

    dimensions: list[ImpactDimension] = []
    for d in (result.get("dimensions") or [])[:8]:
        if not isinstance(d, dict) or not d.get("dimension"):
            continue
        dim = str(d["dimension"]).lower().strip()
        if dim not in valid_dimensions:
            continue
        sev = str(d.get("severity", "medium")).lower().strip()
        if sev not in valid_severities:
            sev = "medium"
        dimensions.append(ImpactDimension(
            dimension=dim,
            severity=sev,
            description=str(d.get("description", "")).strip()[:500],
            confidence=max(0.0, min(1.0, float(d.get("confidence", 0.55)))),
        ))

    return ImpactSummaryResponse(
        scope=payload.scope,
        scopeId=payload.scopeId,
        overallSeverity=overall,
        narrative=narrative,
        dimensions=dimensions,
        model=settings.gemini_model_mid,
    )


class TriggerIngestRequest(BaseModel):
    source_id: str


class TriggerIngestResponse(BaseModel):
    status: str
    source_id: str
    task_id: str


@router.post(
    "/trigger-ingest",
    response_model=TriggerIngestResponse,
    dependencies=[Depends(internal_auth)],
)
async def trigger_ingest(payload: TriggerIngestRequest) -> Any:
    """Manually trigger ingestion for a specific source."""
    from narad.workers.ingest_tasks import force_trigger_source_ingest

    result = force_trigger_source_ingest.delay(payload.source_id)
    return {
        "status": "queued",
        "source_id": payload.source_id,
        "task_id": result.id,
    }
