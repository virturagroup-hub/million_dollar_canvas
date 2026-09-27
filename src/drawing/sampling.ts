import { inBounds, toWorld, type Point, type View } from "./model";
// Pixel centers are shared by the loupe and the click handler. The backing buffer
// can have fractional CSS-to-device ratios after resizing; never assume an integer DPR.
export function samplePosition(
  p: Point,
  view: View,
  dimensions: { width: number; height: number },
  css: { width: number; height: number },
  backing: { width: number; height: number },
) {
  if (
    css.width <= 0 ||
    css.height <= 0 ||
    p.x < 0 ||
    p.y < 0 ||
    p.x >= css.width ||
    p.y >= css.height ||
    !inBounds(toWorld(p, view), dimensions)
  )
    return null;
  return {
    x: Math.min(
      backing.width - 1,
      Math.floor((p.x * backing.width) / css.width),
    ),
    y: Math.min(
      backing.height - 1,
      Math.floor((p.y * backing.height) / css.height),
    ),
  };
}
export function sampleColor(
  canvas: HTMLCanvasElement,
  p: Point,
  view: View,
  dimensions: { width: number; height: number },
) {
  const pixel = samplePosition(
    p,
    view,
    dimensions,
    canvas.getBoundingClientRect(),
    canvas,
  );
  if (!pixel) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas sampling is unavailable.");
  const rgba = ctx.getImageData(pixel.x, pixel.y, 1, 1).data;
  return {
    pixel,
    color:
      "#" +
      Array.from(rgba.slice(0, 3))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
  };
}
export function loupePosition(
  point: Point,
  viewport: { width: number; height: number },
  size = 128,
) {
  const gap = 22;
  const height = size + 30;
  return {
    x: Math.max(
      8,
      Math.min(
        point.x + gap + size > viewport.width
          ? point.x - gap - size
          : point.x + gap,
        viewport.width - size - 8,
      ),
    ),
    y: Math.max(
      8,
      Math.min(
        point.y + gap + height > viewport.height
          ? point.y - gap - height
          : point.y + gap,
        viewport.height - height - 8,
      ),
    ),
  };
}
