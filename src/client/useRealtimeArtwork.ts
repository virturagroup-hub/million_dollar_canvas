"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import {
  LIVE_TIMING,
  reconcileScheduler,
  subscribeArtwork,
  type LiveStatus,
} from "./realtime";

export function useRealtimeArtwork(
  canvasId: string | undefined,
  reconcile: () => Promise<void>,
) {
  const [status, setStatus] = useState<LiveStatus>("Reconnecting");
  useEffect(() => {
    if (!canvasId) return;
    let connected = false;
    let healthy = false;
    let disposed = false;
    const update = () => {
      if (!disposed)
        setStatus(
          !navigator.onLine
            ? "Offline"
            : connected && healthy
              ? "Live"
              : "Reconnecting",
        );
    };
    const scheduler = reconcileScheduler(reconcile, (ok) => {
      healthy = ok;
      update();
    });
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeArtwork(
        browserClient(),
        canvasId,
        () => scheduler.request(),
        (ok) => {
          connected = ok;
          healthy = false;
          update();
        },
      );
    } catch {
      connected = false;
    }
    const online = () => {
      update();
      scheduler.request();
    };
    const offline = () => {
      healthy = false;
      update();
    };
    const visible = () => {
      if (document.visibilityState === "visible") scheduler.request();
    };
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible")
        scheduler.request();
    }, LIVE_TIMING.poll);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    scheduler.request();
    return () => {
      disposed = true;
      unsubscribe();
      scheduler.dispose();
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [canvasId, reconcile]);
  return status;
}
