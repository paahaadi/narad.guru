import { getEntityProfile, getEntityGraph } from "@/lib/workspaces/corpwatch-client";
import { NetworkGraph } from "@/features/corpwatch/network-graph";
import Link from "next/link";
import { notFound } from "next/navigation";

function riskPill(score: number) {
  if (score >= 70) return "pill pill--critical";
  if (score >= 40) return "pill pill--high";
  if (score > 0) return "pill pill--cyan";
  return "pill";
}

export default async function CorpWatchProfilePage({ params }: { params: Promise<{ entityId: string }> | any }) {
  const resolvedParams = await Promise.resolve(params);
  
  if (!resolvedParams.entityId) {
    notFound();
  }

  let profile;
  let graph;
  try {
    profile = await getEntityProfile(resolvedParams.entityId);
    graph = await getEntityGraph(resolvedParams.entityId);
  } catch (err) {
    console.error("Failed to fetch entity details", err);
    notFound();
  }

  return (
    <section className="workspace-screen" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      <header className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow"><Link href="/corpwatch" style={{ color: "#3b82f6" }}>&larr; Back to Search</Link></p>
            <h1 className="hero-title" style={{ marginTop: "0.5rem" }}>{profile.canonicalName}</h1>
            <p className="hero-copy" style={{ color: "#a1a1aa" }}>{profile.entityType} • {profile.description}</p>
          </div>
          <div className="cluster-row">
             <span className={riskPill(profile.riskScore)}>Confidence {Math.round(profile.riskScore)}%</span>
             <span className="pill">{profile.corpWatch?.companyStatus || "Active"}</span>
          </div>
        </div>

        <div className="data-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          <div className="data-point">
            <span style={{ fontSize: "0.875rem", color: "#a1a1aa" }}>Aliases</span>
            <strong style={{ display: "block", marginTop: "0.25rem" }}>{profile.aliases.length > 0 ? profile.aliases.join(", ") : "None detected"}</strong>
          </div>
        </div>

        {Object.keys(profile.externalIds).length > 0 && (
          <div className="data-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
            {Object.entries(profile.externalIds).map(([key, value]) => (
              <div className="data-point" key={key}>
                <span style={{ fontSize: "0.875rem", color: "#a1a1aa", textTransform: "uppercase" }}>{key}</span>
                <strong style={{ display: "block", marginTop: "0.25rem" }}>{value as string}</strong>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="workspace-columns workspace-columns--two" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
        <article className="panel">
          <h2 className="section-heading" style={{ marginBottom: "1rem" }}>Event & Entity Relationship Graph</h2>
          <NetworkGraph data={graph} />
        </article>

        <aside className="panel">
           <h2 className="section-heading">Recent Pipeline Activity</h2>
           <div className="list-stack" style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
             {/* Simple stand-in for events since we display connected graph nodes instead! */}
             <div className="feed-card">
                <strong>{graph.edges.length} Relationships mapped</strong>
                <p>Derived from real-time events ingested from Tier 1 sources.</p>
             </div>
             <p style={{ color: "#a1a1aa", fontSize: "0.875rem" }}>
               Full narrative analysis and RAG QA is pending in the LexPulse interface. 
             </p>
           </div>
        </aside>
      </div>

    </section>
  );
}
