"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/client/api";
import {
  MODERATION_CATEGORIES,
  type QueueEntry,
  type ReviewDetail,
  type ModerationState,
} from "@/domain/moderation";
export default function ModerationDashboard() {
  const [queue, setQueue] = useState<QueueEntry[] | null>(null),
    [filter, setFilter] = useState("pending"),
    [offset, setOffset] = useState(0),
    [detail, setDetail] = useState<ReviewDetail | null>(null),
    [category, setCategory] = useState("acceptable"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    setError("");
    try {
      setQueue(
        await api<QueueEntry[]>(
          `/api/moderation?filter=${filter}&offset=${offset}`,
        ),
      );
    } catch (e) {
      setQueue(null);
      setDetail(null);
      setError(e instanceof Error ? e.message : "Could not load moderation.");
    }
  }, [filter, offset]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function inspect(id: string) {
    setBusy(true);
    setDetail(null);
    setError("");
    setNote("");
    try {
      setDetail(await api<ReviewDetail>(`/api/moderation?id=${id}`));
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not inspect.");
    } finally {
      setBusy(false);
    }
  }
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
      if (detail) await inspect(detail.stroke.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review.");
    } finally {
      setBusy(false);
    }
  }
  const transitions: Record<ModerationState, [ModerationState, string][]> = {
    pending: [
      ["approved", "Approve"],
      ["rejected", "Reject"],
    ],
    approved: [["suppressed", "Suppress"]],
    suppressed: [["approved", "Unsuppress"]],
    rejected: [],
  };
  return (
    <main className="moderation-page">
      <header>
        <Link className="brand" href="/">
          million dollar canvas
        </Link>
        <Link href="/">Home</Link>
      </header>
      <h1>Moderation</h1>
      <p role="alert">{error}</p>
      {queue === null ? (
        <button onClick={() => void load()}>Check access / retry</button>
      ) : (
        <>
          <p>
            Review the mark and its surroundings. Internal reasons and notes
            stay private.
          </p>
          <label>
            Queue
            <select
              aria-label="Queue"
              value={filter}
              disabled={busy}
              onChange={(e) => {
                setFilter(e.target.value);
                setOffset(0);
                setDetail(null);
              }}
            >
              {[
                "pending",
                "reported",
                "approved",
                "suppressed",
                "rejected",
              ].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => void load()}>
            Refresh queue
          </button>
          <div className="review-layout">
            <section aria-label="Review queue">
              {queue.length === 0 && <p>No items in this queue.</p>}
              {queue.map((item) => (
                <button
                  className="queue-entry"
                  disabled={busy}
                  key={item.id}
                  onClick={() => void inspect(item.id)}
                >
                  <strong>
                    {item.display_name} · {item.canvas_title}
                  </strong>
                  <span>
                    {item.status} · {item.report_count} open reports
                  </span>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </button>
              ))}
              <button
                disabled={busy || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Previous
              </button>
              <button
                disabled={busy || queue.length < 20}
                onClick={() => setOffset(offset + 20)}
              >
                Next
              </button>
            </section>
            {detail && (
              <section aria-label="Stroke review">
                <h2>{detail.canvasTitle}</h2>
                <p>
                  {detail.displayName} · {detail.status} ·{" "}
                  {new Date(detail.stroke.created_at).toLocaleString()}
                </p>
                {/* Authenticated on-demand SVG with no external resources. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="moderation-patch"
                  src={`/api/moderation?id=${detail.stroke.id}&patch=1&revision=${revision}`}
                  alt="Candidate stroke with surrounding approved artwork"
                />
                <p>
                  Orange outline identifies the candidate. {detail.stroke.color}{" "}
                  · width {detail.stroke.width}.{" "}
                  {detail.context.length > 200
                    ? "Partial context: 200 nearby strokes shown."
                    : ""}
                </p>
                <label>
                  Internal reason
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {Object.entries(MODERATION_CATEGORIES).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Internal note
                  <textarea
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div className="review-actions">
                  {transitions[detail.status].map(([state, label]) => (
                    <button
                      key={label}
                      disabled={busy}
                      onClick={() =>
                        void action({
                          operation: "transition",
                          id: detail.stroke.id,
                          expected: detail.status,
                          state,
                          category,
                          note,
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <h3>Reports</h3>
                {detail.reports.length === 0 && <p>No reports.</p>}
                {detail.reports.map((r) => (
                  <article key={r.id}>
                    <p>
                      {r.category}: {r.description} · {r.status}
                    </p>
                    {r.status === "open" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action({ operation: "resolve", id: r.id })
                        }
                      >
                        Mark report reviewed
                      </button>
                    )}
                  </article>
                ))}
                <h3>Recent audit history</h3>
                {detail.history.map((h) => (
                  <p key={h.id}>
                    {h.previous_state} → {h.new_state} · {h.category} · {h.note}{" "}
                    · {new Date(h.created_at).toLocaleString()}
                  </p>
                ))}
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
