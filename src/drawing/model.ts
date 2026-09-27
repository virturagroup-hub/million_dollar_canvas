export const RULES = {
  width: 4000,
  height: 3000,
  widths: [2, 6, 12],
  maxDuration: 15000,
  maxPoints: 3000,
  maxLength: 12000,
  minZoom: 0.1,
  maxZoom: 4,
} as const;
export type Point = { x: number; y: number };
export type View = Point & { zoom: number };
export type Stroke = {
  id: string;
  points: Point[];
  color: string;
  width: number;
  createdAt: string;
  duration: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};
export function normalizeColor(value: string): string | null {
  return /^#?[0-9a-f]{6}$/i.test(value.trim())
    ? "#" + value.trim().replace("#", "").toUpperCase()
    : null;
}
export const toWorld = (p: Point, v: View): Point => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});
export const toScreen = (p: Point, v: View): Point => ({
  x: p.x * v.zoom + v.x,
  y: p.y * v.zoom + v.y,
});
export function zoomAt(v: View, p: Point, factor: number): View {
  const world = toWorld(p, v);
  const zoom = Math.min(
    RULES.maxZoom,
    Math.max(RULES.minZoom, v.zoom * factor),
  );
  return { zoom, x: p.x - world.x * zoom, y: p.y - world.y * zoom };
}
export const inBounds = (
  p: Point,
  dimensions: { width: number; height: number } = RULES,
) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x <= dimensions.width &&
  p.y <= dimensions.height;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function validateStroke(
  points: Point[],
  duration: number,
  color: string,
  width: number,
  dimensions: { width: number; height: number } = RULES,
): string | null {
  if (!normalizeColor(color)) return "Choose a valid six-digit hex color.";
  if (!(RULES.widths as readonly number[]).includes(width))
    return "Choose a supported brush width.";
  if (
    !Number.isFinite(duration) ||
    duration < 0 ||
    duration > RULES.maxDuration
  )
    return "Stroke exceeded the 15-second limit. Please try again.";
  if (!points.length || points.length > RULES.maxPoints)
    return "Stroke exceeded the point limit or was empty.";
  if (!points.every((p) => inBounds(p, dimensions)))
    return "Keep your stroke inside the artwork.";
  const length = points.reduce(
    (sum, p, i) => sum + (i ? distance(points[i - 1], p) : 0),
    0,
  );
  if (length > RULES.maxLength)
    return "Stroke exceeded the path-length limit. Please try again.";
  return null; // A deliberate tap is a valid round dot in this prototype.
}
export function bounds(points: Point[], width: number): Stroke["bounds"] {
  return {
    minX: Math.min(...points.map((p) => p.x)) - width / 2,
    minY: Math.min(...points.map((p) => p.y)) - width / 2,
    maxX: Math.max(...points.map((p) => p.x)) + width / 2,
    maxY: Math.max(...points.map((p) => p.y)) + width / 2,
  };
}
export type Phase =
  | "idle"
  | "preparing"
  | "sampling"
  | "countdown"
  | "armed"
  | "drawing"
  | "submitting"
  | "completed"
  | "cancelled"
  | "failed";
export type Action =
  | "ADD"
  | "SAMPLE"
  | "PICK"
  | "LOCK"
  | "READY"
  | "DOWN"
  | "UP"
  | "SAVED"
  | "STOP_SAMPLING"
  | "RETRY"
  | "CANCEL"
  | "FAIL";
export function transition(phase: Phase, action: Action): Phase {
  if (action === "FAIL") return "failed";
  if (
    action === "ADD" &&
    ["idle", "completed", "cancelled", "failed"].includes(phase)
  )
    return "preparing";
  if (
    action === "CANCEL" &&
    ["preparing", "sampling", "countdown", "armed"].includes(phase)
  )
    return "cancelled";
  const edges: Partial<Record<Phase, Partial<Record<Action, Phase>>>> = {
    preparing: { SAMPLE: "sampling", LOCK: "countdown" },
    sampling: { PICK: "preparing", STOP_SAMPLING: "preparing" },
    countdown: { READY: "armed" },
    armed: { DOWN: "drawing" },
    drawing: { UP: "submitting" },
    submitting: { SAVED: "completed" },
    failed: { RETRY: "submitting" },
  };
  return edges[phase]?.[action] ?? phase;
}
export const navigable = (p: Phase) =>
  !["countdown", "armed", "drawing", "sampling", "submitting"].includes(p);
