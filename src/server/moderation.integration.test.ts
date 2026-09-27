import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
const db = new PGlite(),
  user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  mod = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  canvas = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
let legacy: unknown[];
async function identity(id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
async function submit(c = canvas) {
  return (
    await db.query<{ id: string }>(
      "select public.submit_stroke($1,gen_random_uuid(),'[{\"x\":100,\"y\":200}]','#235C4B',6,10) as id",
      [c],
    )
  ).rows[0].id;
}
async function call(operation: string, payload: object) {
  return (
    await db.query<{ result: unknown }>(
      "select public.moderation($1,$2) as result",
      [operation, payload],
    )
  ).rows[0].result;
}
async function transition(id: string, expected: string, state: string) {
  return call("transition", {
    id,
    expected,
    state,
    category: "other",
    note: "Private review note",
  });
}
async function totals() {
  await db.exec("reset role");
  return (
    await db.query<{ approved_count: number; reset_version: number }>(
      "select * from public.canvas_updates order by canvas_id",
    )
  ).rows;
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);`);
  const migrations = readdirSync("supabase/migrations").sort();
  for (const name of migrations.slice(0, 3))
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.query("insert into auth.users values($1,$2,$3),($4,$5,$6)", [
    user,
    { display_name: "Artist", role: "admin" },
    "private@test.example",
    mod,
    { display_name: "Reviewer" },
    "secret@test.example",
  ]);
  await identity(user);
  await submit();
  await db.exec("reset role");
  legacy = (await db.query("select * from public.strokes")).rows;
  await db.exec(readFileSync(`supabase/migrations/${migrations[3]}`, "utf8"));
  await db.query("insert into public.user_roles values($1,'moderator')", [mod]);
}, 30000);
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback; reset role"));
afterAll(() => db.close());
it("preserves existing approved artwork and all geometry fields", async () => {
  expect((await db.query("select * from public.strokes")).rows).toEqual(legacy);
  expect(
    (await db.query("select status from public.stroke_visibility")).rows,
  ).toEqual([{ status: "approved" }]);
});
it("new pending submissions have private receipts, no public geometry/count/event, and safe retries", async () => {
  const before = await totals();
  await identity(user);
  const id = await submit();
  expect(
    (await db.query("select id from public.strokes where id=$1", [id])).rows,
  ).toEqual([]);
  expect(
    (await db.query("select public.submission_receipt($1) as receipt", [id]))
      .rows,
  ).toEqual([{ receipt: { id, status: "pending" } }]);
  expect(await totals()).toEqual(before);
  await identity(mod);
  await expect(
    db.query("select public.submission_receipt($1)", [id]),
  ).rejects.toThrow("not found");
});
it("approval, suppression and restoration reconcile exact counts/epochs, isolate canvases, preserve geometry and audit", async () => {
  await identity(user);
  const id = await submit();
  const before = await totals();
  const original = (
    await db.query("select * from public.strokes where id=$1", [id])
  ).rows;
  await identity(mod);
  await transition(id, "pending", "approved");
  await identity(user);
  expect(
    (await db.query("select id from public.strokes where id=$1", [id])).rows,
  ).toHaveLength(1);
  const approved = await totals();
  expect(approved[0].approved_count).toBe(2);
  expect(approved[1]).toEqual(before[1]);
  await identity(mod);
  await transition(id, "approved", "suppressed");
  await identity(user);
  expect(
    (await db.query("select id from public.strokes where id=$1", [id])).rows,
  ).toHaveLength(0);
  const suppressed = await totals();
  expect(suppressed[0].approved_count).toBe(1);
  expect(Number(suppressed[0].reset_version)).toBeGreaterThan(
    Number(approved[0].reset_version),
  );
  await identity(mod);
  await transition(id, "suppressed", "approved");
  await db.exec("reset role");
  expect(
    (await db.query("select * from public.strokes where id=$1", [id])).rows,
  ).toEqual(original);
  expect(
    (
      await db.query(
        "select * from public.moderation_actions where stroke_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(3);
  expect(
    (
      await db.query<{ approved_count: number }>(
        "select approved_count from public.canvas_updates where canvas_id=$1",
        [canvas],
      )
    ).rows[0].approved_count,
  ).toBe(2);
});
it("rejection retains canonical vectors without public events or counts", async () => {
  await identity(user);
  const id = await submit(other);
  const before = await totals();
  await identity(mod);
  await transition(id, "pending", "rejected");
  expect(await totals()).toEqual(before);
  expect(
    (await db.query("select id from public.strokes where id=$1", [id])).rows,
  ).toHaveLength(1);
  await identity(user);
  expect(
    (await db.query("select id from public.strokes where id=$1", [id])).rows,
  ).toHaveLength(0);
});
it.each(["queue", "detail", "transition", "resolve"])(
  "ordinary users cannot call moderator %s even through direct RPC",
  async (operation) => {
    await identity(user);
    await expect(call(operation, {})).rejects.toThrow("Forbidden");
  },
);
it.each(["user_roles", "role_history", "moderation_actions", "reports"])(
  "ordinary users cannot read or mutate private %s",
  async (table) => {
    await identity(user);
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
      "permission denied",
    );
  },
);
it("editable metadata never grants roles and users cannot self-promote", async () => {
  await identity(user);
  expect(
    (await db.query<{ role: string }>("select public.my_role() as role"))
      .rows[0].role,
  ).toBe("user");
  await expect(
    db.query("insert into public.user_roles values($1,'admin')", [user]),
  ).rejects.toThrow("permission denied");
});
it("moderators see bounded contextual artwork and history but no emails or request nonces", async () => {
  await identity(user);
  const id = await submit();
  await identity(mod);
  const detail = (await call("detail", { id })) as { context: unknown[] };
  expect(detail.context).toHaveLength(1);
  expect(JSON.stringify(detail)).not.toMatch(
    /private@test|secret@test|request_id|user_id/,
  );
  expect(await call("queue", { filter: "pending", offset: 0 })).toHaveLength(1);
});
it("reports never remove artwork and can be reviewed without changing visibility", async () => {
  const id = (legacy[0] as { id: string }).id;
  const before = await totals();
  await identity(user);
  const report = (
    await db.query<{ id: string }>(
      "select public.report_stroke($1,'other','Please review') as id",
      [id],
    )
  ).rows[0].id;
  expect(await totals()).toEqual(before);
  await identity(mod);
  expect(await call("queue", { filter: "reported" })).toHaveLength(1);
  await call("resolve", { id: report });
  expect(await call("queue", { filter: "reported" })).toHaveLength(0);
  expect(await totals()).toEqual(before);
});
it("blocks duplicate reports", async () => {
  await identity(user);
  const id = (legacy[0] as { id: string }).id;
  await db.query("select public.report_stroke($1,'other','')", [id]);
  await expect(
    db.query("select public.report_stroke($1,'other','')", [id]),
  ).rejects.toThrow("Duplicate");
});
it("blocks report spam across categories", async () => {
  await identity(user);
  const id = (legacy[0] as { id: string }).id;
  for (const category of ["other", "explicit", "hate", "privacy", "spam"])
    await db.query("select public.report_stroke($1,$2,'')", [id, category]);
  await expect(
    db.query("select public.report_stroke($1,'illegal','')", [id]),
  ).rejects.toThrow("rate limit");
});
it("refuses reports on hidden geometry", async () => {
  await identity(user);
  const id = await submit();
  await expect(
    db.query("select public.report_stroke($1,'other','')", [id]),
  ).rejects.toThrow("not found");
});
it("rejects stale/double reviews without duplicate count or audit", async () => {
  await identity(user);
  const id = await submit();
  await identity(mod);
  await transition(id, "pending", "approved");
  await db.exec("savepoint repeated_review");
  await expect(transition(id, "pending", "approved")).rejects.toThrow(
    "conflict",
  );
  await db.exec("rollback to repeated_review; reset role");
  expect(
    (
      await db.query(
        "select * from public.moderation_actions where stroke_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(1);
});
it("rejects nonsensical transitions", async () => {
  await identity(user);
  const id = await submit();
  await identity(mod);
  await expect(transition(id, "pending", "suppressed")).rejects.toThrow(
    "Invalid transition",
  );
});
it.each(["moderation_actions", "role_history"])(
  "audit %s is immutable even through privileged SQL",
  async (table) => {
    if (table === "moderation_actions") {
      await identity(user);
      const id = await submit();
      await identity(mod);
      await transition(id, "pending", "approved");
      await db.exec("reset role");
    }
    await db.exec("savepoint immutable_update");
    await expect(
      db.exec(`update public.${table} set created_at=now()`),
    ).rejects.toThrow("immutable");
    await db.exec("rollback to immutable_update");
    await expect(db.exec(`delete from public.${table}`)).rejects.toThrow(
      "immutable",
    );
  },
);
it("capacity failure rolls back approval and audit while retaining the pending submission", async () => {
  await db.query("update public.canvases set stroke_limit=1 where id=$1", [
    canvas,
  ]);
  await identity(user);
  const id = await submit();
  await identity(mod);
  await db.exec("savepoint capacity");
  await expect(transition(id, "pending", "approved")).rejects.toThrow(
    "stroke limit",
  );
  await db.exec("rollback to capacity; reset role");
  expect(
    (
      await db.query(
        "select status from public.stroke_visibility where stroke_id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ status: "pending" }]);
  expect(
    (
      await db.query(
        "select * from public.moderation_actions where stroke_id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("pending retries return the same receipt without creating more submissions", async () => {
  await identity(user);
  const id = await submit();
  await db.exec("reset role");
  const request = (
    await db.query<{ request_id: string }>(
      "select request_id from public.strokes where id=$1",
      [id],
    )
  ).rows[0].request_id;
  await identity(user);
  const retry = await db.query<{ id: string }>(
    "select public.submit_stroke($1,$2,'[{\"x\":100,\"y\":200}]','#235C4B',6,10) as id",
    [canvas, request],
  );
  expect(retry.rows[0].id).toBe(id);
});
it("admin can review, and database revocation immediately denies subsequent requests", async () => {
  await db.query("update public.user_roles set role='admin' where user_id=$1", [
    mod,
  ]);
  await identity(user);
  const id = await submit();
  await identity(mod);
  await transition(id, "pending", "approved");
  await db.exec("reset role");
  await db.query("update public.user_roles set role='user' where user_id=$1", [
    mod,
  ]);
  await identity(mod);
  await expect(call("queue", {})).rejects.toThrow("Forbidden");
});
it("ordinary users cannot mutate reports or moderation visibility directly", async () => {
  await identity(user);
  await db.exec("savepoint denied");
  await expect(
    db.exec("update public.reports set status='reviewed'"),
  ).rejects.toThrow("permission denied");
  await db.exec("rollback to denied");
  await expect(
    db.exec("update public.stroke_visibility set status='approved'"),
  ).rejects.toThrow("permission denied");
});
it("RPC rate limit applies to moderator reads even when Next.js is bypassed", async () => {
  await identity(mod);
  for (let i = 0; i < 120; i++) await call("queue", {});
  await expect(call("queue", {})).rejects.toThrow("rate limit");
});
it("new private tables have RLS and no private table joins the public publication", async () => {
  const tables = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where relname in ('user_roles','role_history','moderation_actions','reports','moderation_rate')",
  );
  expect(tables.rows).toHaveLength(5);
  expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
  const published = await db.query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname='supabase_realtime'",
  );
  expect(published.rows).toEqual([{ tablename: "canvas_updates" }]);
});
