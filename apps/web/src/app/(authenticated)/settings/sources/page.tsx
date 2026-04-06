import { listSources } from "@/lib/workspaces/sources";
import { getServerPrincipal } from "@/lib/server-session";
import { formatDateTime } from "@/lib/workspaces/formatting";

export default async function SourcesAdminPage() {
  const session = await getServerPrincipal();
  const sources = await listSources(session.tenantId);

  const healthy = sources.filter((s) => s.status === "active" && s.isActive).length;
  const degraded = sources.filter((s) => s.status === "degraded").length;
  const disabled = sources.filter((s) => !s.isActive || s.status === "disabled").length;

  return (
    <section className="workspace-screen" style={{ padding: "2rem" }}>
      <header className="panel" style={{ marginBottom: "2rem" }}>
        <p className="eyebrow">Settings / Ingestion Admin</p>
        <h1 className="hero-title">Intelligence Sources Dashboard</h1>
        <p className="hero-copy" style={{ color: "#a1a1aa" }}>Monitor adapter health, throughput, and feed governance mapping for the NARAD engine.</p>
        
        <div className="data-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginTop: "1.5rem" }}>
          <div className="data-point">
            <span>Total Registered Feeds</span>
            <strong>{sources.length}</strong>
          </div>
          <div className="data-point">
            <span>Active & Healthy</span>
            <strong style={{ color: "#10b981" }}>{healthy}</strong>
          </div>
          <div className="data-point">
            <span>Degraded</span>
            <strong style={{ color: "#eab308" }}>{degraded}</strong>
          </div>
          <div className="data-point">
            <span>Disabled / Paused</span>
            <strong style={{ color: "#ef4444" }}>{disabled}</strong>
          </div>
        </div>
      </header>

      <div className="workspace-columns workspace-columns--three">
        {sources.map((source) => {
          const isActive = source.isActive && source.status === "active";
          return (
            <article key={source.id} className="feed-card" style={{ border: isActive ? "1px solid #10b981" : "1px solid #ef4444", backgroundColor: "#09090b" }}>
              <div className="feed-card__meta">
                <span className={`pill ${isActive ? "pill--cyan" : ""}`}>
                  Tier {source.trustTier}
                </span>
                <span className="pill">{source.sourceType}</span>
              </div>
              
              <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                <strong style={{ fontSize: "1.1rem" }}>{source.name}</strong>
                <p style={{ color: "#a1a1aa", fontSize: "0.80rem" }}>Slug: {source.slug} • Governance: {source.governanceApproved ? "Approved" : "Pending"}</p>
              </div>

              <div className="data-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "1rem" }}>
                 <div className="data-point">
                   <span style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Documents Fetched</span>
                   <strong style={{ fontSize: "0.875rem" }}>{source.documentsFetchedTotal}</strong>
                 </div>
                 <div className="data-point">
                   <span style={{ fontSize: "0.75rem", color: "#a1a1aa" }}>Events Produced</span>
                   <strong style={{ fontSize: "0.875rem" }}>{source.eventsProducedTotal}</strong>
                 </div>
              </div>
              
              <div style={{ marginTop: "1rem", borderTop: "1px solid #27272a", paddingTop: "0.5rem", fontSize: "0.75rem", color: "#71717a" }}>
                Last Polled: {formatDateTime(source.lastPolledAt, "Never")} <br/>
                {source.lastError && (
                  <span style={{ color: "#ef4444" }}>Error: {source.lastError}</span>
                )}
              </div>
            </article>
          );
        })}
        {sources.length === 0 && (
          <div className="panel" style={{ gridColumn: "span 3", textAlign: "center" }}>
            <h2>No Sources Registered</h2>
            <p>Use the ingestion API or database seeds to register Tier 1, 2, and 3 intelligence nodes.</p>
          </div>
        )}
      </div>
    </section>
  );
}
