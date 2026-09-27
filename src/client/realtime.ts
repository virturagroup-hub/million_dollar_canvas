import type { SupabaseClient } from "@supabase/supabase-js";

export type LiveStatus = "Live" | "Reconnecting" | "Offline";
export const LIVE_TIMING = { batch: 150, poll: 30000, retry: 3000 };

// Only a matching notification wakes the canonical reader; payload contents
// never become artwork, cursors, or trusted revision values.
export function subscribeArtwork(
  client: SupabaseClient,
  canvasId: string,
  changed: () => void,
  status: (connected: boolean) => void,
) {
  let disposed = false;
  const channel = client
    .channel(`canvas:${canvasId}`, {
      config: { postgres_changes_options: { wait: true } },
    })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "canvas_updates",
        filter: `canvas_id=eq.${canvasId}`,
      },
      (payload) => {
        if (
          !disposed &&
          payload.new &&
          typeof payload.new === "object" &&
          "canvas_id" in payload.new &&
          payload.new.canvas_id === canvasId
        )
          changed();
      },
    )
    .subscribe((state) => {
      if (disposed) return;
      status(state === "SUBSCRIBED");
      if (state === "SUBSCRIBED") changed(); // Covers load/subscribe race AND reconnect gaps.
    });
  return () => {
    disposed = true;
    void client.removeChannel(channel);
  };
}

export function reconcileScheduler(
  read: () => Promise<void>,
  result: (ok: boolean) => void,
) {
  let disposed = false;
  let running = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function request(delay = LIVE_TIMING.batch) {
    if (disposed) return;
    dirty = true;
    if (running || timer) return;
    timer = setTimeout(async () => {
      timer = undefined;
      running = true;
      dirty = false;
      let retry = false;
      try {
        await read();
        if (!disposed) result(true);
      } catch {
        if (!disposed) result(false);
        retry = true;
      } finally {
        running = false;
        if (retry) request(LIVE_TIMING.retry);
        else if (dirty) request();
      }
    }, delay);
  }
  return {
    request,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
