import type { QueryResultRow } from "pg";
import { queryRow, queryRows } from "@/lib/db";

type Severity = "critical" | "high" | "medium" | "low" | "informational";

function isMissingRelationError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

export async function safeQueryRows<T extends QueryResultRow>(
  tenantId: string,
  text: string,
  values: unknown[] = [],
  fallback: T[] = [],
) {
  try {
    return await queryRows<T>(tenantId, text, values);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return fallback;
    }
    throw error;
  }
}

export async function safeQueryRow<T extends QueryResultRow>(
  tenantId: string,
  text: string,
  values: unknown[] = [],
  fallback: T | null = null,
) {
  try {
    return await queryRow<T>(tenantId, text, values);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return fallback;
    }
    throw error;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function normalizeSeverity(value: unknown): Severity {
  switch (value) {
    case "critical":
    case "high":
    case "medium":
    case "low":
    case "informational":
      return value;
    default:
      return "informational";
  }
}

export function formatMetric(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDateTime(value: string | Date | null | undefined, fallback = "Awaiting update") {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return fallback;
  }

  return parsed.toLocaleString();
}

export function formatDate(value: string | Date | null | undefined, fallback = "TBD") {
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

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
