import {
  RULES,
  bounds,
  normalizeColor,
  validateStroke,
  type Point,
} from "../drawing/model";
import type { Candidate, CanvasRecord } from "../domain/canvas";
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseCandidate(
  value: unknown,
  canvas: CanvasRecord,
): Candidate {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestError(400, "Invalid stroke.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["requestId", "points", "color", "width", "duration"].includes(k),
    )
  )
    throw new RequestError(
      400,
      "Unexpected stroke fields. Identity and timestamps are assigned by the server.",
    );
  if (
    typeof v.requestId !== "string" ||
    !UUID.test(v.requestId) ||
    !Array.isArray(v.points) ||
    typeof v.color !== "string" ||
    typeof v.width !== "number" ||
    typeof v.duration !== "number"
  )
    throw new RequestError(400, "Invalid stroke properties.");
  if (
    v.points.length > RULES.maxPoints ||
    v.points.some(
      (p) =>
        !p ||
        typeof p !== "object" ||
        Array.isArray(p) ||
        Object.keys(p).length !== 2 ||
        typeof p.x !== "number" ||
        typeof p.y !== "number",
    )
  )
    throw new RequestError(400, "Invalid stroke points.");
  const points: Point[] = v.points.map((p) => ({ x: p.x, y: p.y }));
  const error = validateStroke(points, v.duration, v.color, v.width, canvas);
  if (error) throw new RequestError(400, error);
  return {
    requestId: v.requestId,
    points,
    color: normalizeColor(v.color)!,
    width: v.width,
    duration: v.duration,
  };
}
export type SubmissionStore = {
  canvas: (id: string) => Promise<CanvasRecord | null>;
  save: (
    userId: string,
    canvas: CanvasRecord,
    candidate: Candidate,
    box: ReturnType<typeof bounds>,
  ) => Promise<import("../domain/moderation").SubmissionReceipt>;
};
export async function submitStroke(
  store: SubmissionStore,
  userId: string | null,
  canvasId: string,
  payload: unknown,
  now = Date.now(),
) {
  if (!userId) throw new RequestError(401, "Sign in before adding a stroke.");
  if (!UUID.test(canvasId)) throw new RequestError(400, "Invalid canvas.");
  const canvas = await store.canvas(canvasId);
  if (!canvas) throw new RequestError(404, "Canvas not found.");
  if (
    canvas.status !== "open" ||
    (canvas.opens_at && Date.parse(canvas.opens_at) > now) ||
    (canvas.closes_at && Date.parse(canvas.closes_at) <= now)
  )
    throw new RequestError(409, "This canvas is closed to new strokes.");
  const candidate = parseCandidate(payload, canvas);
  return store.save(
    userId,
    canvas,
    candidate,
    bounds(candidate.points, candidate.width),
  );
}
