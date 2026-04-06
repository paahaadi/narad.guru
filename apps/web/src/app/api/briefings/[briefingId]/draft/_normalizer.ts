/**
 * Shared section normalization utility for briefing version data.
 * Handles both array-of-objects and legacy record formats.
 */
export function normalizeSectionInput(value: unknown): { title: string; body: string }[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((s) => s && typeof s === "object")
      .map((s: Record<string, unknown>) => ({
        title: String(s.title ?? s.heading ?? ""),
        body: String(s.body ?? s.summary ?? ""),
      }));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).map(([title, body]) => ({
      title,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
  }
  return [];
}
