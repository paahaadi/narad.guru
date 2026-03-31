export default function AccessDeniedPage() {
  return (
    <main className="auth-gate-page">
      <div className="auth-gate-card">
        <p className="eyebrow">Authenticated Access Required</p>
        <h1 className="hero-title">NARAD session unavailable</h1>
        <p className="hero-copy">
          The presentation plane only renders with a valid RS256 session token carrying
          `tenant_id`, `role`, and `clearance_level`.
        </p>
        <div className="inline-stat-grid">
          <div className="inline-stat">
            <span className="inline-stat-label">Cookie</span>
            <span className="inline-stat-value">narad_session</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat-label">Issuer</span>
            <span className="inline-stat-value">JWT_ISSUER</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat-label">Algorithm</span>
            <span className="inline-stat-value">RS256</span>
          </div>
        </div>
      </div>
    </main>
  );
}
