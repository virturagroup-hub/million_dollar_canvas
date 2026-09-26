# Million Dollar Canvas

Draw with the Internet, one deliberate stroke at a time. The long-term project supports shared community artwork and a million-stroke masterpiece.

**Current scope: Milestone 1 — local drawing prototype.** All artwork is held in browser memory and resets on refresh. There are no payments, accounts, backend persistence, moderation, or multiplayer features.

## Run locally

Requirements: Node.js 22.14+ and npm. No credentials or environment variables are needed; `.env.example` documents this.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For the production build, use `npm run build` followed by `npm start`.

## Make a stroke

1. Select **Add Stroke**.
2. Drag to position the artwork; scroll or use the zoom buttons. Arrow keys pan when the canvas has keyboard focus. The minimap and logical center coordinates show your location; **Reset view** returns to the center.
3. Choose a color with the visual picker, six-digit hex input, recent colors, or **Pick Color From Canvas**. Choose Thin, Medium, or Thick.
4. Select **Lock View & Prepare Stroke**. Navigation pauses for the 3 → 2 → 1 countdown.
5. When **DRAW / ARMED** appears, press, move, and release to create exactly one stroke. A deliberate tap creates a dot. Another stroke requires another Add Stroke action.

Cancel before pointer-down using the button, or Escape while the canvas has focus. Pointer cancellation, loss of pointer capture, window focus loss, leaving the logical artwork, and constraint violations discard the unfinished stroke with feedback. Moving outside the canvas element still works through pointer capture while the gesture remains inside the logical artwork.

## Commands and verification

```sh
npm test                 # domain/state/coordinate/constraint tests
npm run typecheck        # strict TypeScript
npm run lint             # ESLint + Next.js/React rules
npm run build            # optimized Next.js build
npx playwright install chromium
npm run test:e2e         # browser workflow, high-DPI rendering, touch and error paths
```

The browser suite starts a local development server automatically, or uses an existing server on port 3000. It can also run against `npm start` on that port. Unit tests use Vitest 4 and Vite 7, which work with the documented Node version. Commit and install the npm lockfile for reproducibility.

## Technical decisions

- Next.js 16 App Router, React 19, strict TypeScript, native HTML Canvas and Pointer Events. No canvas framework or backend SDK.
- A 4,000 × 3,000 logical coordinate system remains independent from CSS pixels, viewport transforms, and device pixel ratio. Raster pixels are only a view of the vector data.
- `src/drawing/model.ts` defines the explicit workflow transitions, coordinate math, stroke shape, validation, and central constraints. Limits: 15 seconds, 3,000 points, 12,000 logical units of path length; widths: 2, 6, 12.
- `src/drawing/useStudio.ts` owns the local interaction lifecycle, pointer ownership, cancellation, timers, and vector history. Synchronous refs guard against duplicate pointer events before React rerenders.
- `src/drawing/renderer.ts` redraws vectors at the current viewport and device pixel ratio. Each completed stroke retains its ID, points, normalized color, width, timestamp, duration, and brush-inclusive bounding box.
- UI controls and page layout live in `src/components`. View navigation records no artwork; only an explicitly armed pointer gesture records stroke geometry.

## Limitations

- Refreshing or navigating away erases the artwork and recent colors. There is no undo, export, or trusted server validation. Client constraints are prototype safeguards, not security boundaries.
- Sampling reads the rendered canvas pixel; anti-aliased edges may yield a blended color. Empty artwork samples white. It never requests system-wide screen access.
- Touch supports one-finger pan and single-pointer strokes; use buttons for zoom. Pinch zoom and pen pressure are intentionally not implemented. Touch scrolling is disabled only over the drawing surface.
- All local vectors are redrawn; this is not the million-stroke rendering architecture. The browser tests use Chromium with touch emulation; physical stylus and other browser engines need later verification.
- A brush centered at the artwork boundary is clipped by that boundary. There is no automatic path simplification; sub-0.75-unit moves are not sampled.

## Roadmap

The full engineering constitution is preserved in [AGENTS.md](AGENTS.md), including Milestones 1–7 in section 95. Next.js also appends its generated version-specific documentation guidance there. Later work progresses through persistence, multiplayer, credits/payments, moderation, scalable rendering, and public launch. None of those later milestones is implemented here.
