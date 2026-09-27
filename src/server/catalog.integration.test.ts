import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
const db = new PGlite();
const canvas = "11111111-1111-4111-8111-111111111111";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let legacy: unknown[];
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);`);
  for (const name of [
    "20260926202402_milestone_2_persistence.sql",
    "20260926212637_milestone_3_realtime.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.query("insert into auth.users values($1,$2,$3)", [
    user,
    { display_name: "Original Artist" },
    "private@example.test",
  ]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.query(
    "select public.submit_stroke($1,gen_random_uuid(),$2,'#235C4B',6,10)",
    [canvas, [{ x: 100, y: 200 }]],
  );
  legacy = (await db.query("select * from public.strokes")).rows;
  await db.exec(
    readFileSync(
      "supabase/migrations/20260927054754_home_dashboard_multicanvas.sql",
      "utf8",
    ),
  );
}, 30000);
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
afterAll(() => db.close());
it("preserves every original stroke field, canvas ID and old slug while adding the flagship", async () => {
  expect((await db.query("select * from public.strokes")).rows).toEqual(legacy);
  const rows = (
    await db.query<{
      id: string;
      slug: string;
      canvas_type: string;
      approved_count: number;
      stroke_limit: number | null;
      credit_cost: number | null;
    }>("select * from public.canvas_catalog order by display_order")
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    slug: "million-dollar-canvas",
    canvas_type: "flagship",
    stroke_limit: 1000000,
    approved_count: 0,
    credit_cost: null,
  });
  expect(rows[1]).toMatchObject({
    id: canvas,
    slug: "open-studio",
    canvas_type: "community",
    approved_count: 1,
  });
});
it("public catalog follows underlying RLS and never exposes private profile fields", async () => {
  await db.exec(
    "update public.canvases set status='draft' where canvas_type='flagship'; set local role anon",
  );
  const rows = (await db.query("select * from public.canvas_catalog")).rows;
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("private@example.test");
  expect(JSON.stringify(rows)).not.toContain("million-dollar-canvas");
});
it("counts approved active artwork and reconciles with the canonical vector ledger", async () => {
  await db.exec("update public.stroke_visibility set status='suppressed'");
  const count = async () =>
    (
      await db.query<{ approved_count: number }>(
        "select approved_count from public.canvas_catalog where id=$1",
        [canvas],
      )
    ).rows[0].approved_count;
  expect(await count()).toBe(0);
  await db.exec("update public.stroke_visibility set status='approved'");
  expect(await count()).toBe(1);
  await db.query(
    "select public.submit_stroke($1,gen_random_uuid(),$2,'#000000',2,10)",
    [canvas, [{ x: 2, y: 3 }]],
  );
  expect(await count()).toBe(2);
  const actual = (
    await db.query<{ count: number }>(
      "select count(*)::int as count from public.strokes s join public.stroke_visibility v on s.id=v.stroke_id where v.status='approved' and s.canvas_id=$1",
      [canvas],
    )
  ).rows[0].count;
  expect(await count()).toBe(actual);
});
it("enforces configured stroke limits atomically without committing excess vectors", async () => {
  await db.query("update public.canvases set stroke_limit=1 where id=$1", [
    canvas,
  ]);
  await db.exec("savepoint attempt");
  await expect(
    db.query(
      "select public.submit_stroke($1,gen_random_uuid(),$2,'#000000',2,10)",
      [canvas, [{ x: 2, y: 3 }]],
    ),
  ).rejects.toThrow("stroke limit");
  await db.exec("rollback to savepoint attempt");
  expect((await db.query("select * from public.strokes")).rows).toEqual(legacy);
  expect(
    (
      await db.query<{ approved_count: number }>(
        "select approved_count from public.canvas_catalog where id=$1",
        [canvas],
      )
    ).rows[0].approved_count,
  ).toBe(1);
});
it.each(["anon", "authenticated"])(
  "%s cannot alter counts, types, limits or future pricing",
  async (role) => {
    await db.exec(`set local role ${role}; savepoint attempt`);
    await expect(
      db.exec("update public.canvases set credit_cost=1,stroke_limit=3"),
    ).rejects.toThrow("permission denied");
    await db.exec("rollback to savepoint attempt");
    await expect(
      db.exec("update public.canvas_updates set approved_count=1000000"),
    ).rejects.toThrow("permission denied");
  },
);
it("keeps the flagship maximum fixed and supports archived special canvases", async () => {
  await db.exec("savepoint attempt");
  await expect(
    db.exec(
      "update public.canvases set stroke_limit=2 where canvas_type='flagship'",
    ),
  ).rejects.toThrow("flagship_limit");
  await db.exec("rollback to savepoint attempt");
  await db.exec(
    "insert into public.canvases(slug,title,width,height,status,canvas_type) values('special-evening','An Evening Together',800,600,'archived','special')",
  );
  expect(
    (
      await db.query(
        "select title,status from public.canvas_catalog where slug='special-evening'",
      )
    ).rows,
  ).toEqual([{ title: "An Evening Together", status: "archived" }]);
});
