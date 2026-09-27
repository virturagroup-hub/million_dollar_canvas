import { serverClient } from "@/lib/supabase/server";
import { repository } from "@/server/repository";
import { checkOrigin, failure, json, readJson } from "@/server/http";
import { RequestError, submitStroke } from "@/server/submission";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkOrigin(request);
    const auth = await serverClient();
    const { data, error } = await auth.auth.getUser();
    if (error || !data.user)
      throw new RequestError(401, "Sign in before adding a stroke.");
    const { slug } = await params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug))
      throw new RequestError(400, "Invalid canvas.");
    const store = await repository();
    const canvas = await store.canvas(slug, "slug");
    if (!canvas) throw new RequestError(404, "Canvas not found.");
    const payload = await readJson(request);
    return json(
      { stroke: await submitStroke(store, data.user.id, canvas.id, payload) },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
