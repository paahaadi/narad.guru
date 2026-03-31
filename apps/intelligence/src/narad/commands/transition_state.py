from __future__ import annotations

import json
from uuid import UUID

from narad.db.session import Database


async def record_state_transition(
    database: Database,
    *,
    tenant_id: UUID,
    object_type: str,
    object_id: UUID,
    from_state: str | None,
    to_state: str,
    transitioned_by: UUID,
    reason: str | None = None,
) -> None:
    await database.execute(
        """
        INSERT INTO audit.state_transitions (
            tenant_id,
            object_type,
            object_id,
            from_state,
            to_state,
            transitioned_by,
            reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        tenant_id,
        object_type,
        object_id,
        from_state,
        to_state,
        transitioned_by,
        reason,
        tenant_id=tenant_id,
    )
    await database.execute(
        """
        INSERT INTO audit.audit_log (
            tenant_id,
            user_id,
            action,
            object_type,
            object_id,
            delta
        )
        VALUES ($1, $2, 'state_transition', $3, $4, $5::jsonb)
        """,
        tenant_id,
        transitioned_by,
        object_type,
        object_id,
        json.dumps({"from": from_state, "to": to_state, "reason": reason}),
        tenant_id=tenant_id,
    )
