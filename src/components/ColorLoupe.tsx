"use client";
import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { loupePosition, sampleColor } from "@/drawing/sampling";
import type { View } from "@/drawing/model";
type Props = {
  canvas: RefObject<HTMLCanvasElement | null>;
  view: RefObject<View>;
  dimensions: { width: number; height: number };
  onCancel: () => void;
  onError: (message: string) => void;
};
export default function ColorLoupe({
  canvas,
  view,
  dimensions,
  onCancel,
  onError,
}: Props) {
  const overlay = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const source = canvas.current;
    if (!source) return;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const hide = () => {
      pointer = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (overlay.current) overlay.current.hidden = true;
    };
    const paint = () => {
      frame = 0;
      if (!pointer || !overlay.current || !zoom.current || !label.current)
        return;
      const rect = source.getBoundingClientRect();
      try {
        const sample = sampleColor(
          source,
          { x: pointer.x - rect.left, y: pointer.y - rect.top },
          view.current,
          dimensions,
        );
        if (!sample) {
          hide();
          return;
        }
        const ctx = zoom.current.getContext("2d");
        if (!ctx) throw new Error("Magnifier unavailable.");
        // Fifteen physical pixels, each enlarged to eight CSS pixels. The center
        // pixel is [56,64); the reticle brackets that exact pixel, including at edges.
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#e9e8e3";
        ctx.fillRect(0, 0, 120, 120);
        ctx.drawImage(
          source,
          sample.pixel.x - 7,
          sample.pixel.y - 7,
          15,
          15,
          0,
          0,
          120,
          120,
        );
        const position = loupePosition(pointer, {
          width: innerWidth,
          height: innerHeight,
        });
        overlay.current.style.left = position.x + "px";
        overlay.current.style.top = position.y + "px";
        overlay.current.hidden = false;
        label.current.value = sample.color;
      } catch {
        hide();
        onError("Magnifier unavailable. You can still use the color picker.");
      }
    };
    const move = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    source.addEventListener("pointermove", move);
    source.addEventListener("pointerleave", hide);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      source.removeEventListener("pointermove", move);
      source.removeEventListener("pointerleave", hide);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [canvas, view, dimensions, onCancel, onError]);
  return createPortal(
    <div
      className="loupe"
      ref={overlay}
      hidden
      data-testid="color-loupe"
      aria-hidden="true"
    >
      <div className="loupe-image">
        <canvas ref={zoom} width={120} height={120} />
        <span className="reticle" />
      </div>
      <output ref={label} />
    </div>,
    document.body,
  );
}
