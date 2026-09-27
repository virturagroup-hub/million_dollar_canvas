import { test, expect } from "@playwright/test";
import { realtimeFixture } from "./fixtures/realtime";
import { testCanvas } from "./fixtures/artwork";
import type { CanvasRecord } from "../src/domain/canvas";
const flagship: CanvasRecord = {
  ...testCanvas,
  id: "22222222-2222-4222-8222-222222222222",
  slug: "shared-masterpiece",
  title: "Million Dollar Canvas",
  description: "One million strokes. One permanent artwork.",
  canvas_type: "flagship",
  stroke_limit: 1000000,
  display_order: -100,
};
test("directory pagination keeps subscriptions bounded and tears down old previews", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  fixture.register(flagship);
  for (let i = 0; i < 5; i++)
    fixture.register({
      ...testCanvas,
      id: `40000000-0000-4000-8000-00000000000${i}`,
      slug: `community-${i}`,
      title: `Community ${i}`,
    });
  await fixture.attach(context, false);
  await page.goto("/");
  await expect.poll(() => fixture.connections).toBe(5);
  await page.getByRole("button", { name: "More canvases" }).click();
  await expect(
    page.getByRole("heading", { name: "Community 4", exact: true }),
  ).toBeVisible();
  await expect.poll(() => fixture.connections).toBe(3);
  await page.getByRole("button", { name: "Previous canvases" }).click();
  await expect.poll(() => fixture.connections).toBe(5);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Archive", exact: true })
    .click();
  await expect.poll(() => fixture.connections).toBe(0);
});

test("public homepage resolves flagship and current canvases from records, then navigates to a specific Studio", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  fixture.register(flagship);
  fixture.register({
    ...testCanvas,
    title: "After the Rain",
    description: "A place for small beginnings.",
  });
  fixture.add(undefined, flagship.id);
  fixture.add();
  await fixture.attach(context, false);
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "One million strokes. One permanent artwork.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "After the Rain" }),
  ).toBeVisible();
  await expect(page.getByTestId(`total-${flagship.slug}`)).toHaveText(
    "1 approved stroke",
  );
  await expect(
    page.getByRole("progressbar", { name: `${flagship.title} progress` }),
  ).toHaveAttribute("max", "1000000");
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/MILESTONE|prototype|Stored as vectors/i),
  ).toHaveCount(0);
  await expect(page.getByTestId(`live-${flagship.slug}`)).toHaveText("Live");
  expect(fixture.connections).toBe(2);
  await page
    .locator(`[data-canvas="${flagship.slug}"]`)
    .getByRole("link", { name: "Enter Canvas" })
    .click();
  await expect(page).toHaveURL(`/canvas/${flagship.slug}`);
  await expect(
    page.getByRole("heading", { name: flagship.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Drawing canvas", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("live read-only previews preserve canvas isolation and responsive aspect ratio", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  fixture.register(flagship);
  await fixture.attach(context, false);
  await page.goto("/");
  await expect(page.getByTestId(`live-${flagship.slug}`)).toHaveText("Live");
  await expect(page.getByTestId("live-open-studio")).toHaveText("Live");
  const a = page.getByLabel(`${flagship.title} artwork preview`);
  const b = page.getByLabel("Open Studio artwork preview");
  const beforeA = await a.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const beforeB = await b.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  fixture.add(undefined, flagship.id);
  fixture.notify(flagship.id);
  await expect(page.getByTestId(`total-${flagship.slug}`)).toHaveText(
    "1 approved stroke",
  );
  await expect
    .poll(() => a.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(beforeA);
  expect(await b.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    beforeB,
  );
  await expect(page.getByTestId("total-open-studio")).toHaveText(
    "0 approved strokes",
  );
  for (const width of [1280, 850, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const box = (await a.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(4 / 3, 2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "output/playwright/gallery-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({
    path: "output/playwright/gallery-desktop.png",
    fullPage: true,
  });
});
test("direct routes resolve independently, invalid slugs are unavailable, and archive navigation has an honest empty state", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  fixture.register(flagship);
  await fixture.attach(context);
  await page.goto(`/canvas/${flagship.slug}`);
  await expect(
    page.getByRole("heading", { name: flagship.title, exact: true }),
  ).toBeVisible();
  await page.goto("/canvas/not-a-canvas");
  await expect(
    page.getByText("Canvas not found.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Archive", exact: true })
    .click();
  await expect(page).toHaveURL("/archive");
  await expect(
    page.getByRole("heading", { name: "The story is still being drawn." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current Canvases" }),
  ).toBeVisible();
});
test("archived special artworks are listed without live subscriptions or drawing availability", async ({
  context,
  page,
}) => {
  const fixture = realtimeFixture();
  const archived = {
    ...testCanvas,
    id: "33333333-3333-4333-8333-333333333333",
    slug: "an-evening",
    title: "An Evening Together",
    canvas_type: "special" as const,
    status: "archived" as const,
  };
  fixture.register(archived);
  await fixture.attach(context, false);
  await page.goto("/archive");
  await expect(
    page.getByRole("heading", { name: archived.title }),
  ).toBeVisible();
  expect(fixture.connections).toBe(0);
  await page.getByRole("link", { name: "View artwork" }).click();
  await expect(
    page.getByRole("heading", { name: archived.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toBeDisabled();
});
