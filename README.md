# Million Dollar Canvas

Draw with the Internet, one deliberate stroke at a time. **Milestone 3: realtime multiplayer viewing**, with account-based persistence and a magnifying canvas eyedropper. The drawing interaction remains: Add Stroke → position/options → lock → 3–2–1 → one continuous gesture.

Next.js 16, React 19, strict TypeScript, native Canvas/Pointer Events, Supabase PostgreSQL/Auth/Realtime. No payments, credits, automated moderation, user reports, or scalable raster tiling.

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

## Database migration

The complete migration is `supabase/migrations/20260926202402_milestone_2_persistence.sql`. It creates profiles, canvases, canonical strokes, separate visibility, indexes, constraints, RLS, the authenticated write function, and one seeded `open-studio` development canvas. It was generated with the Supabase CLI and executed in the local SQL tests. **It has not been applied to the hosted project from this environment.**

Apply `supabase/migrations/20260926212637_milestone_3_realtime.sql` **after** the Milestone 2 migration. It adds read-only, RLS-protected `canvas_updates` rendering metadata, private trigger logic, and publication membership for that table only. Both migrations run in local SQL tests. **The Milestone 3 migration has not been applied to the hosted project from this environment either.** If Milestone 2 was already applied, run only the new migration. No privileged browser key is needed.

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

## Authentication setup

1. Enable email/password signups under Authentication. Keep email confirmation enabled for hosted use.
2. Set the Auth Site URL to your chosen local origin and allow both `http://localhost:3000/auth/confirm` and `http://127.0.0.1:3000/auth/confirm` as development redirect URLs.
3. In the **Confirm signup** email template, use a confirmation link with `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. This directs the token hash to the app's `/auth/confirm` handler. The handler also supports the PKCE `code` flow.
4. Configure SMTP if needed for recipients outside the provider's default email restrictions. Set password minimum length to at least eight characters. Supabase Auth rate limits apply to signups and sign-ins.
5. Create an account in the app with a public display name, confirm the email, and sign in. Display names are validated and never default to email addresses. The profile trigger creates a public profile on account creation.

Browsing, panning, and zooming are public. Add Stroke prompts for authentication and resumes preparation after sign-in. Next.js 16 `proxy.ts` and `@supabase/ssr` use cookies and refresh sessions. Server routes use verified Auth identity; no client-selected creator IDs are accepted.

## Drawing and color sampling

Drag to pan, scroll or use buttons to zoom, and use Reset view to recenter. Arrow keys pan when the canvas has focus. The minimap shows the viewport. Locking disables navigation; DRAW arms exactly one gesture, and releasing submits it. The UI shows a saving state until the server confirms the canonical stroke. Failed/unconfirmed saves do not remain visible as official artwork; retry the same candidate safely or reload.

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

For **real hosted** acceptance tests, apply both migrations, start the configured app, and provide `E2E_EMAIL` and `E2E_PASSWORD` as process environment variables for an already-confirmed test account in a disposable development project. Optionally set `E2E_BASE_URL`. Run `npm run test:e2e:hosted`. The persistence and realtime tests each leave one permanent test dot. The realtime test opens an independent anonymous browser, requires a real websocket notification, checks automatic appearance, then reloads both browsers. Run only against a quiet development canvas below the 2,000-vector cap. Tests skip explicitly when credentials are absent; skipped tests are not hosted verification.

## Live collaboration

**Realtime notifications are advisory. PostgreSQL remains the canonical artwork source.**

One Supabase Postgres Changes subscription per canvas watches `canvas_updates`, filtered by canvas UUID. Notifications contain rendering version metadata only; geometry, authors, and private moderation/account data are never sent through this channel. The client fetches approved strokes through the canonical read API, deduplicates by stroke ID, and sorts by server ordinal. See [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and the [architecture notes](docs/architecture.md).

Subscription success (including reconnect), tab visibility, and network restoration trigger reconciliation. Visible online tabs also check every 30 seconds to recover even if all notifications are lost. Bursts coalesce for 150 ms; normal reads fetch only new pages, never all vectors per notification. Changes to visibility invalidate the read cursor and rebuild the bounded approved set. Remote updates redraw the background while retaining the local gesture and locked viewport.

The small status label shows Live only after a confirmed subscription and successful reconciliation, Reconnecting on transport/read failure, and Offline when the browser reports no network. HTTP save/retry remains available independently of websocket status. Existing artwork remains visible during transient read failures.

Manual acceptance: open the app in two independent browsers, sign into A, and leave B anonymous. Wait for Live on both. Add a small stroke in A; B should show its geometry, saved count, and contributor without refresh. Disconnect B briefly, add another in A, then reconnect B and verify catch-up. Refresh both and compare. A second tab is supported without cross-tab coordination.

## Architecture and limitations

**The browser proposes artwork changes. The server decides whether they become canonical.**

Shared logical vectors render both in-progress and persisted artwork. Next.js validates authenticated submissions and calls a narrowly scoped PostgreSQL RPC using the user's cookie session. The database independently derives identity from `auth.uid()`, revalidates geometry, checks the open canvas under a lock, enforces idempotency/rate limits, and inserts the immutable vector and visibility atomically. Client roles cannot directly insert, overwrite, or delete records. Only approved vectors render publicly. Recent contributor names and timestamps appear below the controls.

- Valid strokes are **automatically approved for this development milestone**. This is not a production moderation system.
- Cursor-based reads load 100 strokes at a time; the viewer caps page loading at 2,000 vectors. Drawing is disabled while artwork is incomplete. The current renderer is for small canvases; future tiled rendering replaces it.
- Other users' approved changes appear automatically. Recent colors and unfinished/unconfirmed local candidates do not survive refresh.
- Geometry limits: 15 seconds, 3,000 points, 12,000 logical units of path length, widths 2/6/12, and a 160 KB HTTP body. A tap is a dot. Leaving artwork bounds, pointer cancellation/capture loss, or focus loss discards the unfinished candidate. Duration metadata is not proof of gesture timing.
- Anti-aliased pixel sampling can return blended colors. Touch uses one pointer and zoom buttons; pressure/pinch are not implemented. Physical stylus and non-Chromium engines remain unverified.
- Account deletion/anonymization, password reset UI, profile editing, distributed edge read throttling, and paid one-use stroke authorizations are future work. Database write rate limiting is ten accepted strokes per user per minute.
- Hosted migration application, advisor checks, real email confirmation, signed-in session refresh, and hosted persistence/realtime acceptance remain manual steps until the project is configured. Deterministic browser tests intercept HTTP and websocket frames; they do not prove hosted realtime connectivity.

The full [engineering constitution](AGENTS.md) remains binding; section 95 defines the milestones. Milestone 4 payments/credits and later functionality have not been implemented.
