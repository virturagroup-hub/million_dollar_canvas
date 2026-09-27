import "server-only";
import { serverClient } from "@/lib/supabase/server";
import { RequestError } from "./submission";

// Bounded per-process safeguard, including rejected requests. Database RPCs
// independently authorize and rate-limit successful privileged operations.
const attempts = new Map<string, { start: number; count: number }>();
export async function moderationClient() {
  const db = await serverClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new RequestError(401, "Sign in to continue.");
  const now = Date.now(),
    id = data.user.id;
  if (attempts.size >= 2000)
    for (const [key, value] of attempts)
      if (now - value.start >= 60000) attempts.delete(key);
  if (!attempts.has(id) && attempts.size >= 2000)
    throw new RequestError(429, "Please try again shortly.");
  const entry = attempts.get(id);
  if (entry && now - entry.start < 60000) {
    if (++entry.count > 120)
      throw new RequestError(429, "Please try again shortly.");
  } else attempts.set(id, { start: now, count: 1 });
  return db;
}
export function rpcFailure(error: { message: string }): never {
  const message = error.message;
  if (/Forbidden|Unauthorized/.test(message))
    throw new RequestError(403, "Moderator access required.");
  if (/rate limit/.test(message))
    throw new RequestError(429, "Please wait before trying again.");
  if (/not found/.test(message))
    throw new RequestError(404, "This item is unavailable.");
  if (/conflict|Duplicate|already reviewed|stroke limit/.test(message))
    throw new RequestError(
      409,
      "This item changed or has already been reviewed/reported. Refresh and try again.",
    );
  if (/Invalid/.test(message))
    throw new RequestError(400, "Invalid review or report.");
  throw new RequestError(503, "Could not complete the request. Please retry.");
}
