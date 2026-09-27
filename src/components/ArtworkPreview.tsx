"use client";
import { useEffect, useRef } from "react";
import type { CanvasRecord, PersistedStroke } from "@/domain/canvas";
import { render } from "@/drawing/renderer";

// Read-only rendering boundary: later a tile renderer can replace this without
// changing the gallery, catalog, subscriptions, or any Studio interaction.
export default function ArtworkPreview({
  canvas,
  strokes,
}: {
  canvas: CanvasRecord;
  strokes: PersistedStroke[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const draw = () => {
      const rect = element.getBoundingClientRect();
      const zoom = Math.min(
        rect.width / canvas.width,
        rect.height / canvas.height,
      );
      render(
        element,
        {
          zoom,
          x: (rect.width - canvas.width * zoom) / 2,
          y: (rect.height - canvas.height * zoom) / 2,
        },
        strokes,
        undefined,
        canvas,
      );
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [canvas, strokes]);
  return (
    <canvas
      ref={ref}
      className="artwork-preview"
      aria-label={`${canvas.title} artwork preview`}
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
    />
  );
}
