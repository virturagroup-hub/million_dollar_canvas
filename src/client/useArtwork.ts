"use client";
import { useCallback, useRef, useState } from "react";
import type { Candidate, PersistedStroke } from "@/domain/canvas";
import { api } from "./api";
import { useAccount } from "./useAccount";
import { useCanvasArtwork } from "./useCanvasArtwork";
export function useArtwork(slug: string) {
  const artwork = useCanvasArtwork(slug);
  const account = useAccount();
  const [pending, setPending] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { store } = artwork;
  const save = useCallback(
    async (candidate: Candidate) => {
      if (savingRef.current)
        throw new Error("A stroke is already being saved.");
      savingRef.current = true;
      setSaving(true);
      setPending(candidate);
      const submissionEpoch = store.epoch;
      try {
        const data = await api<{ stroke: PersistedStroke }>(
          `/api/canvases/${encodeURIComponent(slug)}/strokes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(candidate),
          },
        );
        await store.confirm(data.stroke, submissionEpoch);
        setPending(null);
        return data.stroke;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [store, slug],
  );
  return {
    ...artwork,
    ...account,
    pending,
    saving,
    save,
    discardPending: () => setPending(null),
    canDraw:
      !!artwork.canvas &&
      artwork.canvas.status === "open" &&
      (!artwork.canvas.stroke_limit ||
        artwork.canvas.approved_count < artwork.canvas.stroke_limit) &&
      !artwork.loading &&
      !artwork.loadError &&
      artwork.next === null &&
      !artwork.atCapacity &&
      !pending,
  };
}
