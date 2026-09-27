"use client";
import { useCallback, useEffect, useState } from "react";
import {
  API_LIMITS,
  type CanvasRecord,
  type PersistedStroke,
} from "@/domain/canvas";
import { api } from "./api";
import { ArtworkStore, type ArtworkPage } from "./artworkStore";
import { useRealtimeArtwork } from "./useRealtimeArtwork";

// Mount with key={slug} when the route/preview changes. No account or drawing
// logic is loaded by this read-only hook. Rendering is a separate consumer.
export function useCanvasArtwork(
  slug: string,
  { live = true, limit = API_LIMITS.maxLoadedStrokes as number } = {},
) {
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [strokes, setStrokes] = useState<PersistedStroke[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [store] = useState(
    () =>
      new ArtworkStore(
        (after, resetVersion) =>
          api<ArtworkPage>(
            `/api/canvases/${encodeURIComponent(slug)}?after=${after}&resetVersion=${resetVersion}`,
            { signal: AbortSignal.timeout(10000) },
          ),
        (current) => {
          setCanvas(current.canvas);
          setStrokes(current.strokes);
          setNext(current.next);
        },
        limit,
      ),
  );
  const reconcile = useCallback(() => store.load(false, true), [store]);
  const liveStatus = useRealtimeArtwork(
    live ? canvas?.id : undefined,
    reconcile,
  );
  const load = useCallback(
    async (after = 0) => {
      setLoading(true);
      setLoadError("");
      try {
        await store.load(after === 0, limit < API_LIMITS.maxLoadedStrokes);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Could not load artwork.",
        );
      } finally {
        setLoading(false);
      }
    },
    [store, limit],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return {
    canvas,
    strokes,
    next,
    loading,
    loadError,
    load,
    store,
    liveStatus,
    atCapacity: strokes.length >= limit,
    canLoadMore: next !== null && strokes.length < limit,
  };
}
