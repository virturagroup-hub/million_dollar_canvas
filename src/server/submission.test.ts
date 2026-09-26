import { describe, it, expect, vi } from "vitest";
import {
  parseCandidate,
  submitStroke,
  type SubmissionStore,
} from "./submission";
import {
  displayName,
  type CanvasRecord,
  type Candidate,
} from "../domain/canvas";
import { RULES, bounds } from "../drawing/model";
const canvas: CanvasRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "studio",
  title: "Studio",
  description: "",
  width: 4000,
  height: 3000,
  status: "open",
  opens_at: null,
  closes_at: null,
};
const valid: Candidate = {
  requestId: "22222222-2222-4222-8222-222222222222",
  points: [
    { x: 10, y: 15 },
    { x: 30, y: 45 },
  ],
  color: "#ab1234",
  width: 6,
  duration: 300,
};
function store(c = canvas) {
  return {
    canvas: vi.fn().mockResolvedValue(c),
    save: vi.fn().mockImplementation(async (userId, c, candidate, box) => ({
      id: "saved",
      canvasId: c.id,
      ...candidate,
      bounds: box,
      author: { id: userId, displayName: "Artist" },
      createdAt: "2026-09-26T00:00:00Z",
      status: "approved",
      order: 1,
    })),
  } as SubmissionStore;
}
describe("server submission trust boundary", () => {
  it("requires a verified identity before fetching or saving", async () => {
    const db = store();
    await expect(
      submitStroke(db, null, canvas.id, valid),
    ).rejects.toMatchObject({ status: 401 });
    expect(db.save).not.toHaveBeenCalled();
  });
  it("uses server identity, normalizes color and calculates bounds", async () => {
    const db = store();
    const saved = await submitStroke(db, "verified-user", canvas.id, valid);
    expect(saved.author.id).toBe("verified-user");
    expect(saved.color).toBe("#AB1234");
    expect(saved.bounds).toEqual(bounds(valid.points, 6));
    expect(JSON.parse(JSON.stringify(saved)).points).toEqual(valid.points);
  });
  it.each(["userId", "user_id", "createdAt", "status", "bounds"])(
    "rejects spoofed server field %s",
    (field) =>
      expect(() =>
        parseCandidate({ ...valid, [field]: "spoof" }, canvas),
      ).toThrow("Unexpected"),
  );
  it.each([
    { points: [{ x: -1, y: 0 }] },
    { points: [{ x: Infinity, y: 0 }] },
    { points: [null] },
    { points: [] },
    { points: Array(RULES.maxPoints + 1).fill({ x: 1, y: 1 }) },
    { color: "red" },
    { width: 999 },
    { duration: 15001 },
    { duration: NaN },
    { requestId: "bad" },
  ])("rejects malformed candidates %s", (override) =>
    expect(() => parseCandidate({ ...valid, ...override }, canvas)).toThrow(),
  );
  it.each(["draft", "closed", "archived"] as const)(
    "rejects %s canvas",
    async (status) => {
      const db = store({ ...canvas, status });
      await expect(
        submitStroke(db, "verified", canvas.id, valid),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.save).not.toHaveBeenCalled();
    },
  );
  it("uses database canvas dimensions, opening and closing times", async () => {
    expect(() => parseCandidate(valid, { ...canvas, width: 20 })).toThrow();
    for (const c of [
      { ...canvas, opens_at: "2100-01-01T00:00:00Z" },
      { ...canvas, closes_at: "2000-01-01T00:00:00Z" },
    ])
      await expect(
        submitStroke(store(c), "verified", canvas.id, valid),
      ).rejects.toMatchObject({ status: 409 });
  });
  it("validates public display labels without using email", () => {
    expect(displayName(" Artist ")).toBe("Artist");
    for (const input of ["x", "<script>x</script>", "a".repeat(41), null])
      expect(displayName(input)).toBeNull();
  });
});
