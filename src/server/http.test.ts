import { it, expect } from "vitest";
import { checkOrigin, readJson } from "./http";
it("bounds streamed payloads even without Content-Length", async () => {
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(100) }),
      }),
      20,
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it("rejects cross-origin writes and malformed JSON", async () => {
  expect(() =>
    checkOrigin(
      new Request("http://localhost", {
        headers: { Origin: "https://evil.example" },
      }),
    ),
  ).toThrow();
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
