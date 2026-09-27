import { test, expect, type Page } from "@playwright/test";
import { mockArtwork } from "./fixtures/artwork";
const surface = (page: Page) =>
  page.getByLabel("Drawing canvas", { exact: true });
async function dot(page: Page) {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Brush width").selectOption("12");
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await expect(surface(page)).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
  const b = (await surface(page).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
test("sidebar has deliberate spacing at desktop and narrow widths", async ({
  page,
  context,
}) => {
  await mockArtwork(context);
  await page.goto("/canvas/open-studio");
  for (const width of [1280, 850, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const button = page.getByRole("button", {
      name: "+ Add Stroke",
      exact: true,
    });
    await expect(button).toBeEnabled();
    const b = (await button.boundingBox())!;
    const field = (await page
      .getByRole("group", { name: "MAKE IT YOURS" })
      .boundingBox())!;
    expect(field.y - (b.y + b.height)).toBeGreaterThanOrEqual(24);
    expect(field.y - (b.y + b.height)).toBeLessThanOrEqual(34);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("loupe shows real neighboring pixels, selects exact color, cancels and cleans up", async ({
  page,
  context,
}) => {
  await mockArtwork(context);
  await page.goto("/canvas/open-studio");
  await dot(page);
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Stroke color", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.getByRole("button", { name: "Pick Color From Canvas" }).click();
  let b = (await surface(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  const loupe = page.getByTestId("color-loupe");
  await expect(loupe).toBeVisible();
  await expect(loupe.locator("output")).toHaveText("#235C4B");
  expect(
    await loupe.evaluate((node) => getComputedStyle(node).pointerEvents),
  ).toBe("none");
  const colors = await loupe
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => {
      const data = node.getContext("2d")!.getImageData(0, 0, 120, 120).data;
      const colors = new Set<string>();
      for (let i = 0; i < data.length; i += 4)
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colors.size;
    });
  expect(colors).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await expect(loupe).toHaveCount(0);
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#123456",
  );
  await expect(surface(page)).toHaveAttribute("data-phase", "preparing");
  await page.getByRole("button", { name: "Pick Color From Canvas" }).click();
  b = (await surface(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(loupe).toBeVisible();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#235C4B",
  );
  await expect(loupe).toHaveCount(0);
  await page.getByRole("button", { name: "Pick Color From Canvas" }).click();
  await page.mouse.move(b.x + b.width - 10, b.y + b.height - 10);
  await expect(loupe).toBeVisible();
  const l = (await loupe.boundingBox())!;
  expect(l.x + l.width).toBeLessThanOrEqual(1100);
  expect(l.y + l.height).toBeLessThanOrEqual(1000);
  await page.mouse.click(b.x + b.width - 10, b.y + b.height - 10);
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#FFFFFF",
  );
  await expect(page.getByLabel("Use #FFFFFF")).toBeVisible();
  await page.getByRole("button", { name: "Pick Color From Canvas" }).click();
  await page.mouse.move(b.x + 30, b.y + 30);
  await page
    .getByRole("button", { name: "Cancel color picking", exact: true })
    .click();
  await expect(loupe).toHaveCount(0);
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#FFFFFF",
  );
  await page.screenshot({
    path: "output/playwright/milestone-2-studio.png",
    fullPage: true,
  });
});
test("public viewing, sign-in return to drawing, and sign-out", async ({
  page,
  context,
}) => {
  await mockArtwork(context, { signedIn: false });
  await page.goto("/canvas/open-studio");
  await expect(surface(page)).toBeVisible();
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(surface(page)).toHaveAttribute("data-phase", "preparing");
  await expect(page.getByText("Signed in as Test Artist")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Signed in as Test Artist")).toHaveCount(0);
  await expect(surface(page)).toBeVisible();
});
test("unconfirmed saves never appear official; retry uses the same candidate", async ({
  page,
  context,
}) => {
  const options = { rejectSave: true };
  await mockArtwork(context, options);
  await page.goto("/canvas/open-studio");
  await dot(page);
  await expect(page.locator(".error[role=alert]")).toHaveText(
    "Save failed for test.",
  );
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "0 approved strokes",
  );
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toBeDisabled();
  options.rejectSave = false;
  await page.getByRole("button", { name: "Retry same stroke" }).click();
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await expect(surface(page)).toHaveAttribute("data-phase", "completed");
  await page.reload();
  await expect(page.getByTestId("stroke-count")).toHaveText(
    "1 approved stroke",
  );
  await page.getByText("Recent contributors").click();
  await expect(page.locator(".attribution")).toContainText("Test Artist");
});
test("configuration/load failures stay explicit and do not imply an empty loaded canvas", async ({
  page,
  context,
}) => {
  await mockArtwork(context);
  await context.route("**/api/canvases/open-studio?*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error:
          "Persistence is not configured. Follow the Supabase setup in README.",
      },
    }),
  );
  await page.goto("/canvas/open-studio");
  await expect(
    page.getByText("Persistence is not configured.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "It starts with one stroke." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry artwork" }),
  ).toBeVisible();
});
