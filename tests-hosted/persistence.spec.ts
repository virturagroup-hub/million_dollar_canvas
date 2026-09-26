import { test, expect } from "@playwright/test";
// Explicit opt-in against a configured running app and an already confirmed test
// account. This leaves one canonical stroke; never run against production artwork.
test("confirmed Supabase user saves a stroke that survives reload", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    "Provide credentials for a confirmed test account in a disposable development project.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add Stroke", exact: true }),
  ).toBeEnabled();
  const before = parseInt(await page.getByTestId("stroke-count").innerText());
  await page.getByRole("button", { name: "+ Add Stroke", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock View & Prepare Stroke" })
    .click();
  const canvas = page.getByLabel("Drawing canvas", { exact: true });
  await expect(canvas).toHaveAttribute("data-phase", "armed", {
    timeout: 6000,
  });
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("stroke-count")).toHaveText(
    `${before + 1} saved ${before === 0 ? "stroke" : "strokes"}`,
  );
  await page.reload();
  await expect(page.getByTestId("stroke-count")).toHaveText(
    `${before + 1} saved ${before === 0 ? "stroke" : "strokes"}`,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
