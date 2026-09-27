import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));
const db = vi.hoisted(() => ({
  canvas: vi.fn(),
  save: vi.fn(),
  page: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({ auth, from: auth.from }),
}));
vi.mock("@/server/repository", () => ({ repository: async () => db }));
vi.mock("@/lib/supabase/config", () => ({
  publicConfig: () => ({ url: "https://test.invalid", key: "test" }),
}));
import { POST as strokePost } from "../app/api/canvases/[slug]/strokes/route";
import { GET as authGet, POST as authPost } from "../app/api/auth/route";
import { GET as artworkGet } from "../app/api/canvases/[slug]/route";
import { GET as catalogGet } from "../app/api/canvases/route";
const canvas = {
  id: "11111111-1111-4111-8111-111111111111",
  width: 4000,
  height: 3000,
  status: "open",
  opens_at: null,
  closes_at: null,
};
const candidate = {
  requestId: "22222222-2222-4222-8222-222222222222",
  points: [{ x: 4, y: 5 }],
  color: "#123456",
  width: 6,
  duration: 10,
};
const request = (body: unknown) =>
  new Request("http://localhost/api/canvases/open-studio/strokes", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  auth.getUser.mockResolvedValue({
    data: { user: { id: "verified-id", email: "private@example.test" } },
    error: null,
  });
  db.canvas.mockResolvedValue(canvas);
  db.save.mockResolvedValue({ id: "saved" });
});
it("route verifies Auth identity and does not use client identity", async () => {
  const response = await strokePost(request(candidate), {
    params: Promise.resolve({ slug: "open-studio" }),
  });
  expect(response.status).toBe(201);
  expect(auth.getUser).toHaveBeenCalledOnce();
  expect(db.save.mock.calls[0][0]).toBe("verified-id");
});
it("public catalog uses bounded backend pages without requiring authentication", async () => {
  db.catalog.mockResolvedValue({ flagship: null, canvases: [], next: null });
  const response = await catalogGet(
    new Request("http://localhost/api/canvases?section=archive&offset=4"),
  );
  expect(response.status).toBe(200);
  expect(db.catalog).toHaveBeenCalledWith("archive", 4);
  expect(auth.getUser).not.toHaveBeenCalled();
});
it.each(["section=draft", "offset=-1", "offset=100000"])(
  "catalog rejects unbounded/private request %s",
  async (query) => {
    expect(
      (await catalogGet(new Request(`http://localhost/api/canvases?${query}`)))
        .status,
    ).toBe(400);
    expect(db.catalog).not.toHaveBeenCalled();
  },
);
it("route rejects unauthenticated and spoofed submissions", async () => {
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(
    (
      await strokePost(request(candidate), {
        params: Promise.resolve({ slug: "open-studio" }),
      })
    ).status,
  ).toBe(401);
  expect(db.save).not.toHaveBeenCalled();
  auth.getUser.mockResolvedValue({
    data: { user: { id: "verified-id" } },
    error: null,
  });
  expect(
    (
      await strokePost(request({ ...candidate, userId: "imposter" }), {
        params: Promise.resolve({ slug: "open-studio" }),
      })
    ).status,
  ).toBe(400);
});
it("public session response projects only public fields", async () => {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: "verified-id",
      display_name: "Artist",
      email: "never-return-this",
    },
    error: null,
  });
  auth.from.mockReturnValue({ select: () => ({ eq: () => ({ single }) }) });
  const response = await authGet();
  expect(await response.json()).toEqual({
    user: { id: "verified-id", displayName: "Artist" },
    configured: true,
  });
});
it("signup validates the public name before calling Auth and passes only display metadata", async () => {
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  let response = await authPost(
    request({
      action: "signup",
      email: "person@example.test",
      password: "long-password",
      displayName: "<b>bad</b>",
    }),
  );
  expect(response.status).toBe(400);
  expect(auth.signUp).not.toHaveBeenCalled();
  response = await authPost(
    request({
      action: "signup",
      email: "person@example.test",
      password: "long-password",
      displayName: " Artist ",
    }),
  );
  expect(response.status).toBe(200);
  expect(auth.signUp.mock.calls[0][0].options.data).toEqual({
    display_name: "Artist",
  });
});
it("sign-in and sign-out use provider session operations", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  expect(
    (
      await authPost(
        request({
          action: "signin",
          email: "person@example.test",
          password: "long-password",
        }),
      )
    ).status,
  ).toBe(200);
  expect(auth.signInWithPassword).toHaveBeenCalledOnce();
  expect((await authPost(request({ action: "signout" }))).status).toBe(200);
  expect(auth.signOut).toHaveBeenCalledOnce();
});
it("public reconciliation accepts bounded cursors and passes the epoch to canonical reads", async () => {
  db.page.mockResolvedValue({
    strokes: [],
    next: null,
    reset: true,
    resetVersion: 9,
  });
  const response = await artworkGet(
    new Request(
      "http://localhost/api/canvases/open-studio?after=24&resetVersion=8",
    ),
    {
      params: Promise.resolve({ slug: "open-studio" }),
    },
  );
  expect(response.status).toBe(200);
  expect(db.page).toHaveBeenCalledWith(canvas.id, 24, 8);
  expect(await response.json()).toMatchObject({ reset: true, resetVersion: 9 });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it.each(["-1", "NaN", "10000000000000000"])(
  "rejects invalid reconciliation epoch %s",
  async (epoch) => {
    const response = await artworkGet(
      new Request(
        `http://localhost/api/canvases/open-studio?resetVersion=${epoch}`,
      ),
      {
        params: Promise.resolve({ slug: "open-studio" }),
      },
    );
    expect(response.status).toBe(400);
    expect(db.page).not.toHaveBeenCalled();
  },
);
