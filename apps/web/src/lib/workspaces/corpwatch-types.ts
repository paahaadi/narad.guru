export type CorpWatchEntityExternalIds = Record<string, string>;

export type CorpWatchSearchResult = {
  entityId: string;
  canonicalName: string;
  entityType: string;
  description: string;
  riskScore: number;
  healthScore: number;
  locationLabel: string;
  aliases: string[];
  externalIds: CorpWatchEntityExternalIds;
  matchType: string;
  isResolved: boolean;
  updatedAt: string | null;
};

export type CorpWatchRelationshipEdge = {
  relationshipId: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceName: string;
  targetName: string;
  sourceType: string;
  targetType: string;
  relationshipType: string;
  confidence: number;
  direction: "outbound" | "inbound" | "bidirectional";
};

export type CorpWatchGraphNode = {
  entityId: string;
  name: string;
  entityType: string;
  riskScore: number;
  healthScore: number;
  isCentral: boolean;
};

export type CorpWatchGraphData = {
  entityId: string;
  nodes: CorpWatchGraphNode[];
  edges: CorpWatchRelationshipEdge[];
};

export type CorpWatchFiling = {
  documentId: string;
  title: string;
  docType: string;
  sourceName: string;
  fetchUrl: string | null;
  publishedAt: string | null;
  excerpt: string;
  eventId: string | null;
  eventTitle: string | null;
};

export type CorpWatchEvent = {
  eventId: string;
  title: string;
  eventType: string;
  severity: string;
  summary: string | null;
  occurredAt: string | null;
  sourceName: string | null;
};

export type CorpWatchNarrative = {
  entityId: string;
  tenantId: string;
  narrative: string;
  confidence: number;
  generatedBy: string;
  expiresAt: string | null;
  cached: boolean;
};

export type CorpWatchEntityProfile = {
  entityId: string;
  canonicalName: string;
  entityType: string;
  description: string;
  riskScore: number;
  healthScore: number;
  location: {
    label: string;
    stateCode: string | null;
    districtCode: string | null;
    lat: number | null;
    lon: number | null;
  };
  aliases: string[];
  externalIds: CorpWatchEntityExternalIds;
  corpWatch: {
    sector: string;
    companyStatus: string;
    listingStatus: string;
    filingCompleteness: number;
    registeredOffice: string;
    lastFilingDate: string | null;
    directors: Array<{ name: string; role: string }>;
    shareholders: Array<{ name: string; stake: number }>;
    paidUpCapitalInr: number | null;
    authorizedCapitalInr: number | null;
    complianceBreachCount: number;
  };
  recentEvents: CorpWatchEvent[];
  keyRelationships: Array<{
    relationshipId: string;
    targetEntityId: string;
    targetName: string;
    targetType: string;
    relationshipType: string;
    confidence: number;
    direction: "outbound" | "inbound" | "bidirectional";
  }>;
  narrative: CorpWatchNarrative | null;
  updatedAt: string | null;
  projectedAt: string | null;
};

export type CorpWatchSearchResponse = {
  query: string;
  limit: number;
  items: CorpWatchSearchResult[];
};

export type CorpWatchGraphResponse = CorpWatchGraphData;

export type CorpWatchFilingListResponse = {
  entityId: string;
  limit: number;
  offset: number;
  total: number;
  items: CorpWatchFiling[];
};

export type CorpWatchEventListResponse = {
  entityId: string;
  limit: number;
  offset: number;
  total: number;
  items: CorpWatchEvent[];
};
