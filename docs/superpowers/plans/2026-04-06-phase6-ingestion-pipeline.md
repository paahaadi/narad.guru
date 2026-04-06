# Phase 6: Ingestion Pipeline + Entity Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Tier 2 adapters (ACLED, FIRMS, GDELT, OpenSky) into the adapter registry so the existing polling/enrichment pipeline ingests real-world data, and add web-side ingestion management endpoints for monitoring and manual triggering.

**Architecture:** The entire ingestion → enrichment → projection pipeline already works end-to-end. Tier 2 adapter classes already exist but aren't registered in `AdapterRegistry`. We register them (with credential gating), add an ingestion admin API for monitoring source health and triggering ingests from the web UI, and add an event ingestion endpoint for the public developer API.

**Tech Stack:** Python (FastAPI, asyncpg, Celery), TypeScript (Next.js API routes), PostgreSQL (RLS, TimescaleDB)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/intelligence/src/narad/adapters/registry.py` | Register Tier 2 adapters with credential gating |
| Modify | `apps/intelligence/src/narad/config.py` | Add `alert_trigger_lookback_minutes` setting |
| Create | `apps/web/src/app/api/admin/sources/route.ts` | GET sources list + POST manual trigger |
| Create | `apps/web/src/app/api/admin/sources/[sourceSlug]/route.ts` | GET single source detail + health |
| Create | `apps/web/src/app/api/v1/ingest/route.ts` | POST event ingestion via public API |
| Create | `apps/web/src/lib/workspaces/sources.ts` | Server-side data access for source management |
| Modify | `apps/intelligence/src/narad/workers/alert_trigger.py` | Use config setting for lookback window |

---

### Task 1: Register Tier 2 Adapters in AdapterRegistry

**Files:**
- Modify: `apps/intelligence/src/narad/adapters/registry.py`

The Tier 2 adapter classes (`AcledAdapter`, `FirmsAdapter`, `GdeltAdapter`, `OpenSkyAdapter`) already exist and inherit `BaseSourceAdapter`. They just aren't instantiated or registered. We add them with credential gating — adapters requiring API keys are only registered when keys are present.

- [ ] **Step 1: Write failing test — registry includes Tier 2 adapters**

Create `apps/intelligence/tests/adapters/test_registry_tier2.py`:

```python
"""Verify Tier 2 adapters register when credentials are available."""
from __future__ import annotations

import pytest
from unittest.mock import patch

from narad.adapters.registry import AdapterRegistry


@pytest.fixture
def settings_with_tier2_keys():
    """Settings mock with all Tier 2 API credentials populated."""
    from narad.config import get_settings
    settings = get_settings()
    # Patch in test credentials
    with patch.object(settings, "acled_api_key", "test-acled-key"), \
         patch.object(settings, "acled_email", "test@example.com"), \
         patch.object(settings, "firms_map_key", "test-firms-key"), \
         patch.object(settings, "gdelt_enabled", True), \
         patch.object(settings, "opensky_username", ""), \
         patch.object(settings, "opensky_password", ""):
        yield settings


@pytest.fixture
def settings_without_tier2_keys():
    """Settings mock with no Tier 2 API credentials."""
    from narad.config import get_settings
    settings = get_settings()
    with patch.object(settings, "acled_api_key", ""), \
         patch.object(settings, "acled_email", ""), \
         patch.object(settings, "firms_map_key", ""), \
         patch.object(settings, "gdelt_enabled", False), \
         patch.object(settings, "opensky_username", ""), \
         patch.object(settings, "opensky_password", ""):
        yield settings


def test_tier2_adapters_registered_when_keys_present(settings_with_tier2_keys):
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "acled" in slugs
    assert "firms" in slugs
    assert "gdelt" in slugs


def test_tier2_adapters_skipped_when_keys_missing(settings_without_tier2_keys):
    registry = AdapterRegistry(settings_without_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "acled" not in slugs
    assert "firms" not in slugs
    assert "gdelt" not in slugs


def test_opensky_always_registered(settings_with_tier2_keys):
    """OpenSky has an unauthenticated mode — always register."""
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    assert "opensky" in slugs


def test_tier1_adapters_still_present(settings_with_tier2_keys):
    registry = AdapterRegistry(settings_with_tier2_keys)
    slugs = [a.definition.slug for a in registry.list()]
    for slug in ["pib_rss", "sebi_rss", "bse_rss", "nse_rss", "egazette", "imd", "cwc", "india_code"]:
        assert slug in slugs
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/intelligence && python -m pytest tests/adapters/test_registry_tier2.py -v
```

Expected: FAIL — `"acled" not in slugs` because Tier 2 adapters aren't registered yet.

- [ ] **Step 3: Implement — register Tier 2 adapters with credential gating**

Replace the contents of `apps/intelligence/src/narad/adapters/registry.py`:

```python
from __future__ import annotations

import json

from narad.adapters.base import BaseSourceAdapter
from narad.adapters.tier1.bse import BseAdapter
from narad.adapters.tier1.cwc import CwcAdapter
from narad.adapters.tier1.egazette import EgazetteAdapter
from narad.adapters.tier1.imd import ImdAdapter
from narad.adapters.tier1.india_code import IndiaCodeAdapter
from narad.adapters.tier1.nse import NseAdapter
from narad.adapters.tier1.pib import PIBAdapter
from narad.adapters.tier1.sebi import SebiAdapter
from narad.adapters.tier2.acled import AcledAdapter
from narad.adapters.tier2.firms import FirmsAdapter
from narad.adapters.tier2.gdelt import GdeltAdapter
from narad.adapters.tier2.opensky import OpenSkyAdapter
from narad.config import Settings
from narad.db.models import SourceRecord
from narad.db.session import Database


class AdapterRegistry:
    def __init__(self, settings: Settings) -> None:
        self._adapters: dict[str, BaseSourceAdapter] = {}

        # --- Tier 1: always registered (government / official) ---
        for adapter in (
            PIBAdapter(settings),
            SebiAdapter(settings),
            BseAdapter(settings),
            NseAdapter(settings),
            EgazetteAdapter(settings),
            ImdAdapter(settings),
            CwcAdapter(settings),
            IndiaCodeAdapter(settings),
        ):
            self._adapters[adapter.definition.slug] = adapter

        # --- Tier 2: credential-gated ---
        if settings.acled_api_key and settings.acled_email:
            acled = AcledAdapter(settings)
            self._adapters[acled.definition.slug] = acled

        if settings.firms_map_key:
            firms = FirmsAdapter(settings)
            self._adapters[firms.definition.slug] = firms

        if settings.gdelt_enabled:
            gdelt = GdeltAdapter(settings)
            self._adapters[gdelt.definition.slug] = gdelt

        # OpenSky supports unauthenticated mode — always register
        opensky = OpenSkyAdapter(settings)
        self._adapters[opensky.definition.slug] = opensky

    def list(self) -> list[BaseSourceAdapter]:
        return list(self._adapters.values())

    def get(self, slug: str) -> BaseSourceAdapter:
        try:
            return self._adapters[slug]
        except KeyError as exc:
            raise KeyError(f"No adapter registered for slug '{slug}'") from exc

    async def ensure_sources(self, database: Database) -> list[SourceRecord]:
        tenant_id = await database.resolve_default_tenant_id()
        records: list[SourceRecord] = []
        for adapter in self.list():
            definition = adapter.definition
            row = await database.fetchrow(
                """
                INSERT INTO core.sources (
                    tenant_id,
                    name,
                    slug,
                    source_type,
                    trust_tier,
                    authority_level,
                    update_cadence_seconds,
                    base_url,
                    config,
                    governance_approved,
                    is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
                ON CONFLICT (tenant_id, slug)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    source_type = EXCLUDED.source_type,
                    trust_tier = EXCLUDED.trust_tier,
                    authority_level = EXCLUDED.authority_level,
                    update_cadence_seconds = EXCLUDED.update_cadence_seconds,
                    base_url = EXCLUDED.base_url,
                    config = EXCLUDED.config,
                    governance_approved = EXCLUDED.governance_approved,
                    is_active = EXCLUDED.is_active
                RETURNING
                    id,
                    tenant_id,
                    name,
                    slug,
                    source_type,
                    trust_tier,
                    authority_level,
                    is_active,
                    governance_approved,
                    base_url,
                    update_cadence_seconds,
                    last_polled_at,
                    last_success_at,
                    last_successful_fetch,
                    last_error,
                    consecutive_failures,
                    status,
                    documents_fetched_total,
                    events_produced_total,
                    config
                """,
                tenant_id,
                definition.name,
                definition.slug,
                definition.source_type,
                definition.trust_tier,
                definition.authority_level,
                definition.update_cadence_seconds,
                definition.base_url,
                json.dumps(definition.config),
                definition.governance_approved,
                definition.is_active,
                tenant_id=tenant_id,
            )
            if row is not None:
                records.append(
                    SourceRecord.model_validate(
                        {
                            **dict(row),
                            "documents_ingested_24h": 0,
                            "circuit_breaker_state": "open" if row["status"] == "degraded" else "closed",
                        }
                    )
                )
        return records
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/intelligence && python -m pytest tests/adapters/test_registry_tier2.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/intelligence/src/narad/adapters/registry.py apps/intelligence/tests/adapters/test_registry_tier2.py
git commit -m "feat(ingestion): register Tier 2 adapters (ACLED, FIRMS, GDELT, OpenSky) with credential gating"
```

---

### Task 2: Add Alert Trigger Lookback Config Setting

**Files:**
- Modify: `apps/intelligence/src/narad/config.py`
- Modify: `apps/intelligence/src/narad/workers/alert_trigger.py`

The alert trigger currently hardcodes a 10-minute lookback window. Make it configurable.

- [ ] **Step 1: Add setting to config**

In `apps/intelligence/src/narad/config.py`, add inside the `Settings` class after the existing `celery_task_time_limit` field:

```python
    # Alert trigger
    alert_trigger_lookback_minutes: int = 10
```

- [ ] **Step 2: Update alert_trigger.py to use config**

In `apps/intelligence/src/narad/workers/alert_trigger.py`, change the hardcoded `timedelta(minutes=10)` line:

Replace:
```python
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
```

With:
```python
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.alert_trigger_lookback_minutes)
```

- [ ] **Step 3: Commit**

```bash
git add apps/intelligence/src/narad/config.py apps/intelligence/src/narad/workers/alert_trigger.py
git commit -m "feat(alerts): make alert trigger lookback window configurable"
```

---

### Task 3: Source Management Data Access Layer

**Files:**
- Create: `apps/web/src/lib/workspaces/sources.ts`

Server-side data access functions for querying source health, status, and ingestion stats. Follows the existing `queryRows`/`queryRow` pattern from `lib/db.ts`.

- [ ] **Step 1: Create sources data access module**

Create `apps/web/src/lib/workspaces/sources.ts`:

```typescript
import { queryRows, queryRow } from "@/lib/db";

export type SourceSummary = {
  id: string;
  name: string;
  slug: string;
  sourceType: string;
  trustTier: number;
  authorityLevel: string;
  isActive: boolean;
  governanceApproved: boolean;
  status: string;
  consecutiveFailures: number;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  documentsFetchedTotal: number;
  eventsProducedTotal: number;
  updateCadenceSeconds: number | null;
};

export type SourceDetail = SourceSummary & {
  baseUrl: string | null;
  config: Record<string, unknown>;
  recentDocumentCount: number;
  recentEventCount: number;
};

type SourceRow = {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  trust_tier: number;
  authority_level: string;
  is_active: boolean;
  governance_approved: boolean;
  status: string;
  consecutive_failures: number;
  last_polled_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
  documents_fetched_total: string;
  events_produced_total: string;
  update_cadence_seconds: number | null;
};

type SourceDetailRow = SourceRow & {
  base_url: string | null;
  config: Record<string, unknown>;
  recent_document_count: string;
  recent_event_count: string;
};

function normalizeSource(row: SourceRow): SourceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sourceType: row.source_type,
    trustTier: row.trust_tier,
    authorityLevel: row.authority_level,
    isActive: row.is_active,
    governanceApproved: row.governance_approved,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastPolledAt: row.last_polled_at?.toISOString() ?? null,
    lastSuccessAt: row.last_success_at?.toISOString() ?? null,
    lastError: row.last_error,
    documentsFetchedTotal: Number(row.documents_fetched_total),
    eventsProducedTotal: Number(row.events_produced_total),
    updateCadenceSeconds: row.update_cadence_seconds,
  };
}

export async function listSources(tenantId: string): Promise<SourceSummary[]> {
  const rows = await queryRows<SourceRow>(
    tenantId,
    `
      SELECT
        id::text, name, slug, source_type, trust_tier, authority_level,
        is_active, governance_approved, status, consecutive_failures,
        last_polled_at, last_success_at, last_error,
        documents_fetched_total, events_produced_total,
        update_cadence_seconds
      FROM core.sources
      WHERE tenant_id = $1
      ORDER BY trust_tier ASC, name ASC
    `,
    [tenantId],
  );
  return rows.map(normalizeSource);
}

export async function getSourceBySlug(
  tenantId: string,
  slug: string,
): Promise<SourceDetail | null> {
  const row = await queryRow<SourceDetailRow>(
    tenantId,
    `
      SELECT
        s.id::text, s.name, s.slug, s.source_type, s.trust_tier,
        s.authority_level, s.is_active, s.governance_approved,
        s.status, s.consecutive_failures,
        s.last_polled_at, s.last_success_at, s.last_error,
        s.documents_fetched_total, s.events_produced_total,
        s.update_cadence_seconds, s.base_url, s.config,
        (SELECT COUNT(*) FROM core.documents d
         WHERE d.source_id = s.id AND d.created_at > now() - interval '24 hours'
        ) AS recent_document_count,
        (SELECT COUNT(*) FROM core.events e
         WHERE e.primary_source_id = s.id AND e.created_at > now() - interval '24 hours'
        ) AS recent_event_count
      FROM core.sources AS s
      WHERE s.tenant_id = $1 AND s.slug = $2
    `,
    [tenantId, slug],
  );
  if (!row) return null;
  return {
    ...normalizeSource(row),
    baseUrl: row.base_url,
    config: row.config ?? {},
    recentDocumentCount: Number(row.recent_document_count),
    recentEventCount: Number(row.recent_event_count),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/workspaces/sources.ts
git commit -m "feat(sources): add server-side data access layer for source management"
```

---

### Task 4: Source Admin API — List Sources

**Files:**
- Create: `apps/web/src/app/api/admin/sources/route.ts`

Authenticated endpoint for listing all ingestion sources with health status. Reuses the existing session auth pattern from watchlist routes.

- [ ] **Step 1: Create admin sources list endpoint**

Create `apps/web/src/app/api/admin/sources/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listSources } from "@/lib/workspaces/sources";

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await listSources(session.tenantId);

  const healthy = sources.filter((s) => s.status === "active" && s.isActive).length;
  const degraded = sources.filter((s) => s.status === "degraded").length;
  const disabled = sources.filter((s) => !s.isActive || s.status === "disabled").length;

  return NextResponse.json({
    data: sources,
    meta: {
      total: sources.length,
      healthy,
      degraded,
      disabled,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/admin/sources/route.ts
git commit -m "feat(admin): add GET /api/admin/sources endpoint for source health monitoring"
```

---

### Task 5: Source Admin API — Detail + Manual Trigger

**Files:**
- Create: `apps/web/src/app/api/admin/sources/[sourceSlug]/route.ts`

GET returns detailed source info. POST triggers a manual ingest via the intelligence service's Celery task.

- [ ] **Step 1: Create source detail and trigger endpoint**

Create `apps/web/src/app/api/admin/sources/[sourceSlug]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { getSourceBySlug } from "@/lib/workspaces/sources";
import { queryRow } from "@/lib/db";

type RouteContext = { params: Promise<{ sourceSlug: string }> };

export async function GET(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceSlug } = await context.params;
  const source = await getSourceBySlug(session.tenantId, sourceSlug);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json({ data: source });
}

export async function POST(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "admin" && session.role !== "analyst") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sourceSlug } = await context.params;

  // Look up source ID by slug
  type IdRow = { id: string };
  const row = await queryRow<IdRow>(
    session.tenantId,
    `SELECT id::text FROM core.sources WHERE tenant_id = $1 AND slug = $2`,
    [session.tenantId, sourceSlug],
  );

  if (!row) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // Trigger ingest via intelligence service
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL || "http://localhost:8000";
  const internalKey = process.env.INTERNAL_API_KEY || "";

  const res = await fetch(`${intelligenceUrl}/internal/trigger-ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": internalKey,
    },
    body: JSON.stringify({ source_id: row.id }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to trigger ingest", detail: await res.text() },
      { status: 502 },
    );
  }

  return NextResponse.json({
    message: "Ingest triggered",
    sourceSlug,
    sourceId: row.id,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/admin/sources/\[sourceSlug\]/route.ts
git commit -m "feat(admin): add GET/POST /api/admin/sources/[slug] for detail and manual trigger"
```

---

### Task 6: Intelligence Service — Manual Trigger Endpoint

**Files:**
- Modify: `apps/intelligence/src/narad/api/internal.py`

Add a `/internal/trigger-ingest` POST endpoint that dispatches a Celery ingest task for a specific source. This is called by the web admin API from Task 5.

- [ ] **Step 1: Add trigger-ingest endpoint**

Add the following to the end of `apps/intelligence/src/narad/api/internal.py`, before the file ends:

```python
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
```

- [ ] **Step 2: Verify the import works**

Check that `force_trigger_source_ingest` exists:

```bash
cd apps/intelligence && python -c "from narad.workers.ingest_tasks import force_trigger_source_ingest; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/intelligence/src/narad/api/internal.py
git commit -m "feat(internal): add POST /internal/trigger-ingest for manual source ingestion"
```

---

### Task 7: Public API — Event Ingestion Endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/ingest/route.ts`

POST endpoint for submitting events via the public developer API (API key auth). This allows external systems to push events into NARAD.

- [ ] **Step 1: Create the event ingestion endpoint**

Create `apps/web/src/app/api/v1/ingest/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRow } from "@/lib/db";

type InsertedRow = {
  id: string;
  created_at: Date;
};

export async function POST(request: Request) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("write")) {
    return NextResponse.json({ error: "Insufficient scope — 'write' required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "regulatory";
  const severity = typeof body.severity === "string" ? body.severity.trim() : "medium";
  const confidence = typeof body.confidence === "number" ? body.confidence : 0.5;
  const stateCode = typeof body.stateCode === "string" ? body.stateCode.trim() : null;
  const districtCode = typeof body.districtCode === "string" ? body.districtCode.trim() : null;
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const validSeverities = ["critical", "high", "medium", "low", "informational"];
  if (!validSeverities.includes(severity)) {
    return NextResponse.json(
      { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
      { status: 400 },
    );
  }

  const row = await queryRow<InsertedRow>(
    principal.tenantId,
    `
      INSERT INTO core.events (
        tenant_id, event_type, title, summary, severity, confidence,
        status, state_code, district_code, source_count, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'ingested', $7, $8, 1, $9::jsonb)
      RETURNING id::text, created_at
    `,
    [
      principal.tenantId,
      eventType,
      title,
      summary || title,
      severity,
      confidence,
      stateCode,
      districtCode,
      JSON.stringify(metadata),
    ],
  );

  const status = row ? 201 : 500;

  logApiUsage(
    principal.apiKeyId,
    principal.tenantId,
    "/api/v1/ingest",
    "POST",
    status,
    Date.now() - start,
  );

  if (!row) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        id: row.id,
        eventType,
        title,
        severity,
        status: "ingested",
        createdAt: row.created_at.toISOString(),
      },
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/v1/ingest/route.ts
git commit -m "feat(api): add POST /api/v1/ingest for external event submission via API key"
```

---

### Task 8: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify all new endpoints respond correctly**

Start the dev stack:
```bash
./start.sh --dev
```

- [ ] **Step 2: Test source listing**

```bash
TOKEN=$(cat keys/dev_token.txt)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/sources | jq '.meta'
```

Expected: JSON with `total`, `healthy`, `degraded`, `disabled` counts. Total should include Tier 1 (8) plus any Tier 2 adapters whose credentials are in `.env`.

- [ ] **Step 3: Test source detail**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/sources/pib_rss | jq '.data.name'
```

Expected: `"PIB RSS"`

- [ ] **Step 4: Test manual ingest trigger**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/sources/pib_rss | jq
```

Expected: `{ "message": "Ingest triggered", "sourceSlug": "pib_rss", "sourceId": "..." }`

- [ ] **Step 5: Test event ingestion via public API**

First create an API key:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-key","scopes":["read","write"]}' \
  http://localhost:3000/api/v1/api-keys | jq
```

Save the `raw` key from the response, then:

```bash
API_KEY="nk_..."  # paste the raw key
curl -s -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test regulatory event","eventType":"regulatory","severity":"medium","stateCode":"MH"}' \
  http://localhost:3000/api/v1/ingest | jq
```

Expected: 201 response with event `id`, `status: "ingested"`.

- [ ] **Step 6: Verify the event appears in the events API**

```bash
curl -s -H "X-API-Key: $API_KEY" http://localhost:3000/api/v1/events | jq '.data[0].title'
```

Expected: `"Test regulatory event"`

- [ ] **Step 7: Final commit (if any test fixes were needed)**

```bash
git add -A && git commit -m "fix: integration test adjustments for Phase 6 ingestion pipeline"
```

---

## Summary

| Task | What It Does | Files |
|------|-------------|-------|
| 1 | Register Tier 2 adapters with credential gating | `registry.py` + test |
| 2 | Make alert trigger lookback configurable | `config.py`, `alert_trigger.py` |
| 3 | Source data access layer | `sources.ts` |
| 4 | GET /api/admin/sources (list + health) | `route.ts` |
| 5 | GET/POST /api/admin/sources/[slug] (detail + trigger) | `route.ts` |
| 6 | POST /internal/trigger-ingest (Celery dispatch) | `internal.py` |
| 7 | POST /api/v1/ingest (public event submission) | `route.ts` |
| 8 | Integration verification | curl tests |
