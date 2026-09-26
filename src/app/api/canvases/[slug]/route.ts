import { repository } from "@/server/repository";
import { failure, json } from "@/server/http";
import { RequestError } from "@/server/submission";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug))
      throw new RequestError(400, "Invalid canvas.");
    const store = await repository();
    const canvas = await store.canvas(slug, "slug");
    if (!canvas) throw new RequestError(404, "Canvas not found.");
    const raw = new URL(request.url).searchParams.get("after") ?? "0";
    if (!/^\d{1,15}$/.test(raw))
      throw new RequestError(400, "Invalid page cursor.");
    return json({ canvas, ...(await store.page(canvas.id, Number(raw))) });
  } catch (error) {
    return failure(error);
  }
}
