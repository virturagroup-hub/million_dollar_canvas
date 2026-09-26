"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RULES,
  bounds,
  distance,
  inBounds,
  navigable,
  normalizeColor,
  toWorld,
  transition,
  validateStroke,
  zoomAt,
  type Action,
  type Phase,
  type Point,
  type Stroke,
  type View,
} from "@/drawing/model";
import { render } from "@/drawing/renderer";

type Gesture =
  | { kind: "pan"; pointer: number; last: Point }
  | {
      kind: "draw";
      pointer: number;
      points: Point[];
      started: number;
      color: string;
      width: number;
    };
export function useStudio() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [color, setColor] = useState("#235C4B");
  const [width, setWidth] = useState<number>(6);
  const [recent, setRecent] = useState<string[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 0.5 });
  const viewRef = useRef(view);
  const gesture = useRef<Gesture | null>(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const send = useCallback((action: Action) => {
    const next = transition(phaseRef.current, action);
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const updateView = useCallback((v: View) => {
    viewRef.current = v;
    setView(v);
  }, []);
  const redraw = useCallback(() => {
    if (!canvas.current) return;
    try {
      const g = gesture.current;
      render(
        canvas.current,
        viewRef.current,
        strokesRef.current,
        g?.kind === "draw" ? g : undefined,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Canvas rendering failed.");
    }
  }, []);
  const reset = useCallback(() => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return;
    const zoom = Math.max(
      RULES.minZoom,
      Math.min(r.width / 1600, r.height / 1100),
    );
    updateView({
      zoom,
      x: r.width / 2 - (RULES.width / 2) * zoom,
      y: r.height / 2 - (RULES.height / 2) * zoom,
    });
  }, [updateView]);
  const release = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (g && canvas.current?.hasPointerCapture(g.pointer))
      canvas.current.releasePointerCapture(g.pointer);
  }, []);
  const fail = useCallback(
    (message: string) => {
      release();
      send("FAIL");
      setError(message);
      redraw();
    },
    [redraw, release, send],
  );
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
      redraw();
    });
    observer.observe(node);
    reset();
    return () => observer.disconnect();
  }, [redraw, reset]);
  useEffect(() => {
    const frame = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(frame);
  }, [view, strokes, size, redraw]);
  useEffect(() => {
    if (phase !== "countdown") return;
    let remaining = 3;
    const timer = window.setInterval(() => {
      remaining--;
      if (remaining === 0) {
        window.clearInterval(timer);
        send("READY");
      } else setCount(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, send]);
  useEffect(() => {
    if (phase !== "drawing") return;
    const timer = window.setTimeout(
      () => fail("Stroke exceeded the 15-second limit. No stroke was saved."),
      RULES.maxDuration,
    );
    return () => window.clearTimeout(timer);
  }, [phase, fail]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!navigable(phaseRef.current) || gesture.current) return;
      const r = node.getBoundingClientRect();
      updateView(
        zoomAt(
          viewRef.current,
          { x: e.clientX - r.left, y: e.clientY - r.top },
          Math.exp(-e.deltaY * 0.001),
        ),
      );
    };
    const blur = () => {
      if (gesture.current?.kind === "draw")
        fail("Drawing interrupted. No stroke was saved.");
      else release();
    };
    node.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", blur);
    return () => {
      node.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
    };
  }, [fail, release, updateView]);
  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const chooseColor = (value: string) => {
    const normalized = normalizeColor(value);
    if (normalized) setColor(normalized);
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!e.isPrimary || e.button !== 0 || gesture.current) return;
    const p = local(e);
    const world = toWorld(p, viewRef.current);
    if (phaseRef.current === "sampling") {
      if (!inBounds(world)) {
        setError("Pick a color inside the white artwork.");
        return;
      }
      try {
        const node = e.currentTarget;
        const r = node.getBoundingClientRect();
        const pixel = node
          .getContext("2d")
          ?.getImageData(
            Math.min(node.width - 1, Math.floor((p.x * node.width) / r.width)),
            Math.min(
              node.height - 1,
              Math.floor((p.y * node.height) / r.height),
            ),
            1,
            1,
          ).data;
        if (!pixel) throw new Error("Canvas color sampling is unavailable.");
        chooseColor(
          "#" +
            Array.from(pixel.slice(0, 3))
              .map((n) => n.toString(16).padStart(2, "0"))
              .join(""),
        );
        setError("");
        send("PICK");
      } catch {
        setError("Could not sample that color. Use the color picker.");
        send("PICK");
      }
      return;
    }
    if (phaseRef.current === "armed") {
      if (!inBounds(world)) {
        setError("Start your stroke inside the white artwork.");
        return;
      }
      gesture.current = {
        kind: "draw",
        pointer: e.pointerId,
        points: [world],
        started: performance.now(),
        color,
        width,
      };
      send("DOWN");
      setError("");
    } else if (navigable(phaseRef.current))
      gesture.current = { kind: "pan", pointer: e.pointerId, last: p };
    else return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      fail("Could not capture the pointer. Please try again.");
      return;
    }
    e.preventDefault();
    redraw();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    const p = local(e);
    if (g.kind === "pan") {
      updateView({
        ...viewRef.current,
        x: viewRef.current.x + p.x - g.last.x,
        y: viewRef.current.y + p.y - g.last.y,
      });
      g.last = p;
      return;
    }
    const world = toWorld(p, viewRef.current);
    if (!inBounds(world)) {
      fail("Stroke left the artwork. No stroke was saved.");
      return;
    }
    if (distance(g.points[g.points.length - 1], world) < 0.75) return;
    const points = [...g.points, world];
    const message = validateStroke(
      points,
      performance.now() - g.started,
      g.color,
      g.width,
    );
    if (message) {
      fail(message);
      return;
    }
    g.points = points;
    redraw();
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (gesture.current?.pointer !== e.pointerId) return;
    move(e);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "draw") {
      const duration = performance.now() - g.started;
      const message = validateStroke(g.points, duration, g.color, g.width);
      if (message) {
        fail(message);
        return;
      }
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        points: g.points.map((p) => ({ ...p })),
        color: g.color,
        width: g.width,
        createdAt: new Date().toISOString(),
        duration,
        bounds: bounds(g.points, g.width),
      };
      strokesRef.current = [...strokesRef.current, stroke];
      setStrokes(strokesRef.current);
      setRecent((previous) =>
        [g.color, ...previous.filter((c) => c !== g.color)].slice(0, 6),
      );
      send("UP");
    }
    release();
    redraw();
  }
  const locked = ["countdown", "armed", "drawing"].includes(phase);
  const readyToAdd = ["idle", "completed", "cancelled", "failed"].includes(
    phase,
  );
  const center = toWorld({ x: size.width / 2, y: size.height / 2 }, view);
  return {
    canvas,
    phaseRef,
    phase,
    count,
    setCount,
    color,
    width,
    setWidth,
    recent,
    strokes,
    view,
    viewRef,
    gesture,
    error,
    setError,
    size,
    send,
    updateView,
    reset,
    release,
    fail,
    chooseColor,
    down,
    move,
    up,
    locked,
    readyToAdd,
    center,
  };
}
