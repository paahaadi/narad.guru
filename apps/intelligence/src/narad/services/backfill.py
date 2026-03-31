from __future__ import annotations

import logging
from uuid import UUID

from narad.db.session import Database
from narad.projections.geostrat import upsert_geostrat_projection

logger = logging.getLogger(__name__)


async def backfill_geostrat_projections(database: Database, *, tenant_id: UUID) -> dict[str, int]:
    """One-time backfill of all geolocated events into the GeoStrat projection."""
    rows = await database.fetch(
        """
        SELECT id FROM core.events
        WHERE tenant_id = $1
          AND status != 'invalidated'
          AND geometry IS NOT NULL
        ORDER BY created_at ASC
        """,
        tenant_id,
        tenant_id=tenant_id,
    )

    projected = 0
    skipped = 0
    for i, row in enumerate(rows):
        result = await upsert_geostrat_projection(database, tenant_id=tenant_id, event_id=row["id"])
        if result:
            projected += 1
        else:
            skipped += 1
        if (i + 1) % 100 == 0:
            logger.info("GeoStrat backfill progress: %d / %d", i + 1, len(rows))

    logger.info("GeoStrat backfill complete: projected=%d, skipped=%d, total=%d", projected, skipped, len(rows))
    return {"projected": projected, "skipped": skipped, "total": len(rows)}
