import type { DeltaEnvelope, ViewportBounds } from "./contracts.js";

export const NARAD_DELTA_PATTERN = "narad:*";

const THROTTLE_RULES = [
  {
    prefix: "narad:geostrat:",
    intervalMs: 1_000,
  },
] as const;

export function normalizeRequestedChannels(channels?: string[]) {
  return new Set(
    (channels ?? [])
      .map((channel) => channel.trim())
      .filter(Boolean)
      .filter((channel) => channel.startsWith("narad:")),
  );
}

export function matchesRequestedChannels(subscriptions: Set<string>, channel: string) {
  return subscriptions.size === 0 || subscriptions.has(channel);
}

export function getThrottleIntervalMs(channel: string) {
  const rule = THROTTLE_RULES.find((candidate) => channel.startsWith(candidate.prefix));
  return rule?.intervalMs ?? 0;
}

const VIEWPORT_MARGIN = 0.1; // 10% margin on each side

export function isWithinViewport(
  viewport: ViewportBounds | null,
  envelope: DeltaEnvelope,
): boolean {
  if (!viewport) return true; // no viewport set → deliver everything

  const lon = envelope.changes?.longitude;
  const lat = envelope.changes?.latitude;
  if (typeof lon !== "number" || typeof lat !== "number") return true; // no coords → deliver

  const lngSpan = (viewport.east - viewport.west) * VIEWPORT_MARGIN;
  const latSpan = (viewport.north - viewport.south) * VIEWPORT_MARGIN;

  return (
    lon >= viewport.west - lngSpan &&
    lon <= viewport.east + lngSpan &&
    lat >= viewport.south - latSpan &&
    lat <= viewport.north + latSpan
  );
}

export function shouldDeliverEnvelope(
  state: { lastDeliveredAt: Map<string, number> },
  envelope: DeltaEnvelope,
  now = Date.now(),
) {
  const intervalMs = getThrottleIntervalMs(envelope.channel);
  if (intervalMs <= 0) {
    state.lastDeliveredAt.set(envelope.channel, now);
    return true;
  }

  const lastDeliveredAt = state.lastDeliveredAt.get(envelope.channel) ?? 0;
  if (now - lastDeliveredAt < intervalMs) {
    return false;
  }

  state.lastDeliveredAt.set(envelope.channel, now);
  return true;
}
