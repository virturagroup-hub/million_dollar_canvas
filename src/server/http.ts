import { API_LIMITS } from "../domain/canvas";
import { RequestError } from "./submission";
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error: unknown) {
  return error instanceof RequestError
    ? json({ error: error.message }, error.status)
    : json({ error: "The service is unavailable. Please try again." }, 503);
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new RequestError(403, "Request origin is not allowed.");
}
export async function readJson(
  request: Request,
  limit: number = API_LIMITS.payloadBytes,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestError(415, "Send JSON.");
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new RequestError(400, "Invalid JSON.");
  }
}
