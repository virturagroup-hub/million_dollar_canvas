import { describe, it, expect } from "vitest";
import { samplePosition, loupePosition } from "./sampling";
import { RULES, toScreen } from "./model";
describe("canvas-local sampling", () => {
  it.each([1, 1.25, 2, 3])(
    "uses the exact backing pixel after pan and zoom at DPR %s",
    (dpr) => {
      const view = { x: -37, y: 13, zoom: 0.75 };
      const p = toScreen({ x: 150, y: 200 }, view);
      expect(
        samplePosition(
          p,
          view,
          RULES,
          { width: 500, height: 400 },
          { width: 500 * dpr, height: 400 * dpr },
        ),
      ).toEqual({ x: Math.floor(p.x * dpr), y: Math.floor(p.y * dpr) });
    },
  );
  it("rejects outside artwork and outside the element", () => {
    expect(
      samplePosition(
        { x: 2, y: 2 },
        { x: 10, y: 10, zoom: 1 },
        RULES,
        { width: 500, height: 400 },
        { width: 1000, height: 800 },
      ),
    ).toBeNull();
    expect(
      samplePosition(
        { x: 500, y: 20 },
        { x: 0, y: 0, zoom: 1 },
        RULES,
        { width: 500, height: 400 },
        { width: 1000, height: 800 },
      ),
    ).toBeNull();
  });
  it("flips and clamps the loupe at viewport edges", () => {
    expect(
      loupePosition({ x: 380, y: 700 }, { width: 390, height: 720 }),
    ).toEqual({ x: 230, y: 520 });
    const corner = loupePosition({ x: 0, y: 0 }, { width: 390, height: 720 });
    expect(corner).toEqual({ x: 22, y: 22 });
  });
});
