import { checkOrigin, failure, json, readJson } from "@/server/http";
import { moderationClient, rpcFailure } from "@/server/moderation";
import { RequestError, UUID } from "@/server/submission";
import { REPORT_CATEGORIES } from "@/domain/moderation";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const db = await moderationClient();
    const body = (await readJson(request, 2048)) as Record<string, unknown>;
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      !UUID.test(body.id) ||
      typeof body.category !== "string" ||
      !Object.hasOwn(REPORT_CATEGORIES, body.category) ||
      typeof body.description !== "string" ||
      body.description.length > 500
    )
      throw new RequestError(400, "Invalid report.");
    const { data, error } = await db.rpc("report_stroke", {
      p_id: body.id,
      p_category: body.category,
      p_description: body.description,
    });
    if (error) rpcFailure(error);
    return json({ id: data }, 201);
  } catch (error) {
    return failure(error);
  }
}
