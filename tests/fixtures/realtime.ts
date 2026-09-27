import { randomUUID } from "node:crypto";
import type { BrowserContext, WebSocketRoute } from "@playwright/test";
import type {
  Candidate,
  PersistedStroke,
  CanvasRecord,
} from "../../src/domain/canvas";
import { bounds } from "../../src/drawing/model";
import { mockArtwork, testCanvas } from "./artwork";

// Test-only HTTP + Phoenix v2 websocket interception. Uses the real Supabase
// browser client/decoder; does not claim to exercise a hosted database or RLS.
export function realtimeFixture() {
  const canvases = new Map([[testCanvas.slug, testCanvas]]);
  let strokes: PersistedStroke[] = [];
  let epoch = 0;
  let ordinal = 0;
  let reads = 0;
  let failReads = false;
  let holdSaves = false;
  let nextJoin: (() => void) | undefined;
  const release: (() => void)[] = [];
  const sockets = new Set<{
    socket: WebSocketRoute;
    topic: string;
    ref: string;
    context: BrowserContext;
  }>();
  function notify(canvasId = testCanvas.id) {
    for (const connection of sockets)
      connection.socket.send(
        JSON.stringify([
          connection.ref,
          null,
          connection.topic,
          "postgres_changes",
          {
            ids: [1],
            data: {
              schema: "public",
              table: "canvas_updates",
              type: "UPDATE",
              commit_timestamp: new Date().toISOString(),
              columns: [{ name: "canvas_id", type: "uuid" }],
              record: { canvas_id: canvasId, version: ordinal },
              old_record: {},
              errors: null,
            },
          },
        ]),
      );
  }
  function add(candidate?: Candidate, canvasId = testCanvas.id) {
    ordinal++;
    const points = candidate?.points ?? [{ x: 2010, y: 1500 }];
    const stroke: PersistedStroke = {
      id: candidate?.requestId ?? randomUUID(),
      order: ordinal,
      canvasId,
      points,
      width: candidate?.width ?? 12,
      color: candidate?.color ?? "#AA2200",
      duration: candidate?.duration ?? 1,
      createdAt: new Date().toISOString(),
      bounds: bounds(points, candidate?.width ?? 12),
      author: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        displayName: "Test Artist",
      },
      status: "approved",
    };
    strokes.push(stroke);
    return stroke;
  }
  return {
    get strokes() {
      return strokes;
    },
    get reads() {
      return reads;
    },
    get connections() {
      return sockets.size;
    },
    add,
    notify,
    register(canvas: CanvasRecord) {
      canvases.set(canvas.slug, canvas);
    },
    onNextJoin(callback: () => void) {
      nextJoin = callback;
    },
    failReads(value: boolean) {
      failReads = value;
    },
    holdSaves(value: boolean) {
      holdSaves = value;
      if (!value) release.splice(0).forEach((done) => done());
    },
    suppress(id: string) {
      strokes = strokes.filter((s) => s.id !== id);
      epoch++;
      notify();
    },
    disconnect(context: BrowserContext) {
      for (const connection of sockets)
        if (connection.context === context) {
          connection.socket.close({ code: 1012, reason: "test reconnect" });
          sockets.delete(connection);
        }
    },
    async attach(context: BrowserContext, signedIn = true) {
      await mockArtwork(context, { signedIn, realtime: true });
      await context.routeWebSocket("**/realtime/v1/websocket**", (socket) => {
        socket.onMessage((raw) => {
          const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
          if (event === "phx_join") {
            const callback = nextJoin;
            nextJoin = undefined;
            callback?.();
            sockets.add({ socket, topic, ref: joinRef, context });
            socket.send(
              JSON.stringify([
                joinRef,
                ref,
                topic,
                "phx_reply",
                {
                  status: "ok",
                  response: {
                    postgres_changes: payload.config.postgres_changes.map(
                      (filter: object) => ({ ...filter, id: 1 }),
                    ),
                  },
                },
              ]),
            );
          } else if (event === "heartbeat" || event === "phx_leave") {
            socket.send(
              JSON.stringify([
                joinRef,
                ref,
                topic,
                "phx_reply",
                { status: "ok", response: {} },
              ]),
            );
            if (event === "phx_leave")
              for (const c of sockets)
                if (c.socket === socket && c.topic === topic) sockets.delete(c);
          }
        });
        socket.onClose(() => {
          for (const c of sockets) if (c.socket === socket) sockets.delete(c);
        });
      });
      await context.route("**/api/canvases?*", async (route) => {
        const params = new URL(route.request().url()).searchParams;
        const archive = params.get("section") === "archive";
        const offset = Number(params.get("offset") ?? 0);
        const all = [...canvases.values()]
          .filter((c) => c.status !== "draft")
          .map((c) => ({
            ...c,
            approved_count: strokes.filter((s) => s.canvasId === c.id).length,
          }));
        const records = all.filter((c) =>
          archive
            ? ["closed", "archived"].includes(c.status)
            : c.status === "open" && c.canvas_type !== "flagship",
        );
        await route.fulfill({
          json: {
            flagship: all.find((c) => c.canvas_type === "flagship") ?? null,
            canvases: records.slice(offset, offset + 4),
            next: records.length > offset + 4 ? offset + 4 : null,
          },
        });
      });
      await context.route("**/api/canvases/*?*", async (route) => {
        reads++;
        if (failReads) {
          await route.fulfill({
            status: 503,
            json: { error: "Temporarily unavailable" },
          });
          return;
        }
        const params = new URL(route.request().url()).searchParams;
        const slug = new URL(route.request().url()).pathname.split("/").at(-1)!;
        const canvas = canvases.get(slug);
        if (!canvas || canvas.status === "draft") {
          await route.fulfill({
            status: 404,
            json: { error: "Canvas not found." },
          });
          return;
        }
        const reset = Number(params.get("resetVersion") ?? 0) !== epoch;
        const after = reset ? 0 : Number(params.get("after") ?? 0);
        const remaining = strokes.filter(
          (s) => s.canvasId === canvas.id && s.order > after,
        );
        const page = remaining.slice(0, 100);
        await route.fulfill({
          json: {
            canvas: {
              ...canvas,
              approved_count: strokes.filter((s) => s.canvasId === canvas.id)
                .length,
            },
            strokes: page,
            next: remaining.length > 100 ? page.at(-1)!.order : null,
            reset,
            resetVersion: epoch,
          },
        });
      });
      await context.route("**/api/canvases/*/strokes", async (route) => {
        const candidate = route.request().postDataJSON();
        const slug = new URL(route.request().url()).pathname.split("/").at(-2)!;
        const canvas = canvases.get(slug)!;
        const stroke =
          strokes.find((s) => s.id === candidate.requestId) ??
          add(candidate, canvas.id);
        notify(canvas.id);
        if (holdSaves)
          await new Promise<void>((resolve) => release.push(resolve));
        await route.fulfill({ status: 201, json: { stroke } });
      });
    },
  };
}
