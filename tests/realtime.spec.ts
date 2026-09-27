import { test, expect, type Page } from "@playwright/test";
import { realtimeFixture } from "./fixtures/realtime";
const surface = (page: Page) =>
  page.getByLabel("Drawing canvas", { exact: true });
async function arm(page: Page) {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Brush width").selectOption("12");
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await expect(surface(page)).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
  return (await surface(page).boundingBox())!;
}
async function pixels(page: Page) {
  return surface(page).evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
}
test("subscription repairs the initial load gap and a delayed save cannot resurrect a removed stroke", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  await fixture.attach(context);
  fixture.onNextJoin(() => fixture.add()); // Commit after HTTP baseline, before subscription acknowledgement.
  await page.goto("/");
  await expect(page.getByTestId("live-status")).toHaveText("Live");
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  const box = await arm(page);
  fixture.holdSaves(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("stroke-count")).toHaveText("2 saved strokes");
  fixture.suppress(fixture.strokes[1].id);
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  fixture.holdSaves(false);
  await expect(surface(page)).toHaveAttribute("data-phase", "completed");
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke");
});
test("two independent contexts and a second tab receive canonical geometry; originator never duplicates", async ({
  browser,
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  const other = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1280, height: 720 },
  });
  await fixture.attach(context);
  await fixture.attach(other, false);
  const viewer = await other.newPage();
  const tab = await other.newPage();
  await Promise.all([page.goto("/"), viewer.goto("/"), tab.goto("/")]);
  for (const p of [page, viewer, tab])
    await expect(p.getByTestId("live-status")).toHaveText("Live");
  expect(fixture.connections).toBe(3);
  const box = await arm(page);
  fixture.holdSaves(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(surface(page)).toHaveAttribute("data-phase", "submitting");
  for (const p of [page, viewer, tab])
    await expect(p.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  fixture.holdSaves(false);
  await expect(surface(page)).toHaveAttribute("data-phase", "completed");
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  await viewer.getByText("Recent contributors").click();
  await expect(viewer.locator(".attribution")).toContainText("Test Artist");
  await expect.poll(() => pixels(viewer)).toBe(await pixels(page));
  await Promise.all([page.reload(), viewer.reload()]);
  for (const p of [page, viewer])
    await expect(p.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  await expect.poll(() => pixels(viewer)).toBe(await pixels(page));
  await other.close();
  await expect.poll(() => fixture.connections).toBe(1);
});
test("reconnect, missed events, scoping, burst batching and suppression reconcile without reload", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  await fixture.attach(context, false);
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("live-status")).toHaveText("Live");
  fixture.disconnect(context);
  await expect(page.getByTestId("live-status")).toHaveText("Reconnecting");
  fixture.add(); // No notification: the next successful join must repair the gap.
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke", {
    timeout: 12000,
  });
  await expect(page.getByTestId("live-status")).toHaveText("Live");
  const before = fixture.reads;
  fixture.notify("other-canvas");
  await page.waitForTimeout(250);
  expect(fixture.reads).toBe(before);
  for (let i = 0; i < 120; i++) {
    fixture.add();
    fixture.notify();
    fixture.notify();
  }
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "121 saved strokes",
  );
  expect(fixture.reads - before).toBeLessThanOrEqual(4);
  fixture.suppress(fixture.strokes[0].id);
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "120 saved strokes",
  );
  fixture.failReads(true);
  fixture.notify();
  await expect(page.getByTestId("live-status")).toHaveText("Reconnecting");
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "120 saved strokes",
  );
  fixture.failReads(false);
  await expect(page.getByTestId("live-status")).toHaveText("Live", {
    timeout: 6000,
  });
  fixture.add(); // Even if every notification is lost, periodic reads converge.
  await page.clock.fastForward(31000);
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "121 saved strokes",
  );
});
test("remote updates retain the locked viewport and in-progress local gesture", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  await fixture.attach(context);
  await page.goto("/");
  await expect(page.getByTestId("live-status")).toHaveText("Live");
  const box = await arm(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
  fixture.add();
  fixture.notify();
  await expect(page.getByTestId("stroke-count")).toHaveText("1 saved stroke");
  await expect(surface(page)).toHaveAttribute("data-phase", "drawing");
  await page.mouse.wheel(0, -400);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page.getByTestId("stroke-count")).toHaveText("2 saved strokes");
  const local = fixture.strokes[1];
  expect(local.points.length).toBeGreaterThanOrEqual(3);
  expect(local.points[0].x).toBeCloseTo(2000, 1);
  expect(local.points.at(-1)!.y).toBeCloseTo(local.points[0].y, 1);
  expect(local.points.at(-1)!.x - local.points[0].x).toBeGreaterThan(40);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  // Browser's real online property is authoritative for Offline.
  await context.setOffline(true);
  await expect(page.getByTestId("live-status")).toHaveText("Offline");
  await context.setOffline(false);
});
