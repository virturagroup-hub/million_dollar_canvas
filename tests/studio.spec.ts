import { expect, test, type Page } from "@playwright/test";
async function arm(page: Page) {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
}
async function line(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 40,
    { steps: 12 },
  );
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("duration limit and actual pointer capture loss discard unfinished strokes", async ({
  page,
}) => {
  await page.clock.install();
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await page.clock.runFor(3100);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(15100);
  await page.mouse.up();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "15-second limit",
  );
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await page.clock.runFor(3100);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2);
  await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.releasePointerCapture(1));
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "capture lost",
  );
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
});
test("one deliberate gesture, locked navigation, color sampling, and reload reset", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Stroke color", { exact: true }).fill("ab1234");
  await page.getByLabel("Stroke color", { exact: true }).blur();
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#AB1234",
  );
  await page.getByLabel("Brush width").selectOption("12");
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
  await line(page);
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
  await expect(page.locator("canvas")).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
  await line(page);
  await expect(page.getByTestId("stroke-count")).toHaveText("1 local stroke");
  await line(page);
  await expect(page.getByTestId("stroke-count")).toHaveText("1 local stroke");
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Use #AB1234").click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.getByRole("button", { name: "Pick Color From Canvas" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  // Reset restores the original center without changing stroke geometry.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByLabel("Stroke color", { exact: true })).toHaveValue(
    "#AB1234",
  );
  await page.reload();
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
});
test("cancellation, invalid color, and lost pointer never save a stroke", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page.getByLabel("Stroke color", { exact: true }).fill("nope");
  await expect(
    page.getByLabel("Stroke color", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  await page.getByRole("button", { name: "Cancel stroke" }).click();
  await page.waitForTimeout(3200);
  await line(page);
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
  await arm(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.locator("canvas").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "No stroke was saved",
  );
  await expect(page.getByTestId("stroke-count")).toHaveText("0 local strokes");
});
test("artwork stays aligned after zoom, pan, resize and high-DPI redraw", async ({
  page,
}) => {
  await arm(page);
  await line(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.getByRole("button", { name: "Reset view" }).click();
  const readPixel = () =>
    page.locator("canvas").evaluate((node: HTMLCanvasElement) => {
      const rect = node.getBoundingClientRect();
      const pixel = node
        .getContext("2d")!
        .getImageData(
          Math.round(node.width / 2),
          Math.round(node.height / 2),
          1,
          1,
        ).data;
      return {
        ratio: node.width / rect.width,
        rgb: Array.from(pixel.slice(0, 3)),
      };
    });
  await expect.poll(async () => (await readPixel()).rgb).toEqual([35, 92, 75]);
  expect((await readPixel()).ratio).toBeCloseTo(2);
  await expect(page.getByTestId("stroke-count")).toHaveText("1 local stroke");
});
test("mobile controls fit and a touch gesture saves one stroke", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await arm(page);
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("stroke-count")).toHaveText("1 local stroke");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
