"use client";
import { useState } from "react";
import type { PersistedStroke } from "@/domain/canvas";
import { REPORT_CATEGORIES } from "@/domain/moderation";
import { api } from "@/client/api";
export default function StrokeReport({
  strokes,
  signedIn,
}: {
  strokes: PersistedStroke[];
  signedIn: boolean;
}) {
  const [id, setId] = useState(""),
    [category, setCategory] = useState("other"),
    [description, setDescription] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = strokes.find((s) => s.id === id);
  return (
    <details className="stroke-inspector">
      <summary>Inspect / report artwork</summary>
      <label>
        Loaded stroke
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setMessage("");
          }}
        >
          <option value="">Choose a stroke</option>
          {strokes
            .slice()
            .reverse()
            .map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.author.displayName} ·{" "}
                {new Date(s.createdAt).toLocaleString()}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <>
          <p>
            By {selected.author.displayName} · {selected.color} · width{" "}
            {selected.width}
          </p>
          <svg
            role="img"
            aria-label="Selected stroke"
            viewBox={`${selected.bounds.minX - 20} ${selected.bounds.minY - 20} ${Math.max(40, selected.bounds.maxX - selected.bounds.minX + 40)} ${Math.max(40, selected.bounds.maxY - selected.bounds.minY + 40)}`}
            width="240"
            height="120"
          >
            {selected.points.length === 1 ? (
              <circle
                cx={selected.points[0].x}
                cy={selected.points[0].y}
                r={selected.width / 2}
                fill={selected.color}
              />
            ) : (
              <polyline
                points={selected.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={selected.color}
                strokeWidth={selected.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {signedIn ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                try {
                  await api("/api/reports", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, category, description }),
                  });
                  setMessage("Report received for review.");
                  setDescription("");
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not send report.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Report category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {Object.entries(REPORT_CATEGORIES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Optional context
                <textarea
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button disabled={busy}>Submit report</button>
            </form>
          ) : (
            <p>Sign in to report this stroke.</p>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
