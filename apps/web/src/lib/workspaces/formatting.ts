export function formatMetric(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = "Awaiting update",
) {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return fallback;
  }

  return parsed.toLocaleString();
}

export function formatDate(
  value: string | Date | null | undefined,
  fallback = "TBD",
) {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return fallback;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
