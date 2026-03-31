"use client";

import { useQuery } from "@tanstack/react-query";
import { startTransition, useDeferredValue, useEffect, useMemo } from "react";
import type { PulseboardCard, PulseboardEventDetail } from "@/lib/pulseboard";
import { usePulseboardStore } from "@/stores/pulseboard-store";

type PulseboardWorkspaceProps = {
  initialCards: PulseboardCard[];
  initialDetail: PulseboardEventDetail | null;
};

function readSessionCookie(name = "narad_session") {
  if (typeof document === "undefined") {
    return null;
  }

  const pair = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

async function fetchPulseboardDetail(eventId: string) {
  const response = await fetch(`/api/pulseboard/${eventId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Unable to load PulseBoard detail for ${eventId}`);
  }

  return (await response.json()) as PulseboardEventDetail;
}

export function PulseboardWorkspace({
  initialCards,
  initialDetail,
}: PulseboardWorkspaceProps) {
  const hydrate = usePulseboardStore((state) => state.hydrate);
  const items = usePulseboardStore((state) => state.items);
  const details = usePulseboardStore((state) => state.details);
  const selectedEventId = usePulseboardStore((state) => state.selectedEventId);
  const selectEvent = usePulseboardStore((state) => state.selectEvent);
  const upsertDetail = usePulseboardStore((state) => state.upsertDetail);
  const patchCard = usePulseboardStore((state) => state.patchCard);

  useEffect(() => {
    hydrate(initialCards, initialDetail);
  }, [hydrate, initialCards, initialDetail]);

  const deferredEventId = useDeferredValue(selectedEventId);
  const selectedFromStore = deferredEventId ? details[deferredEventId] : null;

  const detailQuery = useQuery({
    queryKey: ["pulseboard-detail", deferredEventId],
    queryFn: () => fetchPulseboardDetail(deferredEventId!),
    enabled: Boolean(deferredEventId),
    initialData:
      deferredEventId && initialDetail?.eventId === deferredEventId ? initialDetail : undefined,
  });

  useEffect(() => {
    if (detailQuery.data) {
      upsertDetail(detailQuery.data);
    }
  }, [detailQuery.data, upsertDetail]);

  useEffect(() => {
    const gatewayUrl =
      process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.trim() || process.env.NEXT_PUBLIC_WS_URL?.trim();
    const token = readSessionCookie(
      process.env.NEXT_PUBLIC_APP_AUTH_COOKIE_NAME?.trim() || "narad_session",
    );

    if (!gatewayUrl || !token) {
      return;
    }

    const socket = new WebSocket(`${gatewayUrl}?token=${encodeURIComponent(token)}`);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          channels: ["narad:pulseboard:event"],
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          payload?: {
            entity_id?: string;
            entity_type?: string;
            changes?: {
              card?: Partial<PulseboardCard>;
            };
          };
        };

        if (parsed.type !== "delta" || parsed.payload?.entity_type !== "event") {
          return;
        }

        if (parsed.payload.entity_id && parsed.payload.changes?.card) {
          patchCard(parsed.payload.entity_id, parsed.payload.changes.card);
        }
      } catch {
        return;
      }
    });

    return () => {
      socket.close();
    };
  }, [patchCard]);

  const selectedDetail = useMemo(() => {
    if (!deferredEventId) {
      return initialDetail;
    }
    return selectedFromStore ?? detailQuery.data ?? initialDetail;
  }, [deferredEventId, detailQuery.data, initialDetail, selectedFromStore]);

  return (
    <section className="workspace-screen pulseboard-screen">
      <div className="section-heading section-heading--row">
        <div>
          <p className="eyebrow">Narrative Feed</p>
          <h2>PulseBoard</h2>
        </div>
        <div className="cluster-row">
          <span className="pill pill--critical">critical only</span>
          <span className="pill pill--primary">official</span>
          <span className="pill pill--cyan">verified</span>
        </div>
      </div>

      <div className="pulseboard-layout">
        <aside className="panel pulseboard-layout__feed">
          <div className="list-stack">
            {items.map((card) => (
              <button
                key={card.eventId}
                type="button"
                className={`feed-card${card.eventId === selectedEventId ? " is-active" : ""}`}
                onClick={() =>
                  startTransition(() => {
                    selectEvent(card.eventId);
                  })
                }
              >
                <div className="feed-card__meta">
                  <span className={`pill pill--${card.severity}`}>{card.severity}</span>
                  <span>{new Date(card.eventTimestamp).toLocaleTimeString()}</span>
                </div>
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <div className="cluster-row cluster-row--tight">
                  <span>{card.placeLabel ?? "Location pending"}</span>
                  <span>{Math.round(card.confidence * 100)}% confidence</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <article className="panel panel--document pulseboard-layout__story">
          {selectedDetail ? (
            <>
              <div className="story-surface__hero">
                <div className="story-surface__meta">
                  <span className={`pill pill--${selectedDetail.severity}`}>{selectedDetail.severity}</span>
                  <span>{selectedDetail.eventType}</span>
                  <span>{selectedDetail.status}</span>
                </div>
                <h1 className="hero-title">{selectedDetail.title}</h1>
                <p className="hero-copy">{selectedDetail.summary}</p>
              </div>

              <div className="data-grid">
                <div className="data-point">
                  <span>Primary source</span>
                  <strong>{selectedDetail.primarySourceName ?? "Awaiting corroboration"}</strong>
                </div>
                <div className="data-point">
                  <span>Sources</span>
                  <strong>{selectedDetail.sourceCount}</strong>
                </div>
                <div className="data-point">
                  <span>Trust tier</span>
                  <strong>{selectedDetail.sourceTrustTier}</strong>
                </div>
                <div className="data-point">
                  <span>Location</span>
                  <strong>{selectedDetail.placeLabel ?? "Unknown"}</strong>
                </div>
              </div>

              <div className="story-sections">
                <section className="panel panel--muted">
                  <p className="eyebrow">Key facts</p>
                  <ul className="timeline-list">
                    {selectedDetail.keyFacts.length > 0 ? (
                      selectedDetail.keyFacts.map((fact) => <li key={fact}>{fact}</li>)
                    ) : (
                      <li>Story capsule evidence has not populated key facts yet.</li>
                    )}
                  </ul>
                </section>

                <section className="panel panel--muted">
                  <p className="eyebrow">Evidence bundle</p>
                  <pre className="code-surface">
                    {JSON.stringify(selectedDetail.evidenceBundle, null, 2)}
                  </pre>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-surface">No event detail available for the current tenant.</div>
          )}
        </article>

        <aside className="panel pulseboard-layout__evidence">
          <div className="section-heading">
            <p className="eyebrow">Evidence pack</p>
            <h2>Source ledger</h2>
          </div>
          <div className="list-stack">
            {selectedDetail?.evidenceItems.length ? (
              selectedDetail.evidenceItems.map((item) => (
                <a
                  key={item.documentId}
                  href={item.fetchUrl ?? "#"}
                  className="feed-card"
                  target={item.fetchUrl ? "_blank" : undefined}
                  rel={item.fetchUrl ? "noreferrer" : undefined}
                >
                  <div className="feed-card__meta">
                    <span className="pill">{item.linkType}</span>
                    <span>{item.docType}</span>
                  </div>
                  <strong>{item.title ?? "Untitled source document"}</strong>
                  <p>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "No publish timestamp"}</p>
                </a>
              ))
            ) : (
              <div className="empty-surface">No evidence documents linked to this event yet.</div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
