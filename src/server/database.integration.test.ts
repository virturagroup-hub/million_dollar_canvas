import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
const db = new PGlite();
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const canvas = "11111111-1111-4111-8111-111111111111";
const request = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const path = [
  { x: 100, y: 200 },
  { x: 150, y: 250 },
];
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table auth.users(id uuid primary key,raw_user_meta_data jsonb, email text);`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260926202402_milestone_2_persistence.sql",
      "utf8",
    ),
  );
  await db.query("insert into auth.users values($1,$2,$3)", [
    user,
    JSON.stringify({ display_name: "Painter" }),
    "private@example.test",
  ]);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260926212637_milestone_3_realtime.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260927054754_home_dashboard_multicanvas.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("begin;");
});
afterEach(async () => {
  await db.exec("rollback;");
});
async function save(points: unknown = path, id = request) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await db.exec("set local role authenticated");
  return db.query<{ id: string }>(
    "select public.submit_stroke($1,$2,$3,$4,$5,$6) as id",
    [canvas, id, JSON.stringify(points), "#235C4B", 6, 100],
  );
}
it("applies migration, stores canonical vectors, bounds and server timestamps, and reloads them", async () => {
  const result = await save();
  const rows = await db.query<{
    points: unknown;
    min_x: number;
    max_y: number;
    created_at: Date;
    status: string;
  }>(
    "select s.points,s.min_x,s.max_y,s.created_at,v.status from public.strokes s join public.stroke_visibility v on v.stroke_id=s.id where s.id=$1",
    [result.rows[0].id],
  );
  expect(rows.rows[0].points).toEqual(path);
  expect(rows.rows[0].min_x).toBe(97);
  expect(rows.rows[0].max_y).toBe(253);
  expect(rows.rows[0].status).toBe("approved");
  expect(rows.rows[0].created_at).toBeTruthy();
});
it("makes retries idempotent", async () => {
  const a = await save();
  const b = await save();
  expect(b.rows[0].id).toBe(a.rows[0].id);
  expect(
    (
      await db.query<{ count: number }>(
        "select count(*)::int as count from public.strokes",
      )
    ).rows[0].count,
  ).toBe(1);
});
it("rejects reused IDs with different geometry", async () => {
  await save();
  await expect(save([{ x: 2, y: 3 }])).rejects.toThrow("conflict");
});
it("rejects closed canvases inside the write transaction", async () => {
  await db.exec("update public.canvases set status='closed'");
  await expect(save()).rejects.toThrow("closed");
});
it.each(
  [
    [{ x: -1, y: 3 }],
    [{ x: 4001, y: 1 }],
    [{ x: "2", y: 1 }],
    [{ x: 1, y: null }],
    [],
    [{ x: 1, y: 1, extra: 1 }],
  ].map((points) => ({ points })),
)(
  "rejects malformed or out-of-bounds stored geometry $points",
  async ({ points }) => {
    await expect(save(points)).rejects.toThrow();
  },
);
it("rate limits successful writes across requests", async () => {
  for (let i = 0; i < 10; i++)
    await save(path, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  await expect(save()).rejects.toThrow("rate limit");
});
it.each(["anon", "authenticated"])(
  "%s can view approved artwork and public labels without email",
  async (role) => {
    await save();
    await db.exec(`set local role ${role}`);
    expect((await db.query("select * from public.strokes")).rows).toHaveLength(
      1,
    );
    const profile = (
      await db.query<Record<string, unknown>>("select * from public.profiles")
    ).rows[0];
    expect(profile.display_name).toBe("Painter");
    expect(profile).not.toHaveProperty("email");
  },
);
it("hides draft canvases and suppressed artwork under RLS", async () => {
  await save();
  await db.exec(
    "reset role;update public.stroke_visibility set status='suppressed';set local role anon",
  );
  expect((await db.query("select * from public.strokes")).rows).toHaveLength(0);
  await db.exec(
    "reset role;update public.canvases set status='draft';set local role anon",
  );
  expect((await db.query("select * from public.canvases")).rows).toHaveLength(
    0,
  );
});
it("anonymous users cannot invoke the write function", async () => {
  await db.exec("set local role anon");
  await expect(
    db.query("select public.submit_stroke($1,$2,$3,$4,$5,$6)", [
      canvas,
      request,
      JSON.stringify(path),
      "#235C4B",
      6,
      100,
    ]),
  ).rejects.toThrow("permission denied");
});
it("authenticated role still requires a verified JWT identity", async () => {
  await db.exec("set local role authenticated");
  await expect(
    db.query("select public.submit_stroke($1,$2,$3,$4,$5,$6)", [
      canvas,
      request,
      JSON.stringify(path),
      "#235C4B",
      6,
      100,
    ]),
  ).rejects.toThrow("Invalid user");
});
it.each([
  "update public.profiles set display_name='Imposter'",
  "update public.canvases set status='closed'",
  "update public.strokes set color='#000000'",
  "delete from public.strokes",
  "insert into public.stroke_visibility values(gen_random_uuid(),'approved',now())",
])("normal user cannot mutate privileged records: %s", async (sql) => {
  await save();
  await db.exec("set local role authenticated");
  await expect(db.exec(sql)).rejects.toThrow("permission denied");
});
it("prevents even the service path from overwriting original vectors", async () => {
  await save();
  await db.exec("set local role service_role");
  await expect(
    db.exec("update public.strokes set points='[]'::jsonb"),
  ).rejects.toThrow("immutable");
});
it("all exposed tables have RLS enabled", async () => {
  const result = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.canvases'::regclass,'public.strokes'::regclass,'public.stroke_visibility'::regclass,'public.canvas_updates'::regclass)",
  );
  expect(result.rows).toHaveLength(5);
  expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
});

it("publishes only canvas rendering metadata, atomically with approved artwork", async () => {
  await save();
  await db.exec("set local role anon");
  const updates = await db.query<Record<string, unknown>>(
    "select * from public.canvas_updates where canvas_id='11111111-1111-4111-8111-111111111111'",
  );
  expect(updates.rows).toHaveLength(1);
  expect(Object.keys(updates.rows[0]).sort()).toEqual([
    "approved_count",
    "canvas_id",
    "last_ordinal",
    "reset_version",
    "version",
  ]);
  expect(Number(updates.rows[0].version)).toBe(2);
  const publication = await db.query(
    "select tablename from pg_publication_tables where pubname='supabase_realtime'",
  );
  expect(publication.rows).toEqual([{ tablename: "canvas_updates" }]);
});
it("visibility changes invalidate earlier cursors without publishing hidden records", async () => {
  await save();
  await db.exec(
    "reset role; update public.stroke_visibility set status='suppressed'",
  );
  let revision = (
    await db.query<Record<string, unknown>>(
      "select * from public.canvas_updates where canvas_id='11111111-1111-4111-8111-111111111111'",
    )
  ).rows[0];
  expect(Number(revision.reset_version)).toBe(3);
  await db.exec("update public.stroke_visibility set status='rejected'");
  revision = (
    await db.query<Record<string, unknown>>(
      "select * from public.canvas_updates where canvas_id='11111111-1111-4111-8111-111111111111'",
    )
  ).rows[0];
  expect(Number(revision.version)).toBe(3); // Hidden-to-hidden changes emit nothing.
  await db.exec("set local role anon");
  expect((await db.query("select * from public.strokes")).rows).toHaveLength(0);
});
it("anonymous viewers cannot see draft canvas notifications", async () => {
  await db.exec(
    "update public.canvases set status='draft'; set local role anon",
  );
  expect(
    (await db.query("select * from public.canvas_updates")).rows,
  ).toHaveLength(0);
});
it.each(["anon", "authenticated"])(
  "%s cannot forge rendering notifications",
  async (role) => {
    await db.exec(`set local role ${role}`);
    await expect(
      db.exec("update public.canvas_updates set version=999"),
    ).rejects.toThrow("permission denied");
  },
);
