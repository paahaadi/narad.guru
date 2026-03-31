from __future__ import annotations

from uuid import UUID

from narad.services.rule_evaluator import RuleEvaluator


async def evaluate_watchlists_for_event(rule_evaluator: RuleEvaluator, event_id: UUID) -> list[dict[str, object]]:
    return await rule_evaluator.evaluate_event(str(event_id))
