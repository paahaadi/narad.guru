import { formatMetric } from "./shared";
import { safeQueryRow, safeQueryRows } from "./shared";

export type WatchlistsWorkspaceData = {
  isFallback: boolean;
  metrics: Array<{ label: string; value: string; accent?: string; meta?: string }>;
  spotlight: {
    watchlistId: string;
    name: string;
    description: string;
    isActive: boolean;
    totalAlertCount: number;
  };
  watchlists: Array<{
    watchlistId: string;
    name: string;
    isActive: boolean;
    ruleCount: number;
    itemCount: number;
    openAlertCount: number;
  }>;
  recentDeltas: Array<{
    deltaId: string;
    deltaType: string;
    watchlistName: string;
    summary: string;
    computedAt: string;
  }>;
  recommendations: string[];
};

export type Watchlist = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isPriority: boolean;
  category: string | null;
  folderPath: string;
  ruleCount: number;
  alertCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistRule = {
  id: string;
  watchlistId: string;
  ruleName: string;
  description: string | null;
  condition: Record<string, unknown>;
  severityOverride: string | null;
  isActive: boolean;
  createdAt: string;
};

export type WatchlistAlert = {
  id: string;
  watchlistId: string;
  ruleId: string;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  triggeredByEventId: string | null;
  triggeredByEntityId: string | null;
  episodeId: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistMetrics = {
  totalWatchlists: number;
  activeWatchlists: number;
  totalAlerts: number;
  newAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  totalRules: number;
};

export async function getWatchlistMetrics(tenantId: string): Promise<WatchlistMetrics> {
  const row = await safeQueryRow<{
    total_watchlists: string;
    active_watchlists: string;
    total_alerts: string;
    new_alerts: string;
    critical_alerts: string;
    high_alerts: string;
    total_rules: string;
  }>(
    tenantId,
    `
      SELECT
        (SELECT COUNT(*) FROM workflow.watchlists WHERE tenant_id = $1) AS total_watchlists,
        (SELECT COUNT(*) FROM workflow.watchlists WHERE tenant_id = $1 AND is_active = TRUE) AS active_watchlists,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts WHERE tenant_id = $1) AS total_alerts,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts WHERE tenant_id = $1 AND status = 'new') AS new_alerts,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts WHERE tenant_id = $1 AND severity = 'critical') AS critical_alerts,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts WHERE tenant_id = $1 AND severity = 'high') AS high_alerts,
        (SELECT COUNT(*) FROM workflow.watchlist_rules WHERE tenant_id = $1) AS total_rules
    `,
    [tenantId],
  );

  return {
    totalWatchlists: Number(row?.total_watchlists ?? 0),
    activeWatchlists: Number(row?.active_watchlists ?? 0),
    totalAlerts: Number(row?.total_alerts ?? 0),
    newAlerts: Number(row?.new_alerts ?? 0),
    criticalAlerts: Number(row?.critical_alerts ?? 0),
    highAlerts: Number(row?.high_alerts ?? 0),
    totalRules: Number(row?.total_rules ?? 0),
  };
}

export async function listWatchlists(tenantId: string): Promise<Watchlist[]> {
  const rows = await safeQueryRows<{
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    is_priority: boolean;
    category: string | null;
    folder_path: string | null;
    rule_count: string;
    alert_count: string;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        w.id::text,
        w.name,
        w.description,
        w.is_active,
        w.is_priority,
        w.category,
        w.folder_path,
        (SELECT COUNT(*) FROM workflow.watchlist_rules r WHERE r.watchlist_id = w.id) AS rule_count,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts a WHERE a.watchlist_id = w.id) AS alert_count,
        w.created_at,
        w.updated_at
      FROM workflow.watchlists AS w
      WHERE w.tenant_id = $1
      ORDER BY w.is_priority DESC, w.name ASC
    `,
    [tenantId],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
    isPriority: r.is_priority,
    category: r.category,
    folderPath: r.folder_path ?? "/",
    ruleCount: Number(r.rule_count),
    alertCount: Number(r.alert_count),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getWatchlist(tenantId: string, watchlistId: string): Promise<Watchlist | null> {
  const r = await safeQueryRow<{
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    is_priority: boolean;
    category: string | null;
    folder_path: string | null;
    rule_count: string;
    alert_count: string;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        w.id::text, w.name, w.description, w.is_active, w.is_priority,
        w.category, w.folder_path,
        (SELECT COUNT(*) FROM workflow.watchlist_rules r WHERE r.watchlist_id = w.id) AS rule_count,
        (SELECT COUNT(*) FROM workflow.watchlist_alerts a WHERE a.watchlist_id = w.id) AS alert_count,
        w.created_at, w.updated_at
      FROM workflow.watchlists AS w
      WHERE w.tenant_id = $1 AND w.id = $2
    `,
    [tenantId, watchlistId],
  );

  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
    isPriority: r.is_priority,
    category: r.category,
    folderPath: r.folder_path ?? "/",
    ruleCount: Number(r.rule_count),
    alertCount: Number(r.alert_count),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listWatchlistRules(tenantId: string, watchlistId: string): Promise<WatchlistRule[]> {
  const rows = await safeQueryRows<{
    id: string;
    watchlist_id: string;
    rule_name: string;
    description: string | null;
    condition: Record<string, unknown>;
    severity_override: string | null;
    is_active: boolean;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT r.id::text, r.watchlist_id::text, r.rule_name, r.description,
             r.condition, r.severity_override, r.is_active, r.created_at
      FROM workflow.watchlist_rules AS r
      WHERE r.tenant_id = $1 AND r.watchlist_id = $2
      ORDER BY r.created_at DESC
    `,
    [tenantId, watchlistId],
  );

  return rows.map((r) => ({
    id: r.id,
    watchlistId: r.watchlist_id,
    ruleName: r.rule_name,
    description: r.description,
    condition: r.condition,
    severityOverride: r.severity_override,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listWatchlistAlerts(
  tenantId: string,
  watchlistId?: string,
  options?: { status?: string; severity?: string; limit?: number },
): Promise<WatchlistAlert[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 10), 500);
  const conditions = ["a.tenant_id = $1"];
  const values: unknown[] = [tenantId];
  let paramIndex = 2;

  if (watchlistId) {
    conditions.push(`a.watchlist_id = $${paramIndex}`);
    values.push(watchlistId);
    paramIndex++;
  }
  if (options?.status) {
    conditions.push(`a.status = $${paramIndex}`);
    values.push(options.status);
    paramIndex++;
  }
  if (options?.severity) {
    conditions.push(`a.severity = $${paramIndex}`);
    values.push(options.severity);
    paramIndex++;
  }

  values.push(limit);

  const rows = await safeQueryRows<{
    id: string;
    watchlist_id: string;
    rule_id: string;
    severity: string;
    status: string;
    title: string;
    summary: string | null;
    triggered_by_event_id: string | null;
    triggered_by_entity_id: string | null;
    episode_id: string | null;
    assigned_to: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        a.id::text, a.watchlist_id::text, a.rule_id::text, a.severity, a.status,
        a.title, a.summary, a.triggered_by_event_id::text, a.triggered_by_entity_id::text,
        a.episode_id::text, a.assigned_to::text, a.created_at, a.updated_at
      FROM workflow.watchlist_alerts AS a
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex}
    `,
    values,
  );

  return rows.map((r) => ({
    id: r.id,
    watchlistId: r.watchlist_id,
    ruleId: r.rule_id,
    severity: r.severity,
    status: r.status,
    title: r.title,
    summary: r.summary,
    triggeredByEventId: r.triggered_by_event_id,
    triggeredByEntityId: r.triggered_by_entity_id,
    episodeId: r.episode_id,
    assignedTo: r.assigned_to,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getWatchlistsWorkspaceData(tenantId: string): Promise<WatchlistsWorkspaceData> {
  const [metrics, watchlists, recentAlerts] = await Promise.all([
    getWatchlistMetrics(tenantId),
    listWatchlists(tenantId),
    listWatchlistAlerts(tenantId, undefined, { limit: 20 }),
  ]);

  const isFallback = watchlists.length === 0;

  const spotlight = watchlists[0]
    ? {
        watchlistId: watchlists[0].id,
        name: watchlists[0].name,
        description: watchlists[0].description ?? "Primary watchlist",
        isActive: watchlists[0].isActive,
        totalAlertCount: watchlists[0].alertCount,
      }
    : {
        watchlistId: "none",
        name: "No watchlists configured",
        description: "Create a watchlist to begin monitoring entities and events against your rule engine.",
        isActive: false,
        totalAlertCount: 0,
      };

  const watchlistCards = watchlists.map((w) => ({
    watchlistId: w.id,
    name: w.name,
    isActive: w.isActive,
    ruleCount: w.ruleCount,
    itemCount: w.ruleCount,
    openAlertCount: w.alertCount,
  }));

  const recentDeltas = recentAlerts.slice(0, 10).map((a) => ({
    deltaId: a.id,
    deltaType: a.severity === "critical" ? "critical_alert" : "new_alert",
    watchlistName: watchlists.find((w) => w.id === a.watchlistId)?.name ?? "Unknown",
    summary: a.title,
    computedAt: a.createdAt,
  }));

  const recommendations: string[] = [];
  if (isFallback) {
    recommendations.push("Create your first watchlist to begin monitoring.");
  }
  if (metrics.totalRules === 0 && !isFallback) {
    recommendations.push("Add rules to your watchlists to enable automated alert generation.");
  }
  if (metrics.newAlerts > 5) {
    recommendations.push(`${metrics.newAlerts} untriaged alerts — consider reviewing the alert queue.`);
  }
  if (metrics.criticalAlerts > 0) {
    recommendations.push(`${metrics.criticalAlerts} critical alert(s) require immediate attention.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("All watchlists operating normally. No action required.");
  }

  return {
    isFallback,
    metrics: [
      { label: "Active watchlists", value: formatMetric(metrics.activeWatchlists), accent: "accent-cyan" },
      { label: "Total rules", value: formatMetric(metrics.totalRules) },
      { label: "Open alerts", value: formatMetric(metrics.totalAlerts), accent: metrics.totalAlerts > 0 ? "accent-orange" : undefined },
      { label: "New / untriaged", value: formatMetric(metrics.newAlerts), accent: metrics.newAlerts > 0 ? "accent-red" : undefined },
      { label: "Critical", value: formatMetric(metrics.criticalAlerts), accent: metrics.criticalAlerts > 0 ? "accent-red" : undefined, meta: `${formatMetric(metrics.highAlerts)} high` },
    ],
    spotlight,
    watchlists: watchlistCards,
    recentDeltas,
    recommendations,
  };
}
