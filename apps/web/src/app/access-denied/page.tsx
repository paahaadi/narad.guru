"use client";

import { useEffect, useState } from "react";

export default function AccessDeniedPage() {
  const isDev = process.env.NODE_ENV === "development";
  const [redirecting, setRedirecting] = useState(false);

  // In dev: auto-trigger login after 1.5s so the page is briefly visible
  useEffect(() => {
    if (isDev) {
      const timer = setTimeout(() => {
        setRedirecting(true);
        window.location.href = "/dev-login";
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isDev]);

  return (
    <main className="auth-gate-page">
      <div className="auth-gate-card">
        <p className="eyebrow">Authenticated Access Required</p>
        <h1 className="hero-title">NARAD session unavailable</h1>
        <p className="hero-copy">
          The presentation plane only renders with a valid RS256 session token
          carrying <code>tenant_id</code>, <code>role</code>, and{" "}
          <code>clearance_level</code>.
        </p>
        <div className="inline-stat-grid">
          <div className="inline-stat">
            <span className="inline-stat-label">Cookie</span>
            <span className="inline-stat-value">narad_session</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat-label">Issuer</span>
            <span className="inline-stat-value">narad.guru</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat-label">Algorithm</span>
            <span className="inline-stat-value">RS256</span>
          </div>
        </div>

        {isDev && (
          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            {redirecting ? (
              <p style={{ color: "#6ee7b7", fontSize: "0.875rem" }}>
                ↪ Injecting dev session…
              </p>
            ) : (
              <>
                <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                  Development mode detected — auto-injecting session in 1.5s…
                </p>
                <a
                  href="/dev-login"
                  style={{
                    display: "inline-block",
                    padding: "0.5rem 1.25rem",
                    background: "#6366f1",
                    color: "#fff",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  ⚡ Inject Dev Session Now
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
