import { checkOrigin, failure, json, readJson } from "@/server/http";
import { moderationClient, rpcFailure } from "@/server/moderation";
import { RequestError, UUID } from "@/server/submission";
import { moderationPatch } from "@/server/moderationPatch";
import type { ReviewDetail } from "@/domain/moderation";
export async function GET(request: Request) {
  try {
    const db = await moderationClient();
    const url = new URL(request.url),
      id = url.searchParams.get("id");
    const filter = url.searchParams.get("filter") ?? "pending",
      offset = url.searchParams.get("offset") ?? "0";
    if (
      (id && !UUID.test(id)) ||
      !["pending", "approved", "rejected", "suppressed", "reported"].includes(
        filter,
      ) ||
      !/^\d{1,5}$/.test(offset) ||
      Number(offset) > 10000
    )
      throw new RequestError(400, "Invalid queue.");
    const { data, error } = await db.rpc("moderation", {
      p_operation: id ? "detail" : "queue",
      p_payload: id ? { id } : { filter, offset: Number(offset) },
    });
    if (error) rpcFailure(error);
    if (id && url.searchParams.get("patch") === "1")
      return new Response(moderationPatch(data as ReviewDetail), {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const db = await moderationClient();
    const body = (await readJson(request, 4096)) as Record<string, unknown>;
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      !UUID.test(body.id) ||
      !["transition", "resolve"].includes(String(body.operation))
    )
      throw new RequestError(400, "Invalid moderation request.");
    const { data, error } = await db.rpc("moderation", {
      p_operation: body.operation,
      p_payload: body,
    });
    if (error) rpcFailure(error);
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
