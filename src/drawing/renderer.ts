import { RULES, type Point, type Stroke, type View } from "./model";
export function paintPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
) {
  if (!points.length) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
  ctx.fill();
}
export function render(
  canvas: HTMLCanvasElement,
  view: View,
  strokes: Stroke[],
  draft?: { points: Point[]; color: string; width: number },
  dimensions: { width: number; height: number } = RULES,
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx)
    throw new Error("Your browser could not initialize the drawing canvas.");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr),
    h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#e9e8e3";
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, dimensions.width, dimensions.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, dimensions.width, dimensions.height);
  ctx.clip();
  for (const stroke of strokes)
    paintPath(ctx, stroke.points, stroke.color, stroke.width);
  if (draft) paintPath(ctx, draft.points, draft.color, draft.width);
  ctx.restore();
}
