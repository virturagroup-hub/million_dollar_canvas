# Milestones 2–3 trust boundary

**The browser proposes artwork changes. The server decides whether they become canonical.**

```text
Browser: candidate vector + random request ID
  → Next.js route: same-origin request, bounded body, getUser(), shape validation
  → PostgreSQL RPC using the user's verified cookie/JWT session
  → private database function: auth.uid(), canvas row lock, full validation,
    retry protection, per-user rate limit, atomic vector + visibility insert
  → canonical vector and public attribution
  → browser renderer
```

Only the public project URL and publishable key are configured. No service-role key is needed. The `@supabase/ssr` browser and server clients use those public values; server helpers are protected by `server-only`. Next.js 16 `proxy.ts` validates/refreshes sessions and propagates all cookie changes and cache headers. Routes verify the user independently with `getUser()` before mutation. Auth responses are private/no-store; session-cookie content is never accepted as identity without verification.

The browser calls Next.js for mutations. The exposed `submit_stroke` function is an invoker wrapper; the definer implementation lives in the unexposed `private` schema with a fixed empty search path. Authenticated clients technically can call the wrapper directly, so the database repeats all security-critical checks. It accepts no user ID, timestamp, bounds, or status from callers. A user cannot bypass validation by skipping Next.js. Keep `private` out of Supabase's exposed schemas.

All public tables have RLS. Anonymous/authenticated roles get read-only grants on public profiles, non-draft canvases, and approved strokes. There are no ordinary INSERT/UPDATE/DELETE grants, profile edit endpoints, or geometry update endpoints. A trigger rejects canonical stroke updates/deletes even through a privileged SQL path. `stroke_visibility` is separate from immutable geometry; future moderation must add audit history before exposing state mutations. **For this development milestone only, the transaction approves valid strokes automatically.** No moderation service is implemented.

Points are ordered JSONB `{x, y}` values in logical artwork coordinates, normalized into a known shape by Next.js and validated again by PostgreSQL. The vector array order is retained. Future hashing must use an explicit canonical serialization, not arbitrary JSON property order. Timestamps, internal UUIDs, and an internal ordering key come from PostgreSQL; this key is not an official Masterpiece sequence. Bounding boxes include brush extent. Account/profile foreign keys currently prevent deletion that would break historical attribution; account deletion/anonymization flows are not implemented.

The canvas lock serializes approval with canvas closure. The per-user advisory lock protects the ten-successful-strokes-per-minute limit. `(user_id, request_id)` is unique: retrying the same candidate returns the original ID; changing a used candidate fails. Pending vectors are removed from the drawing surface until the server confirms them. A response lost after commit leaves an explicit unconfirmed-save state with a retry of the same ID or reload; it never implies that the candidate is official.

The read endpoint uses internal-order cursor pagination, 100 strokes per page. The viewer caps loading at 2,000 vectors and disables drawing when the cap is reached or an incomplete page set is displayed. This is deliberately a small-canvas renderer. Milestone 6 will replace whole-vector loading with spatial tile rendering.

## Realtime delivery and convergence

**Realtime notifications are advisory. PostgreSQL remains the canonical artwork source.**

Supabase Postgres Changes watches only `canvas_updates`, a single rendering metadata row per canvas. The private trigger updates this row in the same transaction as changes to public visibility. It contains canvas UUID, version, reset epoch, and highest internal ordinal; it contains no vectors, user identifiers, moderation statuses, notes, or email. Hidden-to-hidden visibility changes do not emit anything. RLS permits SELECT only for public canvases; neither anonymous nor authenticated clients can forge updates. Only this table is added to `supabase_realtime`; existing canonical tables and their permissions are unchanged.

The browser has one filtered subscription per viewed canvas. It ignores event payload values except for matching canvas ID, then requests approved artwork through the existing API. Successful subscription explicitly requests reconciliation, closing the baseline-load/subscription race and recovering reconnect gaps. The SDK waits for the Postgres subscription confirmation. Timers coalesce bursts (150 ms), serialize reads, and retry failures (3 seconds after a failed bounded request). Visible online tabs poll deltas every 30 seconds, and visibility/network restoration also request reads. Cleanup removes the channel, event listeners, and timers; late subscription callbacks are ignored.

`ArtworkStore` deduplicates by immutable canonical ID and sorts by server ordinal, never delivery order. The read cursor advances only from canonical pages, not local save responses: an originator's later stroke cannot skip another person's earlier unseen stroke. Local responses and notifications merge into the same map. The renderer already keeps gesture and viewport refs separate from approved background vectors, so redraws do not restart drawing or unlock the viewport.

Ordinary changes use deltas. Visibility changes (including approval of an older submission), canvas metadata changes, or out-of-order ordinal insertion increment the reset epoch. The API reads the epoch **before** reading strokes; an epoch mismatch restarts at zero. This order ensures that a concurrent change is detected on the following read, rather than acknowledged before the artwork query catches up. Reset replaces the bounded loaded set, removing suppressed strokes without exposing their hidden rows. The notification version is never trusted as an API cursor. At the vector cap, clients still check epochs, but cannot load the entire larger canvas or add strokes. No unbounded history scan occurs per event.

Failed reads preserve already-loaded artwork and change the subtle status to Reconnecting; they do not present an empty canvas. Live requires both a confirmed subscription and a successful read. Public anonymous subscriptions require only the existing publishable key. No browser storage transport, presence, remote cursors, custom websocket server, or new dependency is introduced.

SQL and TypeScript both enforce the same versioned geometry limits: 3,000 points, 15 seconds, 12,000 logical units of length, six-digit normalized hex, and widths 2/6/12. The HTTP body limit is 160 KB; PostgreSQL also bounds the JSONB text representation. Update both validation layers and their tests when changing limits. Duration is client-reported metadata within a validated range, not proof of elapsed drawing time. Paid one-use stroke authorizations belong to Milestone 4.

The loupe and selection handler share `sampleColor`: CSS pointer coordinates → logical bounds check → actual backing-buffer pixel. The loupe renders a 15×15 physical-pixel neighborhood at 8 CSS pixels per source pixel. Its center reticle surrounds exactly the selected pixel. Updates are frame-coalesced DOM/canvas writes, not React state per pointer sample; cleanup removes listeners and pending frames. Anti-aliased pixels may legitimately be blended colors.

## Verification boundaries

- Domain/HTTP tests cover identity enforcement, validation, body limits, origin checks, profile privacy, and auth calls.
- PGlite executes **both real SQL migrations** in a PostgreSQL WASM engine. A small test-only Auth schema simulates Supabase's `auth.users` and verified JWT `auth.uid()` contract. Tests exercise constraints, transactions, RLS, profile creation, retry handling, rate limits, visibility, immutability, notification triggers, and publication membership. PGlite does not run Supabase's websocket service.
- The default Playwright suite intercepts the application's HTTP boundary to test drawing, reload, auth UI, errors, loupe pixels, DPI, resize, touch, and spacing without credentials. It does not prove hosted Auth/PostgREST behavior.
- Realtime browser tests intercept Phoenix v2 websocket frames while using the real Supabase client decoder, plus canonical HTTP responses. Two contexts and an extra tab cover automatic appearance, matching raster output/attribution, early originator notification, reconnect, burst batching, periodic missed-event repair, suppression, and a remote update during a locked local gesture. These tests are deterministic transport tests, not hosted verification.
- The opt-in hosted tests use real Supabase and a pre-confirmed development account. Run only after applying both migrations and configuring Auth. Each leaves one permanent test stroke. The realtime test requires an actual websocket change in an independent anonymous browser before reload verification. No test credentials or mock backend switches ship to the application.

No hosted migration, Supabase advisor run, email delivery, session refresh against a live signed-in account, multi-connection database concurrency, or full hosted persistence test was verified in this environment without project-management access/test-account credentials. These remain setup/acceptance steps, not claimed results.
