"use client";
import Link from "next/link";
import {
  RULES,
  navigable,
  zoomAt,
  type Point,
  type Phase,
} from "@/drawing/model";
import { useStudio } from "@/drawing/useStudio";
import StrokeOptions from "./StrokeOptions";
const guidance: Record<Phase, string> = {
  idle: "A blank canvas. A place to begin.",
  preparing: "Find your place. Choose your mark.",
  sampling: "Select a color from the artwork.",
  countdown: "View locked. Get ready…",
  armed: "DRAW",
  drawing: "Make your mark.",
  completed: "One stroke. Part of something bigger.",
  cancelled: "Take your time. The canvas is here.",
  failed: "Let’s try that again.",
};
export default function Studio() {
  const {
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
  } = useStudio();
  return (
    <main>
      <header>
        <Link
          className="brand"
          href="/"
          aria-label="Million Dollar Canvas home"
        >
          <span className="mark">m.</span>
          <span>
            million dollar canvas<small>ONE STROKE AT A TIME</small>
          </span>
        </Link>
        <span className="badge">LOCAL STUDIO · MILESTONE 01</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">THE BEGINNING OF SOMETHING SHARED</p>
          <h1>Every mark matters.</h1>
          <p>
            Find your place. Make one deliberate stroke. See what comes next.
          </p>
        </div>
        <div className="local-note">
          <span className="dot" /> A space to experiment
          <small>Local prototype · Artwork resets on refresh</small>
        </div>
      </section>
      <section className="workspace">
        <div className="canvas-panel">
          <div className="canvas-top">
            <span>
              UNTITLED CANVAS <small>4,000 × 3,000</small>
            </span>
            <span className={locked ? "lock active" : "lock"}>
              {locked ? "● View locked" : "↔ Explore freely"}
            </span>
          </div>
          <div className="surface">
            <canvas
              ref={canvas}
              aria-label="Drawing canvas"
              tabIndex={0}
              data-phase={phase}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={(e) => {
                if (gesture.current?.pointer !== e.pointerId) return;
                if (gesture.current.kind === "draw")
                  fail("Pointer cancelled. No stroke was saved.");
                else release();
              }}
              onLostPointerCapture={(e) => {
                if (gesture.current?.pointer !== e.pointerId) return;
                if (gesture.current?.kind === "draw")
                  fail("Pointer capture lost. No stroke was saved.");
                else release();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") send("CANCEL");
                if (!navigable(phaseRef.current) || gesture.current) return;
                const offsets: Record<string, Point> = {
                  ArrowLeft: { x: 60, y: 0 },
                  ArrowRight: { x: -60, y: 0 },
                  ArrowUp: { x: 0, y: 60 },
                  ArrowDown: { x: 0, y: -60 },
                };
                const delta = offsets[e.key];
                if (delta) {
                  e.preventDefault();
                  updateView({
                    ...viewRef.current,
                    x: viewRef.current.x + delta.x,
                    y: viewRef.current.y + delta.y,
                  });
                }
              }}
              style={{
                cursor: locked || phase === "sampling" ? "crosshair" : "grab",
              }}
            />
            {phase === "countdown" && (
              <div className="countdown" aria-live="assertive">
                <b>{count}</b>
                <span>YOUR NEXT MARK STARTS HERE</span>
              </div>
            )}
            {strokes.length === 0 && phase === "idle" && (
              <div className="empty">
                <span>↗</span>
                <h2>It starts with one stroke.</h2>
                <p>And this one is yours.</p>
              </div>
            )}
            <div className="map" aria-label="Viewport location">
              <svg viewBox={`0 0 ${RULES.width} ${RULES.height}`}>
                <rect width={RULES.width} height={RULES.height} fill="white" />
                <rect
                  x={-view.x / view.zoom}
                  y={-view.y / view.zoom}
                  width={size.width / view.zoom}
                  height={size.height / view.zoom}
                  fill="#235c4b22"
                  stroke="#235c4b"
                  strokeWidth="45"
                />
              </svg>
            </div>
          </div>
          <div className="canvas-bottom">
            <span data-testid="stroke-count">
              {strokes.length} local{" "}
              {strokes.length === 1 ? "stroke" : "strokes"}
            </span>
            <span className="coordinates">
              X {Math.round(center.x)} / Y {Math.round(center.y)}
            </span>
            <div className="zoom">
              <button
                aria-label="Zoom out"
                disabled={!navigable(phase)}
                onClick={() =>
                  updateView(
                    zoomAt(
                      view,
                      { x: size.width / 2, y: size.height / 2 },
                      0.8,
                    ),
                  )
                }
              >
                −
              </button>
              <span>{Math.round(view.zoom * 100)}%</span>
              <button
                aria-label="Zoom in"
                disabled={!navigable(phase)}
                onClick={() =>
                  updateView(
                    zoomAt(
                      view,
                      { x: size.width / 2, y: size.height / 2 },
                      1.25,
                    ),
                  )
                }
              >
                +
              </button>
              <button disabled={!navigable(phase)} onClick={reset}>
                Reset view
              </button>
            </div>
          </div>
        </div>
        <aside>
          <p className="eyebrow">YOUR CONTRIBUTION</p>
          <h2>
            A single stroke.
            <br />
            Endless possibility.
          </h2>
          <ol className="steps">
            <li className={phase === "preparing" ? "current" : ""}>
              Find your place
            </li>
            <li className={locked ? "current" : ""}>Lock your view</li>
            <li
              className={
                phase === "drawing" || phase === "armed" ? "current" : ""
              }
            >
              Make your mark
            </li>
          </ol>
          <div className="status" role="status">
            <span>{phase.toUpperCase()}</span>
            <strong>{guidance[phase]}</strong>
            <p>
              {phase === "armed"
                ? "ARMED — Your next press on the canvas begins your stroke. Release to finish."
                : phase === "drawing"
                  ? "One continuous gesture. Release to finish. Maximum 15 seconds."
                  : locked
                    ? "Panning and zooming are paused."
                    : "Drag to pan. Scroll or use the controls to zoom."}
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {readyToAdd && (
            <button
              className="primary"
              onClick={() => {
                release();
                setError("");
                send("ADD");
              }}
            >
              + Add Stroke
            </button>
          )}
          {phase === "preparing" && (
            <button
              className="primary"
              onClick={() => {
                release();
                setCount(3);
                send("LOCK");
              }}
            >
              Lock View &amp; Prepare Stroke
            </button>
          )}
          {["preparing", "sampling", "countdown", "armed"].includes(phase) && (
            <button
              className="cancel"
              onClick={() => {
                release();
                send("CANCEL");
              }}
            >
              Cancel stroke
            </button>
          )}
          <StrokeOptions
            color={color}
            width={width}
            recent={recent}
            disabled={phase !== "preparing"}
            onColor={chooseColor}
            onWidth={setWidth}
            onSample={() => send("SAMPLE")}
          />
          <p className="footnote">
            One press. One continuous line. One lasting mark for this session.
          </p>
        </aside>
      </section>
      <footer>
        <span>DRAW WITH THE INTERNET.</span>
        <span>For now, a little corner of it is yours.</span>
      </footer>
    </main>
  );
}
