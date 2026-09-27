"use client";
import { useCallback, useRef, useState } from "react";
import type { Candidate } from "@/domain/canvas";
import { api } from "./api";
import { useAccount } from "./useAccount";
import { useCanvasArtwork } from "./useCanvasArtwork";
export function useArtwork(slug: string) {
  const artwork = useCanvasArtwork(slug);
  const account = useAccount();
  const [pending, setPending] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { load } = artwork;
  const save = useCallback(
    async (candidate: Candidate) => {
      if (savingRef.current)
        throw new Error("A stroke is already being saved.");
      savingRef.current = true;
      setSaving(true);
      setPending(candidate);

      try {
        const data = await api<{
          stroke: import("@/domain/moderation").SubmissionReceipt;
        }>(`/api/canvases/${encodeURIComponent(slug)}/strokes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(candidate),
        });
        // A receipt is never public geometry; reconcile only approved artwork.
        void load(1);
        setPending(null);
        return data.stroke;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [load, slug],
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
