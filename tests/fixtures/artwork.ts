import type { BrowserContext } from "@playwright/test";
import type { PersistedStroke, CanvasRecord } from "../../src/domain/canvas";
import { bounds } from "../../src/drawing/model";
export const testCanvas: CanvasRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "open-studio",
  title: "Open Studio",
  description: "",
  width: 4000,
  height: 3000,
  status: "open",
  canvas_type: "community",
  stroke_limit: null,
  credit_cost: null,
  display_order: 0,
  approved_count: 0,
  opens_at: null,
  closes_at: null,
};
// Existing renderer tests simulate an immediate separate moderator approval.
// The moderation suite overrides submission to verify the pending interval.
// Only browser-test network interception. No mock/test backdoor ships in the app.
export async function mockArtwork(
  context: BrowserContext,
  options: {
    signedIn?: boolean;
    rejectSave?: boolean;
    initial?: PersistedStroke[];
    realtime?: boolean;
  } = {},
) {
  if (!options.realtime) {
    await context.routeWebSocket("**/realtime/v1/websocket**", (socket) =>
      socket.close(),
    );
  }
  let signedIn = options.signedIn ?? true;
  let strokes = options.initial ?? [];
  await context.route("**/api/canvases?*", (route) =>
    route.fulfill({ json: { flagship: null, canvases: [], next: null } }),
  );
  await context.route("**/api/auth", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      signedIn = body.action !== "signout";
      await route.fulfill({ json: { ok: true } });
    } else
      await route.fulfill({
        json: {
          configured: true,
          user: signedIn
            ? {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                displayName: "Test Artist",
              }
            : null,
        },
      });
  });
  await context.route("**/api/canvases/open-studio?*", async (route) =>
    route.fulfill({
      json: {
        canvas: { ...testCanvas, approved_count: strokes.length },
        strokes,
        next: null,
      },
    }),
  );
  await context.route("**/api/canvases/open-studio/strokes", async (route) => {
    if (options.rejectSave) {
      await route.fulfill({
        status: 503,
        json: { error: "Save failed for test." },
      });
      return;
    }
    const p = route.request().postDataJSON();
    let stroke = strokes.find((s) => s.id === p.requestId);
    if (!stroke) {
      stroke = {
        id: p.requestId,
        points: p.points,
        color: p.color,
        width: p.width,
        duration: p.duration,
        createdAt: "2026-09-26T20:00:00Z",
        bounds: bounds(p.points, p.width),
        canvasId: testCanvas.id,
        order: strokes.length + 1,
        author: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          displayName: "Test Artist",
        },
        status: "approved",
      };
      strokes = [...strokes, stroke];
    }
    await route.fulfill({
      status: 201,
      json: { stroke: { id: stroke.id, status: "approved" } },
    });
  });
}
