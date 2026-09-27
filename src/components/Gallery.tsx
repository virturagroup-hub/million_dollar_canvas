"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_LIMITS, type CanvasRecord } from "@/domain/canvas";
import { api } from "@/client/api";
import { useAuthNotice } from "@/client/useAuthNotice";
import Navigation from "./Navigation";
import GalleryAccount from "./GalleryAccount";
import CanvasCard from "./CanvasCard";
type Catalog = {
  flagship: CanvasRecord | null;
  canvases: CanvasRecord[];
  next: number | null;
};

function CanvasDirectory({
  section,
  featured = false,
}: {
  section: "current" | "archive";
  featured?: boolean;
}) {
  const [data, setData] = useState<Catalog | null>(null);
  const [flagship, setFlagship] = useState<CanvasRecord | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (start: number) => {
      setLoading(true);
      setError("");
      try {
        const result = await api<Catalog>(
          `/api/canvases?section=${section}&offset=${start}`,
        );
        setData(result);
        setOffset(start);
        if (start === 0) setFlagship(result.flagship);
      } catch {
        setError("The gallery is temporarily unavailable. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [section],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(0), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      {featured && flagship && (
        <CanvasCard key={flagship.slug} record={flagship} featured />
      )}
      <section
        className="gallery-section"
        id={section === "current" ? "canvases" : "archive"}
        aria-label={section === "current" ? "Current Canvases" : "Archive"}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {section === "current" ? "FIND YOUR PLACE" : "MADE TO LAST"}
            </p>
            <h2>
              {section === "current" ? "Current Canvases" : "The archive"}
            </h2>
          </div>
          <p>
            {section === "current"
              ? "Different beginnings. The same shared spirit."
              : "Finished artworks, kept for everyone."}
          </p>
        </div>
        {loading && <p role="status">Opening the gallery…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button onClick={() => void load(offset)}>Retry gallery</button>
          </p>
        )}
        {data && (
          <div className="canvas-grid">
            {data.canvases.map((canvas) => (
              <CanvasCard
                key={canvas.slug}
                record={canvas}
                live={section === "current"}
              />
            ))}
          </div>
        )}
        {data && !data.canvases.length && !loading && !error && (
          <div className="gallery-empty">
            <span aria-hidden>✳</span>
            <h3>
              {section === "current"
                ? "A new canvas will find its way here."
                : "The story is still being drawn."}
            </h3>
            <p>
              {section === "current"
                ? "Explore the shared masterpiece above, or return for another beginning."
                : "When a canvas is complete, its artwork will have a permanent home here."}
            </p>
          </div>
        )}
        {data && (
          <div className="gallery-pagination">
            {offset > 0 && (
              <button
                disabled={loading}
                onClick={() =>
                  void load(Math.max(0, offset - API_LIMITS.catalogPageSize))
                }
              >
                Previous canvases
              </button>
            )}
            {data.next !== null && (
              <button disabled={loading} onClick={() => void load(data.next!)}>
                More canvases →
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
export default function Gallery({
  notice = "",
  archive = false,
}: {
  notice?: string;
  archive?: boolean;
}) {
  const [message, clearNotice] = useAuthNotice(notice);
  return (
    <main className="gallery">
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
        <GalleryAccount onSignedIn={clearNotice} />
      </header>
      {message && (
        <p className="artwork-notice" role="status">
          {message}
        </p>
      )}
      {archive ? (
        <>
          <section className="gallery-hero">
            <p className="eyebrow">THE ARTWORK LIVES ON</p>
            <h1>
              A place for
              <br />
              <em>what we made.</em>
            </h1>
            <p>Every finished canvas is part of our shared history.</p>
          </section>
          <CanvasDirectory section="archive" />
        </>
      ) : (
        <>
          <section className="gallery-hero">
            <p className="eyebrow">DRAW WITH THE INTERNET</p>
            <h1>
              One million strokes.
              <br />
              <em>One permanent artwork.</em>
            </h1>
            <p>
              A single mark is a small thing. Together, we make something
              <br className="desktop-break" /> no one could have imagined alone.
            </p>
            <a href="#canvases" className="gallery-text-link">
              Find your canvas <span aria-hidden>↓</span>
            </a>
          </section>
          <CanvasDirectory section="current" featured />
          <section className="archive-invitation">
            <p className="eyebrow">A HOME FOR EVERY FINISHED WORK</p>
            <h2>Art that stays with us.</h2>
            <p>Completed canvases become part of a growing public archive.</p>
            <Link href="/archive" className="gallery-text-link">
              Explore the archive →
            </Link>
          </section>
          <section className="gallery-about">
            <p className="eyebrow">SIMPLE BY DESIGN</p>
            <h2>
              Find a place.
              <br />
              Leave a little of yourself.
            </h2>
            <ol>
              <li>
                <strong>Choose a canvas.</strong>
                <span>
                  Explore the artwork and find where your mark belongs.
                </span>
              </li>
              <li>
                <strong>Make one stroke.</strong>
                <span>
                  Choose your color, lock your view, and draw one continuous
                  gesture.
                </span>
              </li>
              <li>
                <strong>Become part of it.</strong>
                <span>Your contribution joins a work made by many hands.</span>
              </li>
            </ol>
          </section>
        </>
      )}
      <footer className="gallery-footer">
        <span>million dollar canvas</span>
        <span>Made together. Kept together.</span>
        <Link href="/#canvases">Explore the canvases ↗</Link>
      </footer>
    </main>
  );
}
