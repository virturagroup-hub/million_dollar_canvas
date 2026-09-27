import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serverClient: async () => db }));
import { GET, POST } from "../app/api/moderation/route";
import { POST as report } from "../app/api/reports/route";
import { moderationPatch } from "./moderationPatch";
import type { ReviewDetail } from "@/domain/moderation";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (body: unknown, path = "moderation", origin = "http://localhost") =>
  new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  db.auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  db.rpc.mockResolvedValue({ data: [], error: null });
});
it("denies anonymous queue, image, action and report requests", async () => {
  db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(
    (await GET(new Request("http://localhost/api/moderation"))).status,
  ).toBe(401);
  expect(
    (await GET(new Request(`http://localhost/api/moderation?id=${id}&patch=1`)))
      .status,
  ).toBe(401);
  expect((await POST(req({ id, operation: "transition" }))).status).toBe(401);
  expect(
    (await report(req({ id, category: "other", description: "" }, "reports")))
      .status,
  ).toBe(401);
  expect(db.rpc).not.toHaveBeenCalled();
});
it("database role denial protects queue, detail, image and mutations", async () => {
  db.rpc.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
  for (const query of ["", `?id=${id}`, `?id=${id}&patch=1`])
    expect(
      (await GET(new Request("http://localhost/api/moderation" + query)))
        .status,
    ).toBe(403);
  expect((await POST(req({ id, operation: "transition" }))).status).toBe(403);
});
it("checks origin before mutations", async () => {
  expect(
    (
      await POST(
        req(
          { id, operation: "transition" },
          "moderation",
          "https://other.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect((await report(req({}, "reports", "https://other.test"))).status).toBe(
    403,
  );
  expect(db.rpc).not.toHaveBeenCalled();
});
it.each(["?offset=-1", "?offset=10001", "?filter=secrets", "?id=bad"])(
  "bounds queue request %s",
  async (query) => {
    expect(
      (await GET(new Request("http://localhost/api/moderation" + query)))
        .status,
    ).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  },
);
it("forwards actions under the verified session and handles stale review conflicts", async () => {
  db.rpc.mockResolvedValue({
    data: null,
    error: { message: "Review conflict; reload" },
  });
  expect(
    (
      await POST(
        req({
          id,
          operation: "transition",
          expected: "pending",
          state: "approved",
        }),
      )
    ).status,
  ).toBe(409);
  expect(db.rpc).toHaveBeenCalledWith(
    "moderation",
    expect.objectContaining({ p_operation: "transition" }),
  );
});
it("validates report categories and description length", async () => {
  for (const body of [
    { id, category: "__proto__", description: "" },
    { id, category: "other", description: "x".repeat(501) },
  ])
    expect((await report(req(body, "reports"))).status).toBe(400);
  expect(db.rpc).not.toHaveBeenCalled();
});
it("accepted reports return no private moderation data", async () => {
  db.rpc.mockResolvedValue({ data: id, error: null });
  const response = await report(
    req({ id, category: "other", description: "Review please" }, "reports"),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("renders a stable bounded contextual image without injecting notes or changing canonical geometry", () => {
  const detail = {
    stroke: {
      id,
      ordinal: 2,
      created_at: "2026-09-27T00:00:00Z",
      canvas_id: id,
      points: [{ x: 100, y: 200 }],
      color: "#235C4B",
      width: 6,
      min_x: 97,
      min_y: 197,
      max_x: 103,
      max_y: 203,
    },
    status: "pending",
    context: [
      {
        id: "context",
        ordinal: 1,
        points: [
          { x: 90, y: 190 },
          { x: 110, y: 210 },
        ],
        color: "#112233",
        width: 2,
      },
    ],
    history: [],
    reports: [],
    displayName: "<script>bad</script>",
    canvasTitle: "Test",
  } as ReviewDetail;
  const copy = JSON.stringify(detail);
  const svg = moderationPatch(detail);
  expect(svg).toBe(moderationPatch(detail));
  expect(svg).toContain('width="1024"');
  expect(svg).toContain("#112233");
  expect(svg).toContain("#235C4B");
  expect(svg).not.toContain("<script");
  expect(JSON.stringify(detail)).toBe(copy);
});
