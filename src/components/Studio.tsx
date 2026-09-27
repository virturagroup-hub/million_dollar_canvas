"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useAuthNotice } from "@/client/useAuthNotice";
import Navigation from "./Navigation";
import { useArtwork } from "@/client/useArtwork";
import { api } from "@/client/api";
import ColorLoupe from "./ColorLoupe";
import AuthDialog from "./AuthDialog";
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
  submitting: "Saving your stroke…",
  completed: "One stroke. Part of something bigger.",
  cancelled: "Take your time. The canvas is here.",
  failed: "Let’s try that again.",
};
export default function Studio({
  slug,
  notice = "",
}: {
  slug: string;
  notice?: string;
}) {
  const [authNotice, clearAuthNotice] = useAuthNotice(notice);
  const artwork = useArtwork(slug);
  const [authOpen, setAuthOpen] = useState(false);
  const [resumeAfterAuth, setResumeAfterAuth] = useState(false);
  const dimensions = useMemo(
    () => ({
      width: artwork.canvas?.width ?? RULES.width,
      height: artwork.canvas?.height ?? RULES.height,
    }),
    [artwork.canvas?.width, artwork.canvas?.height],
  );
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
  } = useStudio({
    strokes: artwork.strokes,
    dimensions,
    persist: artwork.save,
  });
  const cancelSample = useCallback(() => send("STOP_SAMPLING"), [send]);
  function addStroke() {
    release();
    setError("");
    if (!artwork.user) {
      if (!artwork.configured) {
        setError(
          "Accounts are temporarily unavailable. Please try again later.",
        );
        return;
      }
      setResumeAfterAuth(true);
      setAuthOpen(true);
      return;
    }
    if (artwork.canDraw) send("ADD");
  }
  async function signOut() {
    try {
      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signout" }),
      });
      send("CANCEL");
      release();
      artwork.discardPending();
      await artwork.refreshUser();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }
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
        <Navigation />
        <div className="account">
          <span className="badge">
            {artwork.canvas?.canvas_type ?? "CANVAS"}
          </span>
          {artwork.user ? (
            <>
              <span>Signed in as {artwork.user.displayName}</span>
              <button
                disabled={["drawing", "submitting"].includes(phase)}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setResumeAfterAuth(false);
                setAuthOpen(true);
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">THE BEGINNING OF SOMETHING SHARED</p>
          <h1>
            {artwork.canvas?.title ??
              (artwork.loadError
                ? "Canvas unavailable"
                : "Your place on the canvas.")}
          </h1>
          <p>
            Find your place. Make one deliberate stroke. See what comes next.
          </p>
        </div>
        <div className="local-note">
          <span className="dot" /> One stroke at a time
          <small>A shared artwork, made together</small>
          {artwork.canvas && artwork.canvas.status !== "open" && (
            <small>
              {artwork.canvas.status === "archived"
                ? "Archived artwork · Read only"
                : "Canvas closed · Read only"}
            </small>
          )}
          <small role="status" data-testid="live-status">
            {artwork.liveStatus}
          </small>
        </div>
      </section>
      {authNotice && (
        <p className="artwork-notice" role="status">
          {authNotice}
        </p>
      )}
      {(artwork.loading ||
        artwork.loadError ||
        artwork.authError ||
        artwork.next !== null ||
        artwork.atCapacity) && (
        <div className="artwork-notice" role="status">
          <span>
            {artwork.loading
              ? "Loading saved artwork…"
              : artwork.loadError ||
                artwork.authError ||
                (artwork.atCapacity
                  ? `Showing ${strokes.length} saved strokes.`
                  : `Showing ${strokes.length} saved strokes. More artwork is available; load it before drawing.`)}
          </span>
          {!artwork.loading && artwork.loadError && (
            <button onClick={() => void artwork.load()}>Retry artwork</button>
          )}
          {!artwork.loading && artwork.canLoadMore && (
            <button onClick={() => void artwork.load(artwork.next!)}>
              Load more artwork
            </button>
          )}
          {artwork.atCapacity && (
            <p>
              This view has reached its artwork limit. Drawing is paused here.
            </p>
          )}
        </div>
      )}
      <section className="workspace">
        <div className="canvas-panel">
          <div className="canvas-top">
            <span>
              {artwork.canvas?.title ?? "CANVAS UNAVAILABLE"}{" "}
              <small>
                {dimensions.width.toLocaleString()} ×{" "}
                {dimensions.height.toLocaleString()}
              </small>
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
                if (e.key === "Escape") {
                  if (phaseRef.current === "sampling") send("STOP_SAMPLING");
                  else send("CANCEL");
                }
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
            {strokes.length === 0 &&
              phase === "idle" &&
              !artwork.loading &&
              !artwork.loadError &&
              artwork.canvas && (
                <div className="empty">
                  <span>↗</span>
                  <h2>It starts with one stroke.</h2>
                  <p>And this one is yours.</p>
                </div>
              )}
            <div className="map" aria-label="Viewport location">
              <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
                <rect
                  width={dimensions.width}
                  height={dimensions.height}
                  fill="white"
                />
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
              {strokes.length} saved{" "}
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
              disabled={!artwork.canDraw}
              onClick={addStroke}
            >
              + Add Stroke
            </button>
          )}
          {artwork.pending && phase !== "submitting" && (
            <div className="save-recovery">
              <p>
                Save unconfirmed. This stroke is not shown as official artwork.
              </p>
              <button
                disabled={artwork.saving}
                onClick={() => {
                  setError("");
                  send("RETRY");
                  void artwork
                    .save(artwork.pending!)
                    .then(() => send("SAVED"))
                    .catch((error) => {
                      send("FAIL");
                      setError(error.message);
                    });
                }}
              >
                Retry same stroke
              </button>
              <button
                disabled={artwork.saving}
                onClick={() => {
                  artwork.discardPending();
                  void artwork.load();
                }}
              >
                Discard preview &amp; reload
              </button>
            </div>
          )}
          {phase === "sampling" && (
            <button className="cancel" onClick={cancelSample}>
              Cancel color picking
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
            One press. One continuous line. Saved only after server acceptance.
          </p>
          {artwork.strokes.length > 0 && (
            <details className="attribution">
              <summary>Recent contributors</summary>
              <ul>
                {artwork.strokes
                  .slice(-10)
                  .reverse()
                  .map((stroke) => (
                    <li key={stroke.id}>
                      {stroke.author.displayName}{" "}
                      <time dateTime={stroke.createdAt}>
                        {new Date(stroke.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </aside>
      </section>
      <footer>
        <span>DRAW WITH THE INTERNET.</span>
        <span>For now, a little corner of it is yours.</span>
      </footer>
      {phase === "sampling" && (
        <ColorLoupe
          canvas={canvas}
          view={viewRef}
          dimensions={dimensions}
          onCancel={cancelSample}
          onError={setError}
        />
      )}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onSignedIn={async () => {
            const user = await artwork.refreshUser();
            if (user) {
              clearAuthNotice();
              setAuthOpen(false);
              if (resumeAfterAuth && artwork.canDraw) send("ADD");
            }
          }}
        />
      )}
    </main>
  );
}
