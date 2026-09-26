# AGENTS.md

# Collaborative Canvas Project
## Engineering Constitution and Instructions for Coding Agents

This document defines the non-negotiable product rules, architecture principles, security requirements, coding standards, testing expectations, and working practices for this repository.

All coding agents, including Codex, must read this file before making changes.

If implementation details conflict with this document, this document takes precedence unless explicitly amended by the project owner.

---

# 1. Project Overview

This project is a browser-based collaborative drawing platform.

Users purchase stroke credits and spend those credits to contribute individual freehand strokes to shared canvases.

The platform contains two primary canvas types:

1. Recurring community canvases
2. The flagship Million-Stroke Masterpiece

The fundamental interaction is deliberately simple:

1. User opens a canvas.
2. User chooses `Add Stroke`.
3. User positions and zooms the canvas.
4. User locks the viewport.
5. User selects stroke color and permitted stroke properties.
6. A 3-second countdown occurs.
7. The next pointer-down begins the stroke.
8. Pointer movement records the stroke.
9. Pointer-up ends the stroke.
10. The stroke is submitted.
11. The stroke passes through moderation.
12. If approved, it becomes part of the permanent public artwork.

The project is not an unrestricted image editor.

It is a constrained collaborative artwork platform centered around permanent individual strokes.

---

# 2. Product Philosophy

Favor:

- simplicity
- transparency
- reliability
- permanence
- provenance
- deliberate user actions
- low friction
- understandable rules
- scalable architecture
- server-side authority

Avoid:

- unnecessary feature complexity
- speculative features
- gamification that distracts from collaborative art
- crypto
- NFTs
- speculative markets
- resale markets
- hidden mechanics
- client-authoritative state
- premature microservices
- premature distributed architecture
- unnecessary dependencies

Do not turn this application into a general-purpose drawing program.

The basic user interaction must remain understandable in seconds.

---

# 3. Core Product Concepts

## 3.1 Stroke Credits

Users purchase stroke credits.

Community canvases may consume a configurable number of credits per stroke.

Initial intended model:

- 1 community stroke = 1 credit
- 10 credits may initially cost approximately $1
- flagship Masterpiece stroke may consume 10 credits

Pricing must remain configurable and must never be hardcoded throughout the application.

A centralized pricing/configuration system must determine:

- available packages
- number of credits
- price
- canvas stroke cost
- promotions if later introduced

Payment amounts and credits are server-authoritative.

---

# 4. Canvas Types

Canvas behavior must be data-driven rather than implemented as separate applications.

A canvas record should be capable of representing different rules.

Examples:

## Community Canvas

Typical properties:

- themed
- time-limited
- low stroke cost
- closes at a configured date/time
- archived permanently after closing

Example:

`Weekly Canvas #17 — Under the Sea`

The canvas closes according to its configured schedule regardless of stroke count.

## Million-Stroke Masterpiece

Properties:

- flagship canvas
- permanent until completed
- maximum exactly 1,000,000 approved active strokes
- premium stroke credit cost
- freezes permanently when final completion conditions are met
- intended to become a one-of-one physical artwork
- permanent digital archive
- contributor ledger
- verifiable provenance

Canvas behavior should be controlled through stored configuration wherever practical.

---

# 5. Absolute Core Invariants

These are NON-NEGOTIABLE.

## 5.1 Server Authority

The client/browser must NEVER be authoritative for:

- credit balances
- payment state
- stroke numbering
- moderation state
- approval state
- canvas completion state
- canvas closure state
- user permissions
- administrator permissions
- moderator permissions
- pricing
- available purchase credits
- ledger state
- transaction success
- contributor statistics

The client may display cached values.

The server determines truth.

---

## 5.2 Immutable Stroke Submissions

Original submitted stroke data must be immutable after creation.

Do not silently edit or overwrite:

- stroke geometry
- original color
- original width
- original submitter
- original submission timestamp
- original canvas
- original payment/credit relationship

Moderation actions must be represented separately.

Possible statuses may include:

- pending
- approved
- rejected
- suppressed

If requirements evolve, preserve the original stroke record and append state/history records rather than rewriting history.

---

# 6. Stroke Lifecycle

A stroke has a lifecycle.

Example:

```text
AUTHORIZED
    ↓
DRAWING
    ↓
SUBMITTED
    ↓
PENDING MODERATION
    ↓
 ┌───────────────┐
 ↓               ↓
APPROVED       REJECTED
 ↓
PUBLIC
 ↓
possible later suppression
```

Do not assume submission equals approval.

Do not assume payment equals guaranteed publication.

---

# 7. Stroke Authorization

Before drawing begins, the server should issue a short-lived one-use authorization for the intended canvas.

The authorization should be bound to:

- authenticated user
- canvas
- expected stroke credit cost
- expiration time
- unique nonce/token

A stroke authorization:

- must expire
- must not be reusable
- must not be transferable between users
- must not be transferable between canvases
- must not trust client-supplied cost values

The server must verify authorization during submission.

---

# 8. Drawing Interaction

The expected primary workflow:

```text
Add Stroke
→ Position Canvas
→ Choose Color/Width
→ Lock View
→ 3
→ 2
→ 1
→ DRAW
→ Pointer Down
→ Pointer Move
→ Pointer Up
→ Submit
```

## Requirements

Before pointer-down:

- user may cancel
- user may reposition before locking
- no credit should be consumed merely by entering drawing mode

Once a valid pointer-down begins an authorized stroke:

- canvas panning must stop
- zooming must stop
- pointer capture should be used
- movement is recorded
- pointer-up ends the stroke
- the stroke may not be extended afterward

Use browser Pointer Events rather than mouse-only events where practical so the application can support:

- mouse
- stylus
- touch input

Drawing behavior must not record unrelated pointer movement outside an intentionally armed drawing session.

---

# 9. Stroke Validation

Never accept arbitrary geometry from the client.

Every submitted stroke must be validated server-side.

Validate at minimum:

- authorization
- user identity
- canvas status
- canvas bounds
- stroke point count
- stroke duration
- stroke path length
- maximum coordinate distance
- supported brush width
- supported color format
- allowed opacity
- payload size
- malformed values
- duplicate submission
- replayed authorization
- impossible timestamps

Reject:

- NaN coordinates
- infinity
- unreasonable payload sizes
- paths outside defined limits
- unsupported widths
- invalid colors
- malformed vectors
- unreasonably dense point sequences
- submissions against closed canvases

Do not trust client-side validation alone.

---

# 10. Stroke Duration and Complexity

The product concept is one continuous user gesture, not unlimited drawing disguised as one stroke.

Implement configurable limits such as:

- maximum stroke duration
- maximum vector path length
- maximum points
- maximum canvas-relative distance
- maximum payload size

These values must be centrally configurable.

Do not hardcode them throughout UI components.

---

# 11. Colors

Users should be able to select stroke color through:

- visual color picker
- hex value input
- canvas eyedropper/color sampling tool
- recent colors

Hex colors must be normalized server-side.

Never trust only client validation.

Initial implementation should prefer:

`#RRGGBB`

Additional formats should only be added deliberately.

Color sampling should preferably sample from the rendered artwork inside the application rather than requiring unrestricted browser/system access.

---

# 12. Brush Width

Supported widths should be intentionally constrained.

Do not allow arbitrary enormous stroke widths.

Store the chosen width with the stroke.

Allowed widths should be configurable.

Example only:

- 1
- 2
- 4
- 8
- 12

Do not treat these exact values as mandatory unless configured.

---

# 13. Payment Architecture

Use Stripe Checkout or another explicitly approved hosted payment interface.

Do NOT build custom card-entry handling unless explicitly directed.

The application must never store:

- full card numbers
- CVVs
- raw banking credentials

Payment provider data should be referenced using provider-issued identifiers.

---

# 14. Stripe Webhook Rules

Credits are added ONLY after the server verifies a valid payment event.

Never grant credits merely because:

- the browser returned to a success URL
- the client says payment succeeded
- query parameters indicate success
- local storage contains purchase state

Webhook processing MUST be idempotent.

Processing the same Stripe event repeatedly must never create duplicate credits.

Store processed provider event IDs.

Example requirement:

```text
Stripe event X received once:
+100 credits

Stripe event X received again:
+0 credits
```

This behavior must be tested.

---

# 15. Credit Ledger

Do NOT implement credits solely as a mutable integer.

The canonical source should be an append-only ledger.

Example:

```text
+100  purchase
-1    weekly_canvas_stroke
-1    weekly_canvas_stroke
-10   masterpiece_stroke
+1    courtesy_replacement
```

Each entry should contain appropriate metadata such as:

- unique ID
- user ID
- amount
- reason/type
- related canvas
- related stroke if applicable
- related payment if applicable
- timestamp
- source/reference ID

A cached balance may exist for performance.

If a cached balance exists, it must be reconcilable against the ledger.

The ledger is authoritative.

---

# 16. Atomic Credit Consumption

Stroke credit consumption and stroke submission must behave atomically.

Required behavior:

If the stroke submission succeeds:

```text
credit debit succeeds
+
stroke record succeeds
```

If submission fails:

```text
no permanent debit
+
no committed stroke
```

Do not create scenarios where:

- credit disappears but stroke is never recorded
- stroke is recorded without required credit consumption

Use database transactions or equivalent atomic operations.

Concurrency must be tested.

---

# 17. No Double Spending

It must be impossible for multiple simultaneous requests to spend the same available credit balance.

Test intentional concurrency.

Example:

User has exactly:

`10 credits`

Two simultaneous Masterpiece requests each cost:

`10 credits`

Expected result:

- one may succeed
- the other must fail

Never allow both.

---

# 18. Moderation Philosophy

The platform contains user-generated public artwork.

Moderation is mandatory.

The system must support:

1. automated moderation
2. user reports
3. human moderation
4. stroke suppression
5. moderation audit history

Do not design moderation as an afterthought.

---

# 19. Moderation States

Recommended conceptual states:

```text
pending
approved
rejected
suppressed
```

Meaning:

## pending

Submitted but not yet publicly final.

## approved

Allowed to appear publicly.

## rejected

Never admitted to the official artwork.

## suppressed

Was previously public or approved but has been removed from public rendering after later moderation.

Exact database implementation may differ if the behavior remains equivalent.

---

# 20. Automated Moderation

Automated moderation must not evaluate only the isolated stroke.

A harmless-looking line may contribute to prohibited imagery when combined with surrounding strokes.

The moderation pipeline should generate an image patch containing:

- new candidate stroke
- nearby existing approved strokes
- reasonable surrounding context

This patch can then be evaluated.

The system should support rescanning areas as multiple strokes accumulate.

---

# 21. Automated Moderation Limitations

Automated moderation is advisory.

It must NOT be treated as infallible.

Do not permanently confiscate user credits solely because an automated classifier flagged something.

Questionable submissions should be capable of entering a human moderation queue.

---

# 22. Human Moderation

Moderators need tools to inspect:

- candidate stroke
- nearby artwork
- stroke author
- previous moderation history
- related reports
- affected area
- drawing order
- associated strokes

Moderators should be able to:

- approve
- reject
- suppress
- unsuppress when appropriate
- add internal notes
- issue account warnings
- escalate accounts
- grant discretionary courtesy replacement credits where permitted

Every moderation action must be logged.

---

# 23. Suppression Instead of Silent Deletion

Do not silently delete historical stroke records merely because artwork is removed publicly.

Suppression should preserve:

- original record
- user attribution internally
- timestamp
- moderation reason
- moderator
- moderation timestamp

Suppressed strokes must not render publicly.

Suppressed strokes should not count toward final active artwork totals.

---

# 24. User Reporting

Users must eventually be able to report:

- a canvas region
- a stroke
- a profile
- inappropriate profile links

Reports must not automatically remove artwork.

Reports should raise review priority.

Protect reporting mechanisms against:

- spam
- automated abuse
- brigading
- repeated duplicate reports

---

# 25. Community Guidelines Enforcement

Expected prohibited categories include at minimum:

- explicit sexual imagery
- sexual content involving minors
- hate symbols/content
- targeted harassment
- credible threats
- private identifying information/doxxing
- illegal content
- malicious links
- phishing
- malware
- deliberate moderation evasion

Final policies must be reflected in the actual Terms/Community Guidelines.

Engineering should provide enforcement capabilities without hardcoding legal policy text into unrelated business logic.

---

# 26. Replacement Credit Policy

The system must support discretionary replacement credits.

Do NOT automatically refund every rejected or suppressed stroke.

Intended behavior:

## Intentional violation

- stroke rejected/suppressed
- consumed credit may be forfeited
- moderation strike may be issued

## Innocent/ambiguous case

Moderator may issue replacement credit.

The moderation tools must make replacement credit actions explicit and auditable.

Do not create an unlimited automatic retry loophole.

---

# 27. Profiles

Each user may have a public contributor profile.

Potential public fields:

- display name
- avatar
- short bio
- website
- approved social links
- contributor statistics

Never expose payment identity or private account information.

Public identity must be separable from:

- legal name
- billing identity
- payment-provider identity
- email address unless user explicitly chooses to display it

---

# 28. Public Stroke Attribution

Approved strokes may publicly reference the contributor's profile.

A user may later need the ability to anonymize public attribution without removing the artwork itself.

Design data relationships so a stroke's historical existence does not depend on displaying personally identifying profile information forever.

A stroke should be capable of rendering as:

`Former Contributor`

or equivalent if attribution is removed.

---

# 29. Profile Links

Public links are a security and moderation surface.

Profile URLs must:

- use approved protocols
- normally require HTTPS
- be sanitized
- never execute user-provided code
- never allow `javascript:` URLs
- never allow arbitrary HTML
- use appropriate user-generated-content link attributes

Use attributes such as:

`rel="ugc nofollow noopener noreferrer"`

where appropriate.

---

# 30. Canvas Integrity

The official canvas state must be reconstructable from canonical stored data.

Never allow the only copy of artwork to be:

- browser bitmap
- screenshot
- CDN cache
- generated raster file

The vector stroke ledger is the canonical artistic record.

Raster outputs are derivatives.

---

# 31. Vector Storage

Each stroke should store sufficient data to reproduce it accurately.

Potential fields include:

- stroke ID
- canvas ID
- user ID
- submitted path
- normalized path representation
- color
- width
- created timestamp
- bounding box
- moderation relationship
- credit relationship
- integrity hash

Avoid excessive point sampling.

Path simplification/compression is encouraged if it preserves visual fidelity.

Do not destroy original meaning through overly aggressive simplification.

---

# 32. Spatial Indexing

Each stroke should have a bounding region.

Support spatial querying so the platform can determine:

- strokes near a click
- strokes inside a reported region
- strokes affecting a tile
- strokes requiring re-rendering

Use an appropriate spatial index or efficient bounding-box strategy.

Do not scan all strokes in a million-stroke canvas for every click.

---

# 33. Raster Tile Rendering

The browser must not be required to download or render 1,000,000 vectors just to view the canvas.

Long-term rendering architecture should support rasterized image tiles.

Conceptually:

```text
vector source of truth
        ↓
tile renderer
        ↓
raster tile pyramid
        ↓
CDN/object storage
        ↓
browser
```

Recent/active strokes may temporarily render as vector overlays until incorporated into refreshed tiles.

---

# 34. Zoom Levels

Canvas viewing should eventually support multiple levels of detail.

At distant zoom levels:

- load fewer/larger raster tiles

At close zoom levels:

- load higher-resolution tiles
- allow vector hit-testing where necessary

Memory usage should depend primarily on visible viewport, not total canvas history.

---

# 35. Real-Time Updates

Users viewing an active canvas should see newly approved strokes without manually refreshing.

Real-time messages must be treated as notifications, not canonical state.

If realtime events are missed, the client must be able to reconcile with authoritative server state.

Never make the permanent artwork dependent on delivery of a WebSocket message.

---

# 36. Realtime Scalability

Initial architecture may use Supabase Realtime.

If realtime load later exceeds practical limits, architecture may evolve toward a dedicated coordination layer.

Do not prematurely implement complicated distributed systems.

Prefer:

1. simplest reliable MVP
2. measure actual load
3. optimize based on evidence

---

# 37. Million-Stroke Limit

The flagship canvas must never contain more than exactly:

`1,000,000`

approved active strokes when finalized.

Stroke numbering must be server-side.

The client must never choose an official sequence number.

Concurrency near completion must be explicitly tested.

Example:

Current count:

`999,999`

Ten valid stroke approvals occur concurrently.

Expected:

- exactly one becomes official stroke `1,000,000`
- no other approval may produce `1,000,001`
- remaining candidates must remain safely handled according to product policy

---

# 38. Sequence Assignment

Official sequence assignment should happen only at the appropriate point in the approval lifecycle.

Avoid renumbering large historical ranges after moderation.

Use separate internal IDs and public sequence numbers where needed.

Internal submission identity and public approved-stroke numbering should not be assumed to be identical concepts.

---

# 39. Canvas Closure

A canvas can close due to:

- scheduled deadline
- stroke limit
- explicit administrator action
- maintenance/emergency state

Canvas closure must be server-authoritative.

After closure:

- new stroke authorizations should fail
- new strokes should not be accepted unless explicitly part of an approved completion workflow
- public artwork remains viewable
- archival rendering begins
- replay remains available where supported

---

# 40. Masterpiece Finalization

The Million-Stroke Masterpiece requires a deliberate finalization process.

Do not automatically declare final physical completion based solely on a client-visible counter.

Finalization should verify:

- exactly 1,000,000 valid active approved strokes
- no unresolved required moderation
- final artwork successfully renders
- vector archive is complete
- contributor statistics reconcile
- integrity manifest is generated
- final backups exist

Once sealed, the canvas should enter a permanent read-only state.

---

# 41. Tamper-Evident Integrity

The project should support cryptographic verification of the canonical stroke sequence.

A hash-chain or Merkle-based approach may be used.

Simplified conceptual example:

```text
hash_1 = SHA256(stroke_1)

hash_2 = SHA256(hash_1 + canonical(stroke_2))

hash_3 = SHA256(hash_2 + canonical(stroke_3))
```

Canonical serialization must be deterministic.

Do not hash unstable JSON ordering.

Periodically produce integrity checkpoints.

The project should eventually be capable of publishing a final artwork hash/manifest.

No blockchain is required.

Do not add blockchain technology unless explicitly requested.

---

# 42. Final Provenance Manifest

For permanently archived canvases, especially the flagship, support producing a provenance manifest containing data such as:

- canvas ID
- title
- canvas dimensions
- opened timestamp
- closed timestamp
- finalization timestamp
- active approved stroke count
- submission count
- unique contributor count
- canonical ledger hash
- rendered artwork hash
- contributor ledger hash
- software/version information if useful

The manifest should be reproducible and verifiable.

---

# 43. Replay

Because stroke order is preserved, the system should eventually support replay.

Users may be able to:

- watch artwork form
- scrub through history
- generate timelapses
- inspect milestone states

Do not architect storage in a way that makes replay impossible.

---

# 44. Contributor Highlighting

The system should eventually support:

- search contributor
- highlight their strokes
- show contribution count
- navigate among their strokes

This feature should use indexed data.

Do not require scanning all vectors client-side.

---

# 45. Object Storage

Use object storage for generated assets such as:

- raster tiles
- moderation patches
- canvas snapshots
- generated timelapses
- exports
- final renders
- archive manifests

Object storage is not authoritative for payment or credits.

Do not place secrets in publicly accessible buckets.

---

# 46. Database

Prefer PostgreSQL.

The schema should be normalized enough to preserve integrity without becoming unnecessarily abstract.

Likely entities may include:

```text
users/profiles
canvases
canvas_rules
stroke_authorizations
stroke_submissions
stroke_approvals
stroke_suppressions
moderation_actions
reports
credit_ledger
payments
processed_payment_events
canvas_statistics
canvas_snapshots
integrity_checkpoints
```

Exact schema may vary.

Favor explicit relational integrity.

---

# 47. Database Constraints

Use database constraints whenever possible.

Do not rely entirely on application logic for invariants.

Examples:

- valid foreign keys
- unique payment event IDs
- unique authorization use
- non-null critical fields
- nonnegative constraints where appropriate
- valid state enums/checks
- unique sequence values per canvas
- maximum flagship sequence

Application validation and database constraints should reinforce each other.

---

# 48. Database Migrations

All schema changes must use migrations.

Never modify production schema manually without recording the migration.

Migrations should:

- be deterministic
- be reviewable
- support controlled rollout
- avoid destructive operations without explicit approval

Destructive migrations require special caution.

Before deleting or rewriting important data, stop and request explicit approval.

---

# 49. Authentication

Use established authentication infrastructure.

Do not implement custom password hashing/authentication unless explicitly required.

Protect:

- account session
- admin actions
- moderator actions
- stroke submission
- purchases
- account changes

Sensitive actions should require authenticated server-side checks.

---

# 50. Authorization

Authentication answers:

`Who are you?`

Authorization answers:

`Are you allowed to do this?`

Every privileged server action must check authorization independently.

Never hide a button in the UI and assume that constitutes security.

Protected operations include:

- moderator actions
- admin operations
- canvas creation
- canvas closure
- suppression
- credit adjustments
- payment management
- integrity finalization
- role management

---

# 51. Row-Level Security

If using Supabase, use appropriate Row-Level Security policies.

RLS policies must be reviewed carefully.

Never expose privileged service-role credentials to the browser.

Client access should use only public/anon credentials permitted for frontend use.

Privileged database operations should happen in trusted server environments.

---

# 52. Secrets

Secrets belong in secure environment variables or managed secret storage.

Never commit:

- Stripe secret keys
- webhook secrets
- Supabase service-role keys
- private signing keys
- production database credentials
- moderation-provider secrets

Provide `.env.example`.

Never put actual secret values inside example files.

---

# 53. Logs

Logs must be useful but must not expose sensitive information unnecessarily.

Never log:

- full payment credentials
- passwords
- authentication tokens
- session cookies
- service-role keys
- raw secret headers

Redact sensitive fields.

---

# 54. Privacy

Collect the minimum information reasonably necessary.

The drawing system should record the deliberate stroke gesture.

Do not implement hidden general-purpose mouse/session recording.

Do not record unrelated browsing behavior under the guise of drawing functionality.

Design deletion/anonymization pathways without destroying canonical artwork.

---

# 55. Bot and Abuse Protection

The application should be able to defend against:

- automated account creation
- payment abuse
- brute-force authentication
- stroke submission flooding
- report spam
- scraping abuse
- replay attacks
- duplicate payment processing
- authorization reuse

Use appropriate rate limiting and edge protection.

Avoid introducing CAPTCHA into every interaction unnecessarily.

Apply friction where evidence of abuse warrants it.

---

# 56. Public APIs

Do not expose unrestricted mutation APIs.

Every mutating endpoint must:

- authenticate where required
- validate payload
- enforce rate limits where appropriate
- enforce permissions
- protect against replay
- return bounded error detail

Public read APIs should also use sensible pagination and rate limits.

---

# 57. Input Sanitization

Treat all user-generated content as untrusted.

Sanitize:

- profile text
- usernames
- descriptions
- URLs
- canvas titles if user-generated
- reports
- moderator notes shown in UI

Never render arbitrary user HTML.

Never evaluate user JavaScript.

---

# 58. Accessibility

The site should strive for reasonable accessibility.

Requirements include:

- semantic controls
- keyboard-accessible navigation where practical
- accessible forms
- readable contrast
- descriptive labels
- screen-reader-friendly purchase and account flows

The drawing activity itself is inherently visual, but surrounding functions should not unnecessarily exclude assistive technologies.

---

# 59. Responsive Design

Primary experience is browser-based.

Support:

- desktop
- tablet
- modern mobile browsers

Desktop may provide the best drawing experience.

Do not require installation.

Avoid making core account/payment/gallery functions desktop-only.

---

# 60. Browser Support

Support current major browsers reasonably.

Favor standards-based APIs.

Gracefully handle unsupported features.

Do not rely on experimental APIs for essential functionality without fallback.

---

# 61. Testing Philosophy

Testing is mandatory for anything involving:

- money
- credits
- moderation
- canvas completion
- permissions
- concurrency
- authentication
- integrity

Do not consider these features complete without automated tests.

---

# 62. Required Test Layers

Use an appropriate combination of:

## Unit tests

For:

- path validation
- pricing calculations
- ledger calculations
- color normalization
- integrity hashes
- moderation-state logic

## Integration tests

For:

- database transactions
- credits
- stroke submission
- Stripe webhooks
- permissions
- moderation workflows

## End-to-end tests

For:

- account creation
- purchase flow in Stripe test mode
- adding a stroke
- moderation
- public rendering
- canvas closing

---

# 63. Payment Tests

At minimum test:

- successful payment
- failed payment
- duplicate webhook
- webhook retry
- invalid signature
- already-processed event
- charge/refund scenarios as supported
- incorrect client-reported success
- simultaneous purchases

Duplicate webhooks must never double-credit.

---

# 64. Credit Tests

At minimum test:

- insufficient credits
- exact balance
- concurrent spending
- failed stroke submission
- accepted submission
- rejected submission
- courtesy replacement
- administrative adjustment
- ledger reconciliation

---

# 65. Stroke Tests

At minimum test:

- valid stroke
- empty stroke
- zero-length stroke
- excessively long stroke
- too many points
- invalid coordinates
- malformed color
- unsupported width
- expired authorization
- reused authorization
- wrong canvas authorization
- closed canvas
- unauthenticated user

---

# 66. Millionth-Stroke Concurrency Test

This test is mandatory before production launch of the flagship completion system.

Simulate many concurrent candidates attempting to become stroke number 1,000,000.

Expected:

- exactly one receives final valid slot
- zero exceed limit
- no duplicate official sequence
- no lost/incorrect credit debits
- rejected overflow attempts are handled according to configured policy

---

# 67. Moderation Tests

Test:

- automated pass
- automated flag
- moderator approval
- rejection
- suppression
- unsuppression
- report handling
- courtesy credit
- repeated abuse state
- moderator permission boundaries

---

# 68. Authorization Tests

A normal user must never be able to perform moderator/admin operations even if they manually call the underlying endpoint.

Test server-side permission enforcement explicitly.

---

# 69. Code Quality

Prefer:

- TypeScript strict mode
- explicit types
- small focused modules
- meaningful names
- predictable control flow
- reusable domain services
- clear error boundaries

Avoid:

- giant components
- giant service files
- duplicate business logic
- magic numbers
- deeply nested callback logic
- hidden side effects
- `any` without justification
- silent error swallowing

---

# 70. Business Logic Placement

Critical business rules should not live only inside UI components.

Examples:

- stroke cost
- credit consumption
- canvas closure
- sequence assignment
- moderation state

belong in domain/server layers.

UI should call those rules rather than redefine them.

---

# 71. Configuration

Centralize configurable values.

Examples:

```text
stroke duration
allowed brush widths
canvas dimensions
canvas credit cost
Masterpiece maximum
payment bundles
moderation thresholds
rate limits
```

Do not scatter constants throughout the repository.

---

# 72. Error Handling

Errors must:

- be logged appropriately
- avoid leaking secrets
- return understandable user feedback
- preserve transactional integrity

Never catch an exception and silently continue in critical financial or artwork operations.

---

# 73. Observability

Production should eventually expose metrics for:

- submitted strokes
- approved strokes
- rejected strokes
- suppressed strokes
- moderation backlog
- payment success/failure
- webhook failures
- realtime connection count
- API latency
- database latency
- render queue size
- error rate

Do not build an enormous observability platform for MVP, but leave room to instrument important paths.

---

# 74. Backup Requirements

Canonical data must be backed up.

Minimum intended production strategy:

- provider-managed database backup
- independent scheduled PostgreSQL export
- object storage backups/checkpoints
- integrity manifests/checkpoints

Backups must not exist only inside the same failure domain.

---

# 75. Backup Verification

A backup that has never been restored is not proven.

Periodically test restoration into a non-production environment.

Document the restoration procedure.

---

# 76. Disaster Recovery

Document how to recover:

- database
- stroke ledger
- credit ledger
- payment reconciliation
- object storage
- canvas tile state

Raster tiles should be reproducible from canonical vectors.

Loss of generated tiles should not mean loss of artwork.

---

# 77. Rendering Rebuild

It must be possible to reconstruct the public canvas from canonical stroke data.

Provide a renderer or maintenance job capable of regenerating:

- tile pyramid
- snapshots
- final image

Do not make raster artifacts irreplaceable.

---

# 78. Development Workflow

Before implementing a substantial task:

1. inspect relevant existing code
2. inspect migrations/schema
3. identify affected invariants
4. determine appropriate tests
5. implement smallest coherent change
6. run tests
7. fix failures
8. run lint/type checks
9. summarize changes

Do not blindly rewrite unrelated systems.

---

# 79. Agent Behavior

Coding agents should proceed autonomously on normal implementation tasks.

Do not ask unnecessary questions when reasonable defaults are available.

However, stop and request explicit approval before:

- deleting production data
- destructive schema migration
- materially changing pricing
- weakening payment integrity
- weakening authentication
- weakening moderation controls
- exposing private user information
- changing Masterpiece maximum
- introducing real-money resale
- introducing crypto/NFT mechanics
- modifying immutable historical records
- permanently removing backups
- replacing core infrastructure without clear need

---

# 80. Agent Change Scope

When fixing a bug:

- fix the bug
- add/regress tests
- avoid unrelated redesign unless necessary

When refactoring:

- preserve documented behavior
- keep tests green
- state important behavioral changes explicitly

Do not use a small task as justification to rewrite the entire application.

---

# 81. Dependency Policy

Prefer mature, maintained dependencies.

Before adding a dependency, consider:

- whether existing platform APIs suffice
- maintenance activity
- security history
- bundle size
- licensing
- long-term necessity

Avoid installing large libraries for trivial utilities.

---

# 82. Package Management

Use the repository's established package manager consistently.

Do not switch package managers without explicit approval.

Commit lockfiles.

---

# 83. Database Query Performance

Avoid obvious N+1 query behavior.

Use:

- indexes
- pagination
- batching
- spatial lookup strategies
- bounded queries

Never load the entire million-stroke ledger into memory for routine application requests.

---

# 84. Background Jobs

Use background workers for work that should not block user requests, including potentially:

- moderation image rendering
- moderation calls
- tile regeneration
- timelapse generation
- snapshots
- final artwork rendering
- large integrity calculations

Jobs must be retry-safe where appropriate.

Design idempotent jobs whenever possible.

---

# 85. Queue Reliability

Do not assume queues deliver exactly once.

Jobs may retry.

Handlers should tolerate duplicate execution.

Store job identifiers/state where needed.

---

# 86. Canvas Snapshotting

Periodically create snapshots/checkpoints.

Potential uses:

- fast loading
- rollback investigation
- artwork milestones
- archival gallery
- integrity verification

Snapshots are derivative artifacts.

Canonical vectors remain authoritative.

---

# 87. Weekly Canvas Archive

When a recurring canvas closes:

1. reject new authorizations
2. resolve required moderation
3. create final vector state
4. create final raster render
5. generate provenance statistics
6. archive it as read-only
7. make it available in the gallery

The system should preserve the ability to replay archived canvases.

---

# 88. Final Physical Artwork

The physical Million-Stroke artwork must be rendered from canonical vector data.

Never rely on a browser screenshot as the master.

The output pipeline should eventually support arbitrary output resolution appropriate for professional printing.

Physical production is outside the core web application but the software must produce suitable master files.

---

# 89. Contributor Plaque / Ledger

The flagship should eventually support a permanent digital contributor ledger.

Potential information:

- public display name
- number of approved active strokes
- first contribution
- optionally profile link

Do not expose private billing identity.

The contributor list should remain usable even if individual users later anonymize themselves.

---

# 90. Charity/Auction

Do not implement financial charity disbursement logic without explicit requirements.

The platform may publicly communicate approved charity/auction plans, but any charitable fundraising implementation must be deliberately designed and reviewed.

Do not invent donation percentages or legal representations.

---

# 91. Copyright/DMCA Support

The product is user-generated content.

Architecture should support:

- content identification
- reporting
- suppression
- audit history
- designated notices/contact process

Do not promise legal compliance through code alone.

Legal policy implementation should remain separable from moderation infrastructure.

---

# 92. Age Requirements

Initial launch may use an adults-only requirement.

Do not implement children's account flows unless explicitly requested.

If age rules change, treat that as a material product/legal change.

---

# 93. No Real-Money Stroke Resale

Stroke credits:

- have no cash redemption value
- are not investments
- are not securities
- should not have an internal speculative exchange
- should not be withdrawable for money
- should not be transferable unless explicitly added later

Do not implement user-to-user credit trading without explicit approval.

---

# 94. No Blockchain

Do not add:

- cryptocurrency
- NFTs
- tokens
- blockchain ownership

The artwork provenance system should use conventional cryptographic hashes unless explicitly directed otherwise.

---

# 95. MVP Scope

Do not attempt to build the entire long-term platform immediately.

Initial milestones:

## Milestone 1 — Local Drawing Prototype

Implement:

- canvas
- pan
- zoom
- Add Stroke
- lock viewport
- countdown
- pointer capture
- freehand stroke
- color picker
- hex entry
- canvas color sampling
- brush widths

No real payments required.

Goal:

Drawing must feel good.

---

## Milestone 2 — Persistence

Implement:

- account authentication
- PostgreSQL persistence
- stored vector strokes
- reload survival
- authoritative server submission
- basic canvas records

Goal:

Artwork persists reliably.

---

## Milestone 3 — Multiplayer

Implement:

- realtime approved stroke updates
- multiple browser sessions
- reconciliation after connection loss
- basic contributor attribution

Goal:

Two or more users can collaborate.

---

## Milestone 4 — Credits and Payments

Implement:

- credit ledger
- Stripe test mode
- checkout
- verified webhooks
- idempotency
- atomic credit consumption
- stroke authorization

Goal:

Real payment architecture works safely in test mode.

---

## Milestone 5 — Moderation

Implement:

- pending
- approved
- rejected
- suppressed
- automated patch pipeline
- report workflow
- moderator dashboard
- moderation history
- courtesy replacement credits

Goal:

UGC can be safely controlled.

---

## Milestone 6 — Scalable Rendering

Implement:

- raster tile generation
- object storage
- tile pyramid
- spatial lookup
- vector archive
- contributor highlighting
- replay

Goal:

Canvas size no longer depends on browser rendering every vector.

---

## Milestone 7 — Public Product

Implement:

- recurring themed canvas
- archive/gallery
- Million-Stroke Masterpiece
- pricing packages
- profile pages
- contributor statistics
- production deployment
- monitoring/backups

Goal:

Public launch.

---

# 96. Completion Criteria for Any Feature

A feature is not complete merely because UI exists.

A feature is complete when appropriate:

- behavior works
- server validation exists
- permission checks exist
- errors are handled
- tests exist
- type checking passes
- lint passes
- database migration is included
- user-visible edge cases are handled
- documentation is updated

---

# 97. Pull Request / Change Summary Expectations

After completing substantial work, provide:

## What Changed

Short summary.

## Why

Reason for implementation.

## Important Technical Decisions

Notable architecture choices.

## Database Changes

Migrations or schema updates.

## Security/Integrity Considerations

Anything affecting trust boundaries.

## Testing

Tests executed and results.

## Remaining Risks / Follow-ups

Known limitations.

Do not claim something is tested unless it was actually tested.

---

# 98. Commands

Maintain accurate repository commands in the root README/package scripts.

Expected categories:

```text
dev
build
lint
typecheck
test
test:integration
test:e2e
db:migrate
```

Exact command names may vary.

If commands change, update documentation.

---

# 99. Documentation

Keep documentation current for:

- local setup
- required environment variables
- database setup
- migrations
- Stripe test setup
- moderation workflow
- deployment
- backups
- recovery
- finalization procedures

Do not rely on undocumented tribal knowledge.

---

# 100. Final Engineering Principle

When choosing between:

```text
clever
```

and:

```text
simple, auditable, deterministic
```

prefer the latter for:

- money
- credits
- artwork history
- moderation
- authorization
- completion counts
- provenance

The success of this project depends on users trusting that:

- their money is accounted for
- their credits are real
- their stroke is actually theirs
- the artwork has not been secretly manipulated
- the million-stroke limit means exactly one million
- moderation actions are traceable
- the final physical piece accurately represents the digital artwork

Protect that trust above architectural cleverness.

---

# 101. North-Star Product Statement

Before adding any major feature, ask:

> Does this make it more enjoyable, trustworthy, or meaningful for people to collaboratively create permanent artwork one stroke at a time?

If not, it probably does not belong in the core product.

---

# 102. Product Promise

The intended public concept is fundamentally:

> **Draw with the Internet.**
>
> Every contribution is one deliberate stroke.
>
> Community canvases become permanent collaborative artworks.
>
> And together, contributors are creating a one-million-stroke masterpiece.

Engineering decisions should preserve the simplicity of that promise.