import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { testCanvas } from "../../tests/fixtures/artwork";
import type { PersistedStroke } from "@/domain/canvas";
import { ArtworkStore, mergeStrokes, type ArtworkPage } from "./artworkStore";
import { reconcileScheduler, subscribeArtwork } from "./realtime";

function stroke(order: number): PersistedStroke {
  return {
    id: `stroke-${order}`,
    order,
    canvasId: testCanvas.id,
    status: "approved",
    points: [{ x: order, y: 20 }],
    color: "#235C4B",
    width: 6,
    duration: 1,
    bounds: { minX: 0, minY: 0, maxX: 30, maxY: 30 },
    createdAt: "2026-09-26T00:00:00Z",
    author: { id: "artist", displayName: "Painter" },
  };
}
const page = (
  strokes: PersistedStroke[],
  extra: Partial<ArtworkPage> = {},
): ArtworkPage => ({
  canvas: testCanvas,
  strokes,
  next: null,
  resetVersion: 0,
  ...extra,
});
afterEach(() => vi.useRealTimers());

it("deduplicates canonical IDs, sorts by server order, and excludes other canvases", () => {
  expect(
    mergeStrokes(
      [stroke(3)],
      [stroke(3), stroke(1), stroke(2), { ...stroke(4), canvasId: "other" }],
      testCanvas.id,
    ).map((s) => s.order),
  ).toEqual([1, 2, 3]);
});
it("reconciles missed strokes without advancing the read cursor to an originator's own save", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([stroke(1)]))
    .mockResolvedValueOnce(page([stroke(2), stroke(3)]))
    .mockResolvedValueOnce(page([]));
  const store = new ArtworkStore(read, vi.fn());
  await store.load();
  store.add(stroke(3));
  await store.load();
  await store.load();
  expect(read.mock.calls.map((args) => args[0])).toEqual([0, 1, 3]);
  expect(store.strokes.map((s) => s.order)).toEqual([1, 2, 3]);
});
it("drains bounded pages and replaces removed artwork on canonical epoch change", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([stroke(1)], { next: 1 }))
    .mockResolvedValueOnce(page([stroke(2)], { next: 2 }))
    .mockResolvedValueOnce(page([stroke(3)]))
    .mockResolvedValueOnce(
      page([stroke(1), stroke(3)], { reset: true, resetVersion: 4 }),
    );
  const store = new ArtworkStore(read, vi.fn());
  await store.load(false, true);
  expect(store.strokes).toHaveLength(3);
  await store.load();
  expect(store.strokes.map((s) => s.order)).toEqual([1, 3]);
});
it("preserves loaded artwork on read failure and recovers on retry", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([stroke(1)]))
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(page([stroke(2)]));
  const store = new ArtworkStore(read, vi.fn());
  await store.load();
  await expect(store.load()).rejects.toThrow("network");
  expect(store.strokes).toHaveLength(1);
  await store.load();
  expect(store.strokes).toHaveLength(2);
});
it("caps vector memory and still checks for invalidation when the cap is reached", async () => {
  const read = vi.fn(async (after: number) =>
    page(
      Array.from({ length: 100 }, (_, i) => stroke(after + i + 1)),
      { next: after + 100 },
    ),
  );
  const store = new ArtworkStore(read, vi.fn());
  await store.load(false, true);
  expect(store.strokes).toHaveLength(2000);
  expect(read).toHaveBeenCalledTimes(20);
  read.mockResolvedValueOnce(
    page([stroke(1)], { reset: true, resetVersion: 1 }),
  );
  await store.load(false, true);
  expect(store.strokes).toHaveLength(1);
});
it("batches duplicate/out-of-order burst notifications and follows up on events arriving during a fetch", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const result = vi.fn();
  const scheduler = reconcileScheduler(read, result);
  for (let i = 0; i < 100; i++) scheduler.request();
  await vi.advanceTimersByTimeAsync(150);
  expect(read).toHaveBeenCalledTimes(1);
  scheduler.request();
  finish();
  await vi.advanceTimersByTimeAsync(150);
  expect(read).toHaveBeenCalledTimes(2);
  expect(result).toHaveBeenLastCalledWith(true);
  scheduler.dispose();
});
it("retries failed reconciliation and cleanup cancels queued work", async () => {
  vi.useFakeTimers();
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const result = vi.fn();
  const scheduler = reconcileScheduler(read, result);
  scheduler.request();
  await vi.advanceTimersByTimeAsync(150);
  expect(result).toHaveBeenLastCalledWith(false);
  await vi.advanceTimersByTimeAsync(3000);
  expect(result).toHaveBeenLastCalledWith(true);
  scheduler.request();
  scheduler.dispose();
  await vi.runAllTimersAsync();
  expect(read).toHaveBeenCalledTimes(2);
});
it("scopes one subscription, reconciles every join, ignores malformed events and cleans up", () => {
  let event!: (payload: { new: Record<string, unknown> }) => void;
  let status!: (state: string) => void;
  const channel = {
    on: vi.fn((_type, _filter, callback) => {
      event = callback;
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      status = callback;
      return channel;
    }),
  };
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  const changed = vi.fn();
  const connected = vi.fn();
  const stop = subscribeArtwork(
    client as unknown as SupabaseClient,
    testCanvas.id,
    changed,
    connected,
  );
  expect(channel.on.mock.calls[0][1]).toMatchObject({
    filter: `canvas_id=eq.${testCanvas.id}`,
    table: "canvas_updates",
  });
  status("SUBSCRIBED");
  status("CHANNEL_ERROR");
  status("TIMED_OUT");
  status("SUBSCRIBED");
  expect(connected.mock.calls.map(([value]) => value)).toEqual([
    true,
    false,
    false,
    true,
  ]);
  event({ new: {} });
  event({ new: { canvas_id: "other" } });
  expect(changed).toHaveBeenCalledTimes(2);
  event({ new: { canvas_id: testCanvas.id } });
  expect(changed).toHaveBeenCalledTimes(3);
  stop();
  status("CLOSED");
  event({ new: { canvas_id: testCanvas.id } });
  expect(changed).toHaveBeenCalledTimes(3);
  expect(client.removeChannel).toHaveBeenCalledWith(channel);
});
