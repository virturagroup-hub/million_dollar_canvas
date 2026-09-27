import { test, expect } from "@playwright/test";

test("hosted Supabase sends a saved stroke to an independent anonymous viewer", async ({
  browser,
  page,
}) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    "Requires both migrations and a confirmed development account; leaves one permanent test dot.",
  );
  const other = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
  });
  try {
    const viewer = await other.newPage();
    let notifications = 0;
    viewer.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        const text = String(payload);
        if (
          text.includes('"postgres_changes"') &&
          text.includes('"canvas_updates"') &&
          text.includes('"UPDATE"')
        )
          notifications++;
      }),
    );
    await Promise.all([page.goto("/"), viewer.goto("/")]);
    await expect(viewer.getByTestId("live-status")).toHaveText("Live", {
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.E2E_EMAIL!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.E2E_PASSWORD!);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const before = parseInt(
      await viewer.getByTestId("stroke-count").innerText(),
    );
    const beforeNotifications = notifications;
    await page
      .getByRole("button", { name: "+ Add Stroke", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Lock View & Prepare Stroke" })
      .click();
    const canvas = page.getByLabel("Drawing canvas", { exact: true });
    await expect(canvas).toHaveAttribute("data-phase", "armed", {
      timeout: 6000,
    });
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => notifications, { timeout: 10000 })
      .toBeGreaterThan(beforeNotifications);
    const count = `${before + 1} saved ${before === 0 ? "stroke" : "strokes"}`;
    await expect(viewer.getByTestId("stroke-count")).toHaveText(count, {
      timeout: 10000,
    });
    await Promise.all([page.reload(), viewer.reload()]);
    await expect(page.getByTestId("stroke-count")).toHaveText(count);
    await expect(viewer.getByTestId("stroke-count")).toHaveText(count);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  } finally {
    await other.close();
  }
});
