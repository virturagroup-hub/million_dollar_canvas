import { expect, type Browser } from "@playwright/test";
export const hostedCredentials = !!(
  process.env.E2E_EMAIL &&
  process.env.E2E_PASSWORD &&
  process.env.E2E_MODERATOR_EMAIL &&
  process.env.E2E_MODERATOR_PASSWORD
);
// Explicit opt-in helper: approve only the exact ID submitted by this test.
export async function approveTestStroke(browser: Browser, id: string) {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.E2E_MODERATOR_EMAIL!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.E2E_MODERATOR_PASSWORD!);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const response = await context.request.post("/api/moderation", {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        operation: "transition",
        id,
        expected: "pending",
        state: "approved",
        category: "acceptable",
        note: "Explicit hosted development acceptance test",
      },
    });
    expect(response.status()).toBe(200);
  } finally {
    await context.close();
  }
}
