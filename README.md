# Million Dollar Canvas

Draw with the Internet, one deliberate stroke at a time. The homepage is a public gallery with a live flagship feature, current canvases, and an archive. Each canvas has its own `/canvas/[slug]` studio. The drawing interaction remains: Add Stroke → position/options → lock → 3–2–1 → one continuous gesture.

Next.js 16, React 19, strict TypeScript, native Canvas/Pointer Events, Supabase PostgreSQL/Auth/Realtime. Human moderation and authenticated stroke reporting are implemented. No payments, credits, external automated moderation, or scalable raster tiling.

## Local setup

Use Node.js 22.14+ and npm:

```sh
npm ci
```

Copy `.env.example` to `.env.local` and fill in your Supabase **Project URL** and **publishable key** from the project's Connect dialog:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

These two values are intentionally browser-readable. `.env.local` is ignored; keep actual values out of committed examples. **No service-role key is required.** Restart Next.js after changing environment values.

Apply the migration and configure Auth below, then run:

```sh
npm run dev
```

Open http://localhost:3000 (or http://127.0.0.1:3000). Missing configuration/schema produces an explicit loading error with retry, never a successful local save. To run the production build locally: `npm run build`, then `npm start`.

The homepage lives at `/`, completed work at `/archive`, and the original artwork at `/canvas/open-studio`. The new flagship is `/canvas/million-dollar-canvas`. Canvas titles, categories, status, dimensions, counts and limits come from the public backend catalog; the featured canvas is selected by its `flagship` category, not its slug. Unknown canvas records show an unavailable state; malformed slugs use Next.js not-found.

## Database migration

The base migration is `supabase/migrations/20260926202402_milestone_2_persistence.sql`. It creates profiles, canvases, canonical strokes, separate visibility, indexes, constraints, RLS, the authenticated write function, and the original `open-studio` canvas.

`supabase/migrations/20260926212637_milestone_3_realtime.sql` adds read-only, RLS-protected `canvas_updates` rendering metadata, private trigger logic, and publication membership for that table only. The project owner has confirmed that the hosted Milestones 2–3 migrations, Live status, two-browser updates, persistence, and reconnect behavior work. This is owner-provided hosted verification, separate from the agent's local tests.

The product-shell migration is `supabase/migrations/20260927054754_home_dashboard_multicanvas.sql`. It runs in a transaction, preserves the original canvas ID/slug and all strokes, reclassifies `development` canvases as `community`, and adds a separate empty flagship record. It adds categories (`flagship`, `community`, `special`), display order, optional stroke limits, and nullable future `credit_cost` metadata. No credits are sold, consumed, or priced. Approved totals are backfilled and maintained transactionally. The public `canvas_catalog` view uses `security_invoker` so underlying RLS still applies. The owner describes the product shell as verified; the agent has not applied its hosted migration. Fresh installations apply all four files in timestamp order. Apply the product-shell migration first if it has not already been applied.

Recommended, from an authenticated CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db advisors --linked --type all
```

The CLI may prompt for your database password locally; do not commit it. Review the linked project before applying. This migration is intended for this application's new database, not an unrelated existing schema.

If CLI management access is unavailable, open the correct project's **Supabase Dashboard → SQL Editor → New query**, paste the **entire migration file**, and run it once. Keep the file as the schema source of truth. Dashboard execution does not register CLI migration history; reconcile history before later CLI pushes rather than rerunning the CREATE statements. No dashboard-only schema changes are needed.

With Docker installed, `npx supabase start` can run the local stack using the committed config/migrations. Docker was unavailable during implementation; the portable PGlite SQL tests do not need it.

The local config now enables Realtime. On the hosted project, ensure Realtime is enabled and `canvas_updates` appears in `supabase_realtime` after the migration. Do not add `strokes`, `stroke_visibility`, profiles, or auth tables to the publication for this feature. Existing grants and RLS on canonical records stay unchanged.

The catalog migration needs no extra Realtime publication toggle. After applying it, open `/`, verify the flagship and Open Studio cards, then enter `/canvas/open-studio` and confirm the existing artwork is still present. Leave the gallery open in a second browser while approving a new studio submission; only the matching preview/count should change. SQL migration tests also cover backfill, immutable stroke preservation, catalog privacy, count reconciliation, and configured-limit rejection.

## Authentication setup

1. Enable email/password signups under Authentication. Keep email confirmation enabled for hosted use.
2. Set the Auth Site URL to your chosen local origin and allow both `http://localhost:3000/auth/confirm` and `http://127.0.0.1:3000/auth/confirm` as development redirect URLs.
3. In the **Confirm signup** email template, use a confirmation link with `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. This directs the token hash to the app's `/auth/confirm` handler. The handler also supports the PKCE `code` flow.
4. Configure SMTP if needed for recipients outside the provider's default email restrictions. Set password minimum length to at least eight characters. Supabase Auth rate limits apply to signups and sign-ins.
5. Create an account in the app with a public display name, confirm the email, and sign in. Display names are validated and never default to email addresses. The profile trigger creates a public profile on account creation.

Browsing, panning, and zooming are public. Add Stroke prompts for authentication and resumes preparation after sign-in. Next.js 16 `proxy.ts` and `@supabase/ssr` use cookies and refresh sessions. Server routes use verified Auth identity; no client-selected creator IDs are accepted.

## Drawing and color sampling

Drag to pan, scroll or use buttons to zoom, and use Reset view to recenter. Arrow keys pan when the canvas has focus. The minimap shows the viewport. Locking disables navigation; DRAW arms exactly one gesture, and releasing submits it. The UI shows a saving state until the server returns a private submission receipt, then “Stroke submitted for review.” Pending strokes do not enter the public renderer or approved count. Failed/unconfirmed saves do not remain visible as official artwork; retry the same candidate safely or reload.

The canvas-local eyedropper shows actual neighboring pixels at 8× magnification with an exact center-pixel reticle and hex label. It flips near viewport edges and stays the same screen size at any artwork zoom. Click/tap selects; Escape or Cancel color picking preserves the previous color and removes the loupe. Picking a color also updates recent colors. The options heading has 28 px of separation from the preceding action area.

## Tests and commands

```sh
npm test                     # domain, route, sampling, and real migration SQL tests
npm run test:integration     # SQL/RLS/immutability and route trust-boundary tests
npm run typecheck            # generate Next types, then strict TypeScript
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e             # HTTP-intercepted browser regression suite
```

The default browser suite starts Next.js locally or reuses a server at port 3000. Its fixture is confined to Playwright network interception; the app has no fake persistence mode. SQL tests use PGlite with a test-only Supabase Auth fixture. See [architecture and verification boundaries](docs/architecture.md).

For **real hosted** acceptance tests, apply all four migrations, start the configured app, and provide `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_MODERATOR_EMAIL`, and `E2E_MODERATOR_PASSWORD` as process environment variables for already-confirmed artist and moderator test accounts in a disposable development project. Optionally set `E2E_BASE_URL`. Run `npm run test:e2e:hosted`. The persistence and realtime tests now visit `/canvas/open-studio` and each leave one permanent test dot. The realtime test opens an independent anonymous browser, approves the new submission as the moderator and requires a real websocket notification, checks automatic appearance, then reloads both browsers. Run only against a quiet development canvas below the 2,000-vector cap. Tests skip explicitly when credentials are absent; skipped tests are not hosted verification.

## Live collaboration

**Realtime notifications are advisory. PostgreSQL remains the canonical artwork source.**

One Supabase Postgres Changes subscription per canvas watches `canvas_updates`, filtered by canvas UUID. Notifications contain rendering version metadata only; geometry, authors, and private moderation/account data are never sent through this channel. The client fetches approved strokes through the canonical read API, deduplicates by stroke ID, and sorts by server ordinal. See [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and the [architecture notes](docs/architecture.md).

Subscription success (including reconnect), tab visibility, and network restoration trigger reconciliation. Visible online tabs also check every 30 seconds to recover even if all notifications are lost. Bursts coalesce for 150 ms; normal reads fetch only new pages, never all vectors per notification. Changes to visibility invalidate the read cursor and rebuild the bounded approved set. Remote updates redraw the background while retaining the local gesture and locked viewport.

The small status label shows Live only after a confirmed subscription and successful reconciliation, Reconnecting on transport/read failure, and Offline when the browser reports no network. HTTP save/retry remains available independently of websocket status. Existing artwork remains visible during transient read failures.

Manual acceptance: open the app in two independent browsers, sign into A, and leave B anonymous. Wait for Live on both. Add a small stroke in A, verify it stays pending, then approve it in `/moderation`; B should show its geometry, saved count, and contributor without refresh. Disconnect B briefly, submit and approve another in A, then reconnect B and verify catch-up. Refresh both and compare. A second tab is supported without cross-tab coordination.

Homepage previews use the same canonical reader/reconciler with a separate read-only renderer, capped at 500 vectors each. They never load drawing controls, pointer capture, or per-preview account checks. A page shows one flagship and at most four current previews; all five scoped channels share the existing browser client's websocket. Pagination unmounts old previews. Archive previews are snapshots without subscriptions. Counts use server-maintained approved totals even when only a partial preview is rendered. Contributor totals are deliberately omitted. Gallery membership is refreshed on navigation/pagination; there is no global cross-canvas channel or automatic canvas rotation.

## Architecture and limitations

**The browser proposes artwork changes. The server decides whether they become canonical.**

Shared logical vectors render both in-progress and persisted artwork. Next.js validates authenticated submissions and calls a narrowly scoped PostgreSQL RPC using the user's cookie session. The database independently derives identity from `auth.uid()`, revalidates geometry, checks the open canvas under a lock, enforces idempotency/rate limits, and inserts the immutable vector and visibility atomically. Client roles cannot directly insert, overwrite, or delete records. Only approved vectors render publicly. Recent contributor names and timestamps appear below the controls.

- New valid strokes enter pending review. Existing approved artwork stays approved. Only a moderator/admin can approve, reject, suppress or unsuppress through the trusted review workflow.
- Cursor-based reads load 100 strokes at a time; the viewer caps page loading at 2,000 vectors. Drawing is disabled while artwork is incomplete. The current renderer is for small canvases; future tiled rendering replaces it.
- Other users' approved changes appear automatically. Recent colors and unfinished/unconfirmed local candidates do not survive refresh.
- Geometry limits: 15 seconds, 3,000 points, 12,000 logical units of path length, widths 2/6/12, and a 160 KB HTTP body. A tap is a dot. Leaving artwork bounds, pointer cancellation/capture loss, or focus loss discards the unfinished candidate. Duration metadata is not proof of gesture timing.
- Anti-aliased pixel sampling can return blended colors. Touch uses one pointer and zoom buttons; pressure/pinch are not implemented. Physical stylus and non-Chromium engines remain unverified.
- Account deletion/anonymization, password reset UI, profile editing, distributed edge read throttling, and paid one-use stroke authorizations are future work. Database write rate limiting is ten accepted strokes per user per minute.
- The moderation migration, hosted advisor checks, and hosted acceptance remain manual steps. Deterministic browser tests intercept HTTP and websocket frames; they do not independently prove hosted connectivity. Existing hosted Milestone 3 behavior was verified by the project owner.

## Roadmap and Git integration

Milestones 1–3 are complete, including owner-verified hosted realtime. PR #3 cumulatively included PRs #1–2 and was merged once into `main` with merge commit `1ddbdba90856e6c1b017a94b1ad0bc5eedacb4b0`; GitHub marked the ancestor PRs merged/closed automatically. No force-push or duplicate milestone merge was used. The gallery/multi-canvas work branches from that integrated main.

The intermediate milestone establishes the product shell and multiple manually configured canvas records. Milestone 4 is Moderation Foundation. Payments are deferred to Milestone 10. Multiple records do **not** mean weekly automation exists. Stroke-limit checks enforce capacity but do not seal, finalize, number official masterpiece strokes, or produce provenance archives. Production flagship completion still needs its dedicated concurrency/finalization milestone. The full [engineering constitution](AGENTS.md) remains binding.


## Moderation foundation (Milestone 4)

**New migration:** `supabase/migrations/20260927172017_moderation_foundation.sql`. Run this entire file **once** in the correct development project's Supabase SQL Editor after the first three migrations. The agent has tested it in PGlite but has not applied it to hosted Supabase. Hosted advisors could not run because this checkout has no linked project/management access. Do not rerun earlier migrations or replace the database. Existing geometry, accounts and approved visibility remain unchanged; only future submissions default to pending.

The states are `pending → approved/rejected`, `approved → suppressed`, and `suppressed → approved`. Suppression removes public rendering and decrements approved counts without deleting the immutable submission. Rejection leaves counts unchanged. Approval/suppression reuse the metadata-only `canvas_updates` channel, causing public viewers to reconcile approved vectors. Pending and rejected geometry, notes, audit records and reports never enter public reads or realtime.

### Grant a development moderator

Find the intended, confirmed test account UUID in Supabase Authentication → Users. As the project owner, run this privileged SQL in SQL Editor, replacing the placeholder UUID (never embed an email in application authorization):

```sql
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_CONFIRMED_USER_UUID'::uuid, 'moderator')
on conflict (user_id) do update set role = excluded.role;
```

`admin` has the same review capabilities for now; normal users default to `user`. To revoke, set the role to `user`. Role assignments/removals append `role_history` with actor/session details. Browser roles cannot read or write role tables. There is no self-promotion endpoint or seeded privileged account. Refresh the app to update navigation; every RPC rechecks the current database role, so hiding/showing navigation is not authorization.

Open `/moderation` as that account. The page contains only a generic shell until an authenticated, authorized queue request succeeds. Choose Pending, inspect a candidate with nearby approved context, select a reason and optional internal note, then approve or reject. Approved and Suppressed filters provide suppression/restoration. Stale reviews fail explicitly rather than applying twice. Reports have their own filter and can be marked reviewed without modifying artwork.

Ordinary signed-in users can open **Inspect / report artwork** in Studio, choose a loaded stroke by contributor/time and inspect its preview, then choose a report category and optional context. Anonymous reports are intentionally deferred. Up to five reports per user per hour, no duplicate open user/stroke/category reports, and 500-character descriptions. Reports raise review priority but never hide artwork automatically. Region/profile target types are reserved with distinct schema fields; their submission endpoints and UI are deferred.

### Verification and limits

SQL tests exercise all four migrations, a legacy approved stroke, RLS/role boundaries, pending receipts, report limits, exact approved totals, epochs, isolation, transitions and immutable audit records. Older migration suites remain historical regression tests; the new moderation suite exercises the complete upgraded schema. Browser moderation tests use intercepted HTTP and websocket messages, including independent artist, anonymous viewer and moderator contexts. They are not hosted verification. The older renderer tests simulate a separate immediate moderator approval to preserve drawing/reload coverage.

Queue pages contain at most 20 items. Context images are on-demand 1024×1024 SVGs, showing at most 200 neighboring approved vectors with 100 logical units of padding and an orange candidate overlay. Partial context is labeled. Up to 50 recent actions and reports are shown; full histories remain stored. No preview is persisted. Very dense areas need future spatial/tiling work. Moderation RPCs have a per-account 120/minute database limit, and HTTP requests have a bounded per-process limiter including unauthorized attempts; distributed/edge abuse protection remains production-hardening work. The dashboard refreshes on demand, and metadata-only public realtime continues unchanged.

Future scanners can consume the server patch boundary and append advisory signal records (passed/flagged/uncertain, category, provider/confidence and patch reference). No scanner/vendor or automatic state authority exists. Human review remains authoritative. No payment-related roles, balances, refunds or courtesy credits are introduced.

## Remaining roadmap

1. **Milestone 4 — Moderation Foundation** (this change)
2. **Milestone 5 — Canvas Lifecycle and Admin Management**
3. **Milestone 6 — Profiles, Attribution, and Contributor Discovery**
4. **Milestone 7 — Scalable Rendering and Large-Canvas Infrastructure**
5. **Milestone 8 — Flagship Million-Stroke Mechanics and Provenance**
6. **Milestone 9 — Production Hardening and Launch Readiness**
7. **Milestone 10 — Payments, Credits, and Monetization**

Payment and credit functionality is intentionally deferred until the core art, moderation, canvas lifecycle, scaling, and flagship mechanics have been proven.

Payments and credits are intentionally deferred until the final monetization milestone. All existing ledger, webhook idempotency, atomic spending, one-use authorization, server authority and concurrency requirements in AGENTS.md remain binding.
