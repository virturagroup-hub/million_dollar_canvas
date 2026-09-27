import type { PatchStroke, ReviewDetail } from "@/domain/moderation";
// An on-demand, deterministic SVG image boundary; no external images, scripts,
// user text, storage, or vendor dependencies. Suitable for later raster scanning.
export function moderationPatch(detail: ReviewDetail, highlight = true) {
  const s = detail.stroke;
  const x = Math.max(0, s.min_x - 100),
    y = Math.max(0, s.min_y - 100);
  const width = Math.max(200, s.max_x + 100 - x),
    height = Math.max(200, s.max_y + 100 - y);
  function draw(stroke: PatchStroke, outline = false) {
    if (
      !/^#[0-9A-F]{6}$/i.test(stroke.color) ||
      ![2, 6, 12].includes(stroke.width) ||
      stroke.points.length > 3000 ||
      stroke.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      throw new Error("Invalid patch geometry");
    const color = outline ? "#E08A36" : stroke.color,
      w = stroke.width + (outline ? 8 : 0);
    if (stroke.points.length === 1)
      return `<circle cx="${stroke.points[0].x}" cy="${stroke.points[0].y}" r="${w / 2}" fill="${color}"/>`;
    return `<polyline points="${stroke.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const context = detail.context.slice(0, 200);
  const canonical = [
    ...context,
    ...(detail.status === "approved" ? [] : [s]),
  ].sort((a, b) => a.ordinal - b.ordinal);
  if (detail.status === "approved") canonical.push(s);
  canonical.sort((a, b) => a.ordinal - b.ordinal);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${x} ${y} ${width} ${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff"/>${canonical.map((stroke) => draw(stroke)).join("")}${highlight ? draw(s, true) + draw(s) : ""}</svg>`;
}
