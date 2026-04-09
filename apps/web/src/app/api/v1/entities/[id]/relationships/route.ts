import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRows } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("read")) {
    return NextResponse.json({ error: "Insufficient scope — 'read' required" }, { status: 403 });
  }

  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;

  try {
    // 1. Find recent events impacting this entity
    const eventLinks = await queryRows<any>(
      principal.tenantId,
      `
        SELECT 
          e.id as event_id, 
          e.title, 
          e.event_type, 
          e.severity, 
          e.occurred_at, 
          eel.role, 
          eel.confidence
        FROM core.event_entity_links eel
        JOIN core.events e ON e.id = eel.event_id AND e.tenant_id = eel.tenant_id
        WHERE eel.tenant_id = $1 AND eel.entity_id = $2
        ORDER BY e.occurred_at DESC
        LIMIT 100
      `,
      [principal.tenantId, id]
    );

    // 2. Find co-occurrences (other entities mentioned in those exact same events)
    const coEntities = await queryRows<any>(
      principal.tenantId,
      `
        SELECT DISTINCT 
          ce.id as entity_id, 
          ce.canonical_name, 
          ce.entity_type, 
          ceel.role
        FROM core.event_entity_links eel
        JOIN core.event_entity_links ceel 
          ON ceel.event_id = eel.event_id 
         AND ceel.tenant_id = eel.tenant_id
        JOIN core.entities ce 
          ON ce.id = ceel.entity_id 
         AND ce.tenant_id = ceel.tenant_id
        WHERE eel.tenant_id = $1 
          AND eel.entity_id = $2 
          AND ceel.entity_id != $2
        LIMIT 50
      `,
      [principal.tenantId, id]
    );

    logApiUsage(
      principal.apiKeyId,
      principal.tenantId,
      `/api/v1/entities/${id}/relationships`,
      "GET",
      200,
      Date.now() - start
    );

    // Provide the standardized graph payload { nodes, edges } as confirmed during implementation plan.
    const nodes = [
      ...eventLinks.map((event: any) => ({
        id: event.event_id,
        type: "event",
        label: event.title,
        attributes: { eventType: event.event_type, severity: event.severity, occurredAt: event.occurred_at },
      })),
      ...coEntities.map((entity: any) => ({
        id: entity.entity_id,
        type: "entity",
        label: entity.canonical_name,
        attributes: { entityType: entity.entity_type, role: entity.role },
      }))
    ];

    const edges = [
      ...eventLinks.map((event: any) => ({
        source: id,
        target: event.event_id,
        type: "mentions",
        attributes: { role: event.role, confidence: event.confidence }
      })),
      ...coEntities.map((entity: any) => ({
        // We know they co-occurred, but we don't know exactly which event from the set without a group by,
        // so we just link them to the main entity for visualization logic.
        source: id,
        target: entity.entity_id,
        type: "co-occurrence",
        attributes: { role: entity.role }
      }))
    ];

    return NextResponse.json({
      data: {
        nodes,
        edges,
        // Also return raw tables for non-graph views
        raw: {
          events: eventLinks,
          related_entities: coEntities
        }
      }
    });

  } catch (err) {
    console.error("Failed to fetch entity relationships:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
