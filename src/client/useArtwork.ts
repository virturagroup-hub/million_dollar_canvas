"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_LIMITS,
  DEFAULT_SLUG,
  type Candidate,
  type CanvasRecord,
  type PersistedStroke,
  type PublicProfile,
} from "@/domain/canvas";
import { api } from "./api";
import { ArtworkStore, type ArtworkPage } from "./artworkStore";
import { useRealtimeArtwork } from "./useRealtimeArtwork";
export function useArtwork() {
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [strokes, setStrokes] = useState<PersistedStroke[]>([]);
  const [user, setUser] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [authError, setAuthError] = useState("");
  const [next, setNext] = useState<number | null>(null);
  const [configured, setConfigured] = useState(false);
  const [pending, setPending] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [store] = useState(
    () =>
      new ArtworkStore(
        (after, resetVersion) =>
          api<ArtworkPage>(
            `/api/canvases/${DEFAULT_SLUG}?after=${after}&resetVersion=${resetVersion}`,
            { signal: AbortSignal.timeout(10000) },
          ),
        (current) => {
          setCanvas(current.canvas);
          setStrokes(current.strokes);
          setNext(current.next);
        },
      ),
  );
  const reconcile = useCallback(() => store.load(false, true), [store]);
  const liveStatus = useRealtimeArtwork(canvas?.id, reconcile);
  const refreshUser = useCallback(async () => {
    try {
      const data = await api<{
        user: PublicProfile | null;
        configured: boolean;
      }>("/api/auth");
      setUser(data.user);
      setConfigured(data.configured);
      setAuthError("");
      return data.user;
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not check your session.",
      );
      setUser(null);
      return null;
    }
  }, []);
  const load = useCallback(
    async (after = 0) => {
      setLoading(true);
      setLoadError("");
      try {
        await store.load(after === 0);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Could not load artwork.",
        );
      } finally {
        setLoading(false);
      }
    },
    [store],
  );
  useEffect(() => {
    const task = window.setTimeout(() => {
      void load();
      void refreshUser();
    }, 0);
    return () => window.clearTimeout(task);
  }, [load, refreshUser]);
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
          `/api/canvases/${DEFAULT_SLUG}/strokes`,
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
    [store],
  );
  return {
    canvas,
    liveStatus,
    atCapacity: strokes.length >= API_LIMITS.maxLoadedStrokes,
    strokes,
    user,
    loading,
    loadError,
    authError,
    next,
    configured,
    pending,
    saving,
    load,
    refreshUser,
    save,
    discardPending: () => setPending(null),
    canDraw:
      !!canvas &&
      canvas.status === "open" &&
      !loading &&
      !loadError &&
      next === null &&
      strokes.length < API_LIMITS.maxLoadedStrokes &&
      !pending,
    canLoadMore: next !== null && strokes.length < API_LIMITS.maxLoadedStrokes,
  };
}
