import { test, expect, type Page } from "@playwright/test";
import { mockArtwork } from "./fixtures/artwork";

const success = "Email confirmed. You can sign in and add your first stroke.";
const failure = "That confirmation link could not be verified. Try signing in or request a fresh confirmation email.";

async function signIn(page: Page) {
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Signed in as Test Artist")).toBeVisible();
}

for (const [query, message] of [["confirmed=1", success], ["auth_error=confirmation&confirmed=1", failure]]) {
  test(`${query} is consumed once without losing other URL state`, async ({ page, context }) => {
    await mockArtwork(context, { signedIn: false });
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents.push(request.url());
    });
    await page.goto(`/?${query}&view=detail&tag=one&tag=two#canvas`);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/\?view=detail&tag=one&tag=two#canvas$/);
    expect(documents).toHaveLength(1);
    await expect(page.getByText(message, { exact: true })).toHaveCount(0, { timeout: 9000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    await page.goto("/?view=other");
    await page.goBack();
    await expect(page).toHaveURL(/\/\?view=detail&tag=one&tag=two#canvas$/);
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
  });
}

test("sign-in dismisses confirmation before timeout and it stays dismissed across auth changes", async ({ page, context }) => {
  await mockArtwork(context, { signedIn: false });
  await page.clock.install();
  await page.goto("/?confirmed=1");
  await expect(page.getByText(success, { exact: true })).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await signIn(page);
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  await signIn(page);
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Signed in as Test Artist")).toBeVisible();
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
});
