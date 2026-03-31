import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { asNumber, asString } from "@/lib/workspaces/shared";
import type { CorpWatchGraphData } from "@/lib/workspaces/corpwatch-types";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId } = await params;
  const rows = await queryRows<{
    relationship_id: string;
    source_entity_id: string;
    source_name: string;
    source_type: string;
    source_risk: string | number | null;
    source_health: string | number | null;
    target_entity_id: string;
    target_name: string;
    target_type: string;
    target_risk: string | number | null;
    target_health: string | number | null;
    relationship_type: string;
    confidence: string | number | null;
    direction: string | null;
  }>(
    session.tenantId,
    `
      SELECT
        r.id::text AS relationship_id,
        r.source_entity_id::text AS source_entity_id,
        source_e.canonical_name AS source_name,
        source_e.entity_type AS source_type,
        source_e.risk_score AS source_risk,
        source_e.health_score AS source_health,
        r.target_entity_id::text AS target_entity_id,
        target_e.canonical_name AS target_name,
        target_e.entity_type AS target_type,
        target_e.risk_score AS target_risk,
        target_e.health_score AS target_health,
        r.relationship_type,
        r.confidence,
        CASE
          WHEN r.source_entity_id = $2::uuid THEN 'outbound'
          WHEN r.target_entity_id = $2::uuid THEN 'inbound'
          ELSE 'bidirectional'
        END AS direction
      FROM core.relationships AS r
      JOIN core.entities AS source_e ON source_e.id = r.source_entity_id
      JOIN core.entities AS target_e ON target_e.id = r.target_entity_id
      WHERE r.tenant_id = $1 AND (r.source_entity_id = $2::uuid OR r.target_entity_id = $2::uuid)
      ORDER BY r.confidence DESC, r.updated_at DESC
      LIMIT 50
    `,
    [session.tenantId, entityId],
  );

  const nodesById = new Map<string, CorpWatchGraphData["nodes"][number]>();
  nodesById.set(entityId, {
    entityId,
    name: "Central entity",
    entityType: "entity",
    riskScore: 0,
    healthScore: 0,
    isCentral: true,
  });

  const edges: CorpWatchGraphData["edges"] = rows.map((row) => {
    const sourceIsCentral = row.source_entity_id === entityId;
    const targetIsCentral = row.target_entity_id === entityId;

    const sourceNode = {
      entityId: row.source_entity_id,
      name: row.source_name,
      entityType: row.source_type,
      riskScore: asNumber(row.source_risk),
      healthScore: asNumber(row.source_health),
      isCentral: sourceIsCentral,
    };
    const targetNode = {
      entityId: row.target_entity_id,
      name: row.target_name,
      entityType: row.target_type,
      riskScore: asNumber(row.target_risk),
      healthScore: asNumber(row.target_health),
      isCentral: targetIsCentral,
    };

    nodesById.set(sourceNode.entityId, sourceNode);
    nodesById.set(targetNode.entityId, targetNode);

    return {
      relationshipId: row.relationship_id,
      sourceEntityId: row.source_entity_id,
      targetEntityId: row.target_entity_id,
      sourceName: row.source_name,
      targetName: row.target_name,
      sourceType: row.source_type,
      targetType: row.target_type,
      relationshipType: row.relationship_type,
      confidence: asNumber(row.confidence),
      direction: row.direction === "inbound" || row.direction === "bidirectional" ? row.direction : "outbound",
    };
  });

  const nodes = [...nodesById.values()].map((node) => ({
    ...node,
    name: asString(node.name, "Entity"),
  }));

  return NextResponse.json({
    entityId,
    nodes,
    edges,
  });
}
