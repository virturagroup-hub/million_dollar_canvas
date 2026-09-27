"use client";
import Link from "next/link";
import { API_LIMITS, type CanvasRecord } from "@/domain/canvas";
import { useCanvasArtwork } from "@/client/useCanvasArtwork";
import ArtworkPreview from "./ArtworkPreview";
export default function CanvasCard({
  record,
  featured = false,
  live = true,
}: {
  record: CanvasRecord;
  featured?: boolean;
  live?: boolean;
}) {
  const artwork = useCanvasArtwork(record.slug, {
    live,
    limit: API_LIMITS.previewStrokes,
  });
  const canvas = artwork.canvas ?? record;
  const href = `/canvas/${canvas.slug}`;
  const count = canvas.approved_count;
  return (
    <article
      className={featured ? "canvas-feature" : "canvas-card"}
      data-canvas={canvas.slug}
    >
      <div className="canvas-story">
        <p className="eyebrow">
          {canvas.canvas_type === "flagship"
            ? "THE SHARED MASTERPIECE"
            : `${canvas.canvas_type} canvas`}
        </p>
        <h2>
          <Link href={href}>{canvas.title}</Link>
        </h2>
        <p className="canvas-description">{canvas.description}</p>
        <p className="canvas-state">
          <span>{canvas.status}</span>
          {live && (
            <span role="status" data-testid={`live-${canvas.slug}`}>
              {artwork.liveStatus}
            </span>
          )}
        </p>
        <div className="canvas-totals" data-testid={`total-${canvas.slug}`}>
          <strong>{count.toLocaleString("en-US")}</strong>
          <span> approved {count === 1 ? "stroke" : "strokes"}</span>
        </div>
        {canvas.stroke_limit !== null && (
          <div className="canvas-progress">
            <progress
              aria-label={`${canvas.title} progress`}
              value={count}
              max={canvas.stroke_limit}
            />
            <span>
              of {canvas.stroke_limit.toLocaleString("en-US")} strokes
            </span>
          </div>
        )}
        {canvas.opens_at && (
          <p className="canvas-date">
            Opened{" "}
            <time dateTime={canvas.opens_at}>
              {new Date(canvas.opens_at).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}
            </time>
          </p>
        )}
        {canvas.closes_at && (
          <p className="canvas-date">
            Closes{" "}
            <time dateTime={canvas.closes_at}>
              {new Date(canvas.closes_at).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}
            </time>
          </p>
        )}
        <Link
          className={featured ? "gallery-action" : "gallery-text-link"}
          href={href}
        >
          {canvas.status === "open" ? "Enter Canvas" : "View artwork"}{" "}
          <span aria-hidden>↗</span>
        </Link>
      </div>
      <div className="preview-mount">
        <Link
          href={href}
          className="preview-link"
          aria-label={`View ${canvas.title}`}
        >
          <ArtworkPreview canvas={canvas} strokes={artwork.strokes} />
          {!artwork.loading && !artwork.loadError && count === 0 && (
            <span className="preview-empty">
              The first mark is still to come.
            </span>
          )}
        </Link>
        <div className="preview-caption">
          <span>
            {featured ? "AN ARTWORK IN THE MAKING" : "A SHARED ORIGINAL"}
          </span>
          <span>
            {artwork.next !== null
              ? "Partial artwork preview"
              : "Every mark belongs"}
          </span>
        </div>
        {artwork.loading && <p role="status">Loading artwork…</p>}
        {artwork.loadError && (
          <p role="status">
            Artwork preview unavailable.{" "}
            <button onClick={() => void artwork.load()}>Retry preview</button>
          </p>
        )}
      </div>
    </article>
  );
}
