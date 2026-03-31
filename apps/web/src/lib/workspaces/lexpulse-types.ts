export type LexPulseEvidenceDocument = {
  documentId: string;
  title: string;
  docType: string;
  fetchUrl: string | null;
  publishedAt: string | null;
  excerpt: string;
  sourceName: string;
  trustScore: number;
  regulator: string | null;
  affectedSectors: string[];
};

export type LexPulseAnswer = {
  cacheId: string | null;
  queryText: string;
  title: string;
  directAnswer: string;
  whatChanged: string[];
  whyItMatters: string;
  affectedSectors: string[];
  confidence: number;
  cached: boolean;
  generatedBy: string;
  evidence: LexPulseEvidenceDocument[];
};

export type LexPulseWatchlist = {
  watchlistId: string;
  name: string;
  description: string;
  isActive: boolean;
  alertCount: number;
  unresolvedAlertCount: number;
  ownerId: string;
  updatedAt: string | null;
};

export type LexPulseDigestSummary = {
  digestId: string;
  eventId: string;
  title: string;
  severity: string;
  regulatorLabel: string;
  effectiveDate: string | null;
  summary: string;
  whatChanged: string[];
  whyItMatters: string;
  affectedSectors: string[];
  evidence: LexPulseEvidenceDocument[];
  affectedEntities: Array<{ name: string; role: string }>;
  updatedAt: string | null;
};

export type LexPulseSectorForecast = {
  sectorName: string;
  frictionChangePct: number;
  periodLabel: string;
  narrative: string;
};

export type LexPulseFeedback = {
  feedbackId: string;
  queryCacheId: string;
  userId: string;
  rating: "up" | "down";
  createdAt: string;
};

export type LexPulseQueryRequest = {
  queryText: string;
  forceRefresh?: boolean;
};

export type LexPulseQueryResponse = LexPulseAnswer;

export type LexPulseWatchlistsResponse = {
  items: LexPulseWatchlist[];
};

export type LexPulseDigestsResponse = {
  items: LexPulseDigestSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type LexPulseSectorsResponse = {
  items: LexPulseSectorForecast[];
};
