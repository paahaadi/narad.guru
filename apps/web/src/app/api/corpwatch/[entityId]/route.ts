import { NextResponse } from "next/server";
import { queryRow, queryRows } from "@/lib/db";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "@/lib/workspaces/shared";
import type { CorpWatchEntityProfile } from "@/lib/workspaces/corpwatch-types";
import { requireApiSession } from "../_helpers";

type ProfileRow = {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  description: string | null;
  risk_score: string | number | null;
  health_score: string | number | null;
  aliases: string[] | null;
  external_ids: unknown;
  updated_at: Date | string | null;
  projected_at: Date | string | null;
  summary: unknown;
  narrative: string | null;
  narrative_confidence: string | number | null;
  narrative_generated_by: string | null;
  narrative_expires_at: Date | string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId } = await params;
  const profile = await queryRow<ProfileRow>(
    session.tenantId,
    `
      SELECT
        e.id::text AS entity_id,
        e.canonical_name,
        e.entity_type,
        e.description,
        e.risk_score,
        e.health_score,
        e.aliases,
        e.external_ids,
        e.updated_at,
        ps.projected_at,
        ps.summary,
        en.narrative,
        en.confidence AS narrative_confidence,
        en.generated_by AS narrative_generated_by,
        en.expires_at AS narrative_expires_at
      FROM core.entities AS e
      LEFT JOIN projections.entity_summaries AS ps
        ON ps.entity_id = e.id AND ps.tenant_id = e.tenant_id
      LEFT JOIN corp_watch.entity_narratives AS en
        ON en.entity_id = e.id AND en.tenant_id = e.tenant_id AND en.expires_at > now()
      WHERE e.tenant_id = $1 AND e.id = $2::uuid
    `,
    [session.tenantId, entityId],
  );

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary = asRecord(profile.summary);
  const location = asRecord(summary.location);
  const corpWatch = asRecord(summary.corp_watch);
  const recentEvents = asArray<Record<string, unknown>>(summary.recent_events).slice(0, 8);
  const keyRelationships = asArray<Record<string, unknown>>(summary.key_relationships).slice(0, 12);

  const relationshipRows = await queryRows<{
    relationship_id: string;
    target_entity_id: string;
    target_name: string;
    target_type: string;
    relationship_type: string;
    confidence: string | number | null;
    direction: string | null;
  }>(
    session.tenantId,
    `
      SELECT
        r.id::text AS relationship_id,
        CASE WHEN r.source_entity_id = $2::uuid THEN r.target_entity_id::text ELSE r.source_entity_id::text END AS target_entity_id,
        CASE WHEN r.source_entity_id = $2::uuid THEN target_e.canonical_name ELSE source_e.canonical_name END AS target_name,
        CASE WHEN r.source_entity_id = $2::uuid THEN target_e.entity_type ELSE source_e.entity_type END AS target_type,
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
      LIMIT 12
    `,
    [session.tenantId, entityId],
  );

  const eventRows = await queryRows<{
    event_id: string;
    title: string;
    event_type: string;
    severity: string;
    summary: string | null;
    occurred_at: Date | string | null;
    source_name: string | null;
  }>(
    session.tenantId,
    `
      SELECT
        ev.id::text AS event_id,
        ev.title,
        ev.event_type,
        ev.severity,
        ev.summary,
        COALESCE(ev.occurred_at, ev.created_at) AS occurred_at,
        s.name AS source_name
      FROM core.event_entity_links AS eel
      JOIN core.events AS ev ON ev.id = eel.event_id
      LEFT JOIN core.event_document_links AS edl ON edl.event_id = ev.id AND edl.tenant_id = ev.tenant_id
      LEFT JOIN core.documents AS d ON d.id = edl.document_id
      LEFT JOIN core.sources AS s ON s.id = d.source_id
      WHERE eel.tenant_id = $1 AND eel.entity_id = $2::uuid
      ORDER BY COALESCE(ev.occurred_at, ev.created_at) DESC
      LIMIT 12
    `,
    [session.tenantId, entityId],
  );

  const result: CorpWatchEntityProfile = {
    entityId: profile.entity_id,
    canonicalName: profile.canonical_name,
    entityType: profile.entity_type,
    description: asString(profile.description, ""),
    riskScore: asNumber(profile.risk_score),
    healthScore: asNumber(profile.health_score),
    location: {
      label: asOptionalString(location.label) ?? "Location pending",
      stateCode: asOptionalString(location.state_code),
      districtCode: asOptionalString(location.district_code),
      lat: typeof location.lat === "number" ? location.lat : asNumber(location.lat, NaN),
      lon: typeof location.lon === "number" ? location.lon : asNumber(location.lon, NaN),
    },
    aliases: asArray<string>(profile.aliases),
    externalIds: asRecord(profile.external_ids) as Record<string, string>,
    corpWatch: {
      sector: asString(corpWatch.sector, "Cross-sector"),
      companyStatus: asString(corpWatch.company_status, "Observed"),
      listingStatus: asString(corpWatch.listing_status, "Unlisted"),
      filingCompleteness: asNumber(corpWatch.filing_completeness),
      registeredOffice: asString(corpWatch.registered_office, "Not available"),
      lastFilingDate: asOptionalString(corpWatch.last_filing_date),
      directors: asArray<Record<string, unknown>>(corpWatch.directors).map((director) => ({
        name: asString(director.name, "Director"),
        role: asString(director.role, "Executive"),
      })),
      shareholders: asArray<Record<string, unknown>>(corpWatch.shareholders).map((shareholder) => ({
        name: asString(shareholder.name, "Shareholder"),
        stake: asNumber(shareholder.stake),
      })),
      paidUpCapitalInr: asOptionalString(corpWatch.paid_up_capital_inr) ? asNumber(corpWatch.paid_up_capital_inr) : null,
      authorizedCapitalInr: asOptionalString(corpWatch.authorized_capital_inr) ? asNumber(corpWatch.authorized_capital_inr) : null,
      complianceBreachCount: asNumber(corpWatch.compliance_breach_count),
    },
    recentEvents: recentEvents.map((event) => ({
      eventId: asString(event.event_id, ""),
      title: asString(event.title, "Event"),
      eventType: asString(event.event_type, "event"),
      severity: asString(event.severity, "informational"),
      summary: asOptionalString(event.summary),
      occurredAt:
        event.occurred_at instanceof Date
          ? event.occurred_at.toISOString()
          : event.occurred_at
            ? String(event.occurred_at)
            : null,
      sourceName: asOptionalString(event.source_name),
    })),
    keyRelationships: keyRelationships.map((relationship, index) => ({
      relationshipId: asString(relationship.relationship_id, `relationship-${index}`),
      targetEntityId: asString(relationship.target_entity_id, ""),
      targetName: asString(relationship.target_name, "Connected entity"),
      targetType: asString(relationship.target_type, "entity"),
      relationshipType: asString(relationship.relationship_type, "related"),
      confidence: asNumber(relationship.confidence),
      direction:
        relationship.direction === "inbound" || relationship.direction === "bidirectional"
          ? (relationship.direction as "inbound" | "bidirectional")
          : "outbound",
    })),
    narrative: profile.narrative
      ? {
          entityId: profile.entity_id,
          tenantId: session.tenantId,
          narrative: profile.narrative,
          confidence: asNumber(profile.narrative_confidence, 0.65),
          generatedBy: asString(profile.narrative_generated_by, "projection-cache"),
          expiresAt:
            profile.narrative_expires_at instanceof Date
              ? profile.narrative_expires_at.toISOString()
              : profile.narrative_expires_at
                ? String(profile.narrative_expires_at)
                : null,
          cached: true,
        }
      : null,
    updatedAt:
      profile.updated_at instanceof Date
        ? profile.updated_at.toISOString()
        : profile.updated_at
          ? String(profile.updated_at)
          : null,
    projectedAt:
      profile.projected_at instanceof Date
        ? profile.projected_at.toISOString()
        : profile.projected_at
          ? String(profile.projected_at)
          : null,
  };

  return NextResponse.json(result);
}
