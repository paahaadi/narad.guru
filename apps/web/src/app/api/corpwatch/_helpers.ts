import { requireSessionFromRequest } from "@/lib/auth";

export async function requireApiSession(request: Request) {
  try {
    return await requireSessionFromRequest(request);
  } catch {
    return null;
  }
}

export function getIntelligenceServiceUrl() {
  return process.env.INTELLIGENCE_SERVICE_URL?.trim() || "http://localhost:8000";
}

export function tenantHeaders(tenantId: string) {
  return {
    "X-Tenant-Id": tenantId,
    "Content-Type": "application/json",
  };
}
