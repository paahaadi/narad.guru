import { requireSessionFromRequest } from "@/lib/auth";

export async function requireApiSession(request: Request) {
  try {
    return await requireSessionFromRequest(request);
  } catch {
    return null;
  }
}
