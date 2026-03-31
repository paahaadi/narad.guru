function StaticMetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; accent?: string }>;
}) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <article key={item.label} className="metric-card">
          <span className="metric-card__label">{item.label}</span>
          <strong className={`metric-card__value${item.accent ? ` ${item.accent}` : ""}`}>
            {item.value}
          </strong>
        </article>
      ))}
    </div>
  );
}

export function CorpWatchWorkspace() {
  return (
    <section className="workspace-screen">
      <StaticMetricStrip
        items={[
          { label: "Monitored entities", value: "248" },
          { label: "Escalated ownership shifts", value: "11", accent: "accent-orange" },
          { label: "Counterparty alerts", value: "07", accent: "accent-red" },
          { label: "Watchlist pressure", value: "steady" },
        ]}
      />

      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <p className="eyebrow">Entity Hero</p>
          <h1 className="hero-title">Bharat Logistics Holdings</h1>
          <p className="hero-copy">
            Control stack remains stable, but three downstream subsidiaries have shifted
            procurement exposure toward red-flag jurisdictions in the past 72 hours.
          </p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Risk summary</p>
              <ul className="timeline-list">
                <li>Two board overlaps with already-monitored infrastructure firms.</li>
                <li>Foreign beneficial ownership concentration increased 8.1% QoQ.</li>
                <li>Debt rollover window narrows inside the next 14 days.</li>
              </ul>
            </section>
            <section className="panel panel--muted">
              <p className="eyebrow">Executive data</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Ultimate parent</span>
                  <strong>BLH Strategic Group</strong>
                </div>
                <div className="data-point">
                  <span>Jurisdictions</span>
                  <strong>7</strong>
                </div>
                <div className="data-point">
                  <span>Risk score</span>
                  <strong>71 / 100</strong>
                </div>
                <div className="data-point">
                  <span>Open legal actions</span>
                  <strong>3</strong>
                </div>
              </div>
            </section>
          </div>
        </article>

        <aside className="panel panel--muted">
          <p className="eyebrow">Relationship Graph</p>
          <div className="graph-surface">
            <div className="graph-node graph-node--primary">BLH</div>
            <div className="graph-node graph-node--secondary">PortOps</div>
            <div className="graph-node graph-node--secondary">Apex Fuel</div>
            <div className="graph-node graph-node--secondary">Saffron Rail</div>
          </div>
        </aside>

        <aside className="panel">
          <p className="eyebrow">Monitoring Rail</p>
          <div className="list-stack">
            <div className="feed-card">
              <div className="feed-card__meta">
                <span className="pill pill--critical">ownership</span>
                <span>4h</span>
              </div>
              <strong>Director overlap detected</strong>
              <p>Cross-board appointment links a monitored EPC firm into the chain.</p>
            </div>
            <div className="feed-card">
              <div className="feed-card__meta">
                <span className="pill pill--cyan">finance</span>
                <span>9h</span>
              </div>
              <strong>Debt covenant pressure</strong>
              <p>Senior notes approach reset threshold after renewed yield widening.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function LexPulseWorkspace() {
  return (
    <section className="workspace-screen">
      <article className="panel panel--document">
        <div className="section-heading section-heading--row">
          <div>
            <p className="eyebrow">Regulatory Terminal</p>
            <h2>LexPulse answer surface</h2>
          </div>
          <span className="pill pill--cyan">query-first</span>
        </div>
        <label className="command-bar">
          <span className="material-symbols-outlined">gavel</span>
          <input value="How do the latest coastal shipping rules alter port-security obligations?" readOnly />
          <span className="command-bar__hint">RAG</span>
        </label>

        <div className="workspace-columns workspace-columns--three">
          <article className="panel panel--muted">
            <p className="eyebrow">Direct answer</p>
            <p className="hero-copy">
              The latest circular expands reporting duties for private operators handling
              mixed strategic cargo and compresses incident notification from 24 hours to 6.
            </p>
          </article>
          <article className="panel panel--muted">
            <p className="eyebrow">Change summary</p>
            <ul className="timeline-list">
              <li>Mandatory berth-access logs now retained for 180 days.</li>
              <li>Joint reporting with customs and coastal police is explicit.</li>
              <li>Inspection exemption language was narrowed for private operators.</li>
            </ul>
          </article>
          <aside className="panel">
            <p className="eyebrow">Evidence rail</p>
            <div className="list-stack">
              <div className="feed-card">
                <strong>Shipping Security Circular 14/2026</strong>
                <p>Primary instrument with amended reporting timelines.</p>
              </div>
              <div className="feed-card">
                <strong>Parliamentary committee note</strong>
                <p>Explains why the exemption window was tightened.</p>
              </div>
            </div>
          </aside>
        </div>
      </article>
    </section>
  );
}

export function WatchlistsWorkspace() {
  return (
    <section className="workspace-screen">
      <StaticMetricStrip
        items={[
          { label: "Active watchlists", value: "31" },
          { label: "Triggered today", value: "19", accent: "accent-orange" },
          { label: "High-friction rules", value: "06", accent: "accent-red" },
          { label: "Dormant for review", value: "04" },
        ]}
      />

      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <p className="eyebrow">Center watch surface</p>
          <h2 className="hero-title">Strategic Ports and Maritime Choke Points</h2>
          <p className="hero-copy">
            Composite watchlist tracking protest action, customs delays, berth allocation
            anomalies, and suspicious AIS silence across sensitive corridors.
          </p>
          <div className="list-stack">
            <div className="feed-card is-active">
              <div className="feed-card__meta">
                <span className="pill pill--primary">Rule pack</span>
                <span>8 conditions</span>
              </div>
              <strong>Port congestion delta</strong>
              <p>Triggers when berth turnaround drops below the 14-day baseline.</p>
            </div>
            <div className="feed-card">
              <div className="feed-card__meta">
                <span className="pill pill--cyan">Entity watch</span>
                <span>12 orgs</span>
              </div>
              <strong>Fuel logistics suppliers</strong>
              <p>Flags new ownership or litigation exposure inside strategic operators.</p>
            </div>
          </div>
        </article>

        <aside className="panel panel--muted">
          <p className="eyebrow">Rule clarity</p>
          <div className="data-grid">
            <div className="data-point">
              <span>Signal blend</span>
              <strong>events + filings</strong>
            </div>
            <div className="data-point">
              <span>Escalation path</span>
              <strong>GeoStrat + Briefings</strong>
            </div>
            <div className="data-point">
              <span>Review cadence</span>
              <strong>weekly</strong>
            </div>
          </div>
        </aside>

        <aside className="panel">
          <p className="eyebrow">Assistant rail</p>
          <div className="list-stack">
            <div className="feed-card">
              <strong>Recommendation</strong>
              <p>Raise berth-anomaly sensitivity for western corridor ports by 12%.</p>
            </div>
            <div className="feed-card">
              <strong>Coverage gap</strong>
              <p>Add one more telemetry source for refueling and towing operations.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function InvestigationsWorkspace() {
  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three investigations-layout">
        <aside className="panel panel--muted">
          <p className="eyebrow">Case directory</p>
          <div className="list-stack">
            <div className="feed-card is-active">
              <strong>INV-024</strong>
              <p>Port disruption financing trail</p>
            </div>
            <div className="feed-card">
              <strong>INV-019</strong>
              <p>Fuel diversion and silent AIS cluster</p>
            </div>
            <div className="feed-card">
              <strong>INV-013</strong>
              <p>Coastal procurement shell network</p>
            </div>
          </div>
        </aside>

        <article className="panel panel--document">
          <p className="eyebrow">Case hero</p>
          <h1 className="hero-title">INV-024 | Port disruption financing trail</h1>
          <p className="hero-copy">
            Investigation follows a chain of shell entities funding labor disruption, lease
            pressure, and downstream political amplification around strategic berths.
          </p>
          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Evidence chain</p>
              <ul className="timeline-list">
                <li>Initial event correlation between berth delays and payment spikes.</li>
                <li>Ownership graph reveals shared beneficial owners across three contractors.</li>
                <li>Watchlist delta triggered after regulatory filing amended facility control.</li>
              </ul>
            </section>
            <section className="panel panel--muted">
              <p className="eyebrow">Timeline</p>
              <ul className="timeline-list">
                <li>Day 0: customs delay anomalies start.</li>
                <li>Day 2: coordinated labor action reported.</li>
                <li>Day 3: layered financing entities appear in corp filings.</li>
              </ul>
            </section>
          </div>
        </article>

        <aside className="panel">
          <p className="eyebrow">Case integrity rail</p>
          <div className="data-grid">
            <div className="data-point">
              <span>Confidence</span>
              <strong>0.78</strong>
            </div>
            <div className="data-point">
              <span>Evidence docs</span>
              <strong>22</strong>
            </div>
            <div className="data-point">
              <span>Linked entities</span>
              <strong>16</strong>
            </div>
            <div className="data-point">
              <span>Owner</span>
              <strong>Analyst SR-4</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function BriefingsWorkspace() {
  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three briefings-layout">
        <aside className="panel panel--muted">
          <p className="eyebrow">Library rail</p>
          <div className="list-stack">
            <div className="feed-card is-active">
              <strong>Daily Briefs</strong>
              <p>Strategic synthesis for the current operating window.</p>
            </div>
            <div className="feed-card">
              <strong>Executive Briefs</strong>
              <p>Short-form priority updates for leadership circulation.</p>
            </div>
            <div className="feed-card">
              <strong>Investigation Briefs</strong>
              <p>Case-level narrative packaging with evidence references.</p>
            </div>
          </div>
        </aside>

        <article className="panel panel--document editorial-surface">
          <p className="eyebrow">Publication surface</p>
          <h1 className="hero-title">Strategic Synthesis: Indo-Pacific Tactical Asset Relocation</h1>
          <p className="hero-copy">
            The central reading surface stays editorial rather than dashboard-like, preserving
            the authored Briefings prototype while inheriting the normalized shell.
          </p>
          <section className="note-card">
            <p className="eyebrow">Executive overview</p>
            <p>
              Recent vessel movement patterns indicate a coordinated logistics posture shift with
              likely implications for port resilience, customs throughput, and insurance exposure.
            </p>
          </section>
          <section className="story-sections">
            <div className="panel panel--muted">
              <p className="eyebrow">Sections</p>
              <ul className="timeline-list">
                <li>Operational snapshot</li>
                <li>Scenario framing</li>
                <li>Escalation pathways</li>
                <li>Recommended analyst actions</li>
              </ul>
            </div>
            <div className="panel panel--muted">
              <p className="eyebrow">Distribution</p>
              <ul className="timeline-list">
                <li>National operations leadership</li>
                <li>Maritime risk desk</li>
                <li>Critical infrastructure monitoring cell</li>
              </ul>
            </div>
          </section>
        </article>

        <aside className="panel">
          <p className="eyebrow">Briefing AI rail</p>
          <div className="list-stack">
            <div className="feed-card">
              <strong>Auto-draft ready</strong>
              <p>PulseBoard cluster 24 can be promoted into a short-form briefing.</p>
            </div>
            <div className="feed-card">
              <strong>Editorial warning</strong>
              <p>One evidence section still lacks a primary-source corroboration link.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
