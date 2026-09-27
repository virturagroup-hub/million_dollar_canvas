import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { realtimeFixture } from "./fixtures/realtime";
import { testCanvas } from "./fixtures/artwork";
import { moderationPatch } from "../src/server/moderationPatch";
import type { Candidate } from "../src/domain/canvas";
import type { ModerationState, ReviewDetail } from "../src/domain/moderation";
import { bounds } from "../src/drawing/model";
async function draw(page: Page) {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  const surface = page.getByLabel("Drawing canvas", { exact: true });
  await expect(surface).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
  const box = (await surface.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByText("Stroke submitted for review.", { exact: true }),
  ).toBeVisible();
}
function moderationFixture() {
  const live = realtimeFixture();
  const entries = new Map<
    string,
    {
      candidate: Candidate;
      status: ModerationState;
      history: ReviewDetail["history"];
      reports: ReviewDetail["reports"];
    }
  >();
  return {
    live,
    entries,
    async attach(
      context: BrowserContext,
      role: "anonymous" | "user" | "moderator",
    ) {
      await live.attach(context, role !== "anonymous");
      if (role === "moderator")
        await context.route("**/api/auth", (r) =>
          r.fulfill({
            json: {
              configured: true,
              user: {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                displayName: "Reviewer",
                role: "moderator",
              },
            },
          }),
        );
      await context.route("**/api/canvases/*/strokes", async (route) => {
        const candidate = route.request().postDataJSON() as Candidate;
        entries.set(candidate.requestId, {
          candidate,
          status: "pending",
          history: [],
          reports: [],
        });
        await route.fulfill({
          status: 201,
          json: { stroke: { id: candidate.requestId, status: "pending" } },
        });
      });
      await context.route("**/api/reports", async (route) => {
        const body = route.request().postDataJSON();
        entries.get(body.id)!.reports.push({
          id: crypto.randomUUID(),
          category: body.category,
          description: body.description,
          status: "open",
          created_at: new Date().toISOString(),
        });
        await route.fulfill({ status: 201, json: { id: "report" } });
      });
      await context.route("**/api/moderation**", async (route) => {
        if (role !== "moderator") {
          await route.fulfill({
            status: role === "anonymous" ? 401 : 403,
            json: {
              error:
                role === "anonymous"
                  ? "Sign in to continue."
                  : "Moderator access required.",
            },
          });
          return;
        }
        const url = new URL(route.request().url()),
          id = url.searchParams.get("id");
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON(),
            entry = entries.get(body.id);
          if (body.operation === "resolve") {
            for (const e of entries.values())
              for (const report of e.reports)
                if (report.id === body.id) report.status = "reviewed";
          } else if (entry) {
            entry.history.push({
              id: crypto.randomUUID(),
              previous_state: entry.status,
              new_state: body.state,
              category: body.category,
              note: body.note,
              created_at: new Date().toISOString(),
            });
            entry.status = body.state;
            if (body.state === "approved") {
              live.add(entry.candidate);
              live.notify();
            } else if (body.state === "suppressed") live.suppress(body.id);
          }
          await route.fulfill({ json: { ok: true } });
          return;
        }
        if (!id) {
          const filter = url.searchParams.get("filter") ?? "pending";
          await route.fulfill({
            json: [...entries]
              .filter(([, e]) =>
                filter === "reported"
                  ? e.reports.some((r) => r.status === "open")
                  : e.status === filter,
              )
              .map(([id, e]) => ({
                id,
                status: e.status,
                display_name: "Test Artist",
                canvas_title: "Open Studio",
                report_count: e.reports.filter((r) => r.status === "open")
                  .length,
                created_at: new Date().toISOString(),
              })),
          });
          return;
        }
        const entry = entries.get(id)!,
          box = bounds(entry.candidate.points, entry.candidate.width);
        const detail: ReviewDetail = {
          stroke: {
            id,
            ordinal: 1,
            ...entry.candidate,
            canvas_id: testCanvas.id,
            min_x: box.minX,
            min_y: box.minY,
            max_x: box.maxX,
            max_y: box.maxY,
            created_at: new Date().toISOString(),
          },
          status: entry.status,
          context: [],
          history: entry.history,
          reports: entry.reports,
          displayName: "Test Artist",
          canvasTitle: "Open Studio",
        };
        await route.fulfill(
          url.searchParams.get("patch") === "1"
            ? { contentType: "image/svg+xml", body: moderationPatch(detail) }
            : { json: detail },
        );
      });
    },
  };
}
test("pending is private; moderator approval and suppression reach anonymous viewers; reports do not remove artwork", async ({
  page,
  context,
  browser,
}) => {
  const fixture = moderationFixture(),
    anonymous = await browser.newContext(),
    moderator = await browser.newContext();
  await fixture.attach(context, "user");
  await fixture.attach(anonymous, "anonymous");
  await fixture.attach(moderator, "moderator");
  const viewer = await anonymous.newPage(),
    reviewer = await moderator.newPage();
  await page.goto("/canvas/open-studio");
  await viewer.goto("/canvas/open-studio");
  await expect(viewer.getByTestId("live-status")).toHaveText("Live");
  const pixels = () =>
    viewer
      .getByLabel("Drawing canvas", { exact: true })
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const blank = await pixels();
  await draw(page);
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "0 approved strokes",
  );
  expect(await pixels()).toBe(blank);
  await page.reload();
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "0 approved strokes",
  );
  await reviewer.goto("/");
  await reviewer.getByRole("link", { name: "Moderation", exact: true }).click();
  await reviewer
    .getByRole("button", { name: /Test Artist · Open Studio/ })
    .click();
  const patch = reviewer.getByRole("img", {
    name: "Candidate stroke with surrounding approved artwork",
  });
  await expect(patch).toBeVisible();
  await expect
    .poll(() => patch.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBe(1024);
  await reviewer.getByLabel("Internal note").fill("Reviewed in context");
  await reviewer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await expect.poll(pixels).not.toBe(blank);
  await page.getByText("Inspect / report artwork", { exact: true }).click();
  await page
    .getByLabel("Loaded stroke")
    .selectOption([...fixture.entries.keys()][0]);
  await page.getByLabel("Optional context").fill("Please check this mark");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Report received for review.")).toBeVisible();
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await reviewer.getByLabel("Queue", { exact: true }).selectOption("reported");
  await reviewer
    .getByRole("button", { name: /Test Artist · Open Studio/ })
    .click();
  await expect(reviewer.getByText(/Please check this mark/)).toBeVisible();
  await reviewer.getByRole("button", { name: "Suppress", exact: true }).click();
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "0 approved strokes",
  );
  await expect.poll(pixels).toBe(blank);
  await reviewer
    .getByRole("button", { name: "Unsuppress", exact: true })
    .click();
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await reviewer.getByRole("button", { name: "Mark report reviewed" }).click();
  await reviewer.screenshot({
    path: "output/playwright/moderation-dashboard.png",
    fullPage: true,
  });
  await reviewer.setViewportSize({ width: 390, height: 844 });
  await reviewer.screenshot({
    path: "output/playwright/moderation-mobile.png",
    fullPage: true,
  });
  expect(
    await reviewer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await anonymous.close();
  await moderator.close();
});
test("rejection never reaches public artwork and ordinary/anonymous users cannot load reviews", async ({
  page,
  context,
  browser,
}) => {
  const fixture = moderationFixture(),
    mod = await browser.newContext(),
    anon = await browser.newContext();
  await fixture.attach(context, "user");
  await fixture.attach(mod, "moderator");
  await fixture.attach(anon, "anonymous");
  const reviewer = await mod.newPage(),
    viewer = await anon.newPage();
  await page.goto("/canvas/open-studio");
  await draw(page);
  await reviewer.goto("/moderation");
  await reviewer
    .getByRole("button", { name: /Test Artist · Open Studio/ })
    .click();
  await reviewer.getByLabel("Internal reason").selectOption("other");
  await reviewer.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    reviewer.getByText("pending → rejected", { exact: false }),
  ).toBeVisible();
  await page.goto("/moderation");
  await expect(page.locator("p[role=alert]")).toHaveText(
    "Moderator access required.",
  );
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await viewer.goto("/moderation");
  await expect(viewer.locator("p[role=alert]")).toHaveText(
    "Sign in to continue.",
  );
  await viewer.goto("/canvas/open-studio");
  await expect(viewer.getByTestId("stroke-count")).toHaveText(
    "0 approved strokes",
  );
  expect([...fixture.entries.values()][0].status).toBe("rejected");
  await mod.close();
  await anon.close();
});
