import { describe, expect, it } from "vitest";
import {
  RULES,
  bounds,
  normalizeColor,
  toScreen,
  toWorld,
  transition,
  validateStroke,
  zoomAt,
  type Phase,
} from "./model";
describe("color normalization", () => {
  it.each(["#aBc123", " abc123 "])("normalizes %s", (value) =>
    expect(normalizeColor(value)).toBe("#ABC123"),
  );
  it.each(["#fff", "#GG0000", "", "red", "#1234567"])("rejects %s", (value) =>
    expect(normalizeColor(value)).toBeNull(),
  );
});
describe("workflow", () => {
  it("permits only one completed stroke per Add Stroke", () => {
    let phase: Phase = "idle";
    let completed = 0;
    for (const action of [
      "ADD",
      "LOCK",
      "DOWN",
      "READY",
      "DOWN",
      "UP",
      "DOWN",
      "UP",
    ] as const) {
      const next = transition(phase, action);
      if (next === "completed" && phase !== "completed") completed++;
      phase = next;
    }
    expect(completed).toBe(1);
    expect(phase).toBe("completed");
  });
  it.each(["preparing", "sampling", "countdown", "armed"] as Phase[])(
    "cancels %s without permitting a stroke",
    (phase) => {
      expect(transition(transition(phase, "CANCEL"), "DOWN")).toBe("cancelled");
    },
  );
  it("cannot draw during countdown or cancel after starting", () => {
    expect(transition("countdown", "DOWN")).toBe("countdown");
    expect(transition("drawing", "CANCEL")).toBe("drawing");
  });
});
describe("logical coordinates", () => {
  it("round trips through pan and zoom without changing vectors", () => {
    const point = { x: 1234, y: 2345 };
    for (const zoom of [0.1, 0.5, 1, 4]) {
      const view = { x: -81, y: 293, zoom };
      expect(toWorld(toScreen(point, view), view)).toEqual(point);
    }
  });
  it("keeps the zoom anchor fixed and enforces zoom limits", () => {
    const view = { x: 23, y: -55, zoom: 0.5 };
    const anchor = { x: 320, y: 210 };
    const next = zoomAt(view, anchor, 2);
    expect(toWorld(anchor, next)).toEqual(toWorld(anchor, view));
    expect(zoomAt(view, anchor, 100).zoom).toBe(RULES.maxZoom);
  });
});
describe("stroke constraints", () => {
  const valid = [
    { x: 20, y: 20 },
    { x: 40, y: 50 },
  ];
  it("accepts a line and a deliberate dot", () => {
    expect(validateStroke(valid, 100, "#ABCDEF", 6)).toBeNull();
    expect(validateStroke([valid[0]], 0, "#ABCDEF", 2)).toBeNull();
  });
  it("includes brush extent in bounds", () =>
    expect(bounds(valid, 6)).toEqual({
      minX: 17,
      minY: 17,
      maxX: 43,
      maxY: 53,
    }));
  it.each([NaN, Infinity, -1, 4001])("rejects invalid coordinates %s", (x) =>
    expect(validateStroke([{ x, y: 20 }], 100, "#ABCDEF", 6)).not.toBeNull(),
  );
  it("rejects invalid properties, empty paths, duration, density and length", () => {
    expect(validateStroke([], 100, "#ABCDEF", 6)).not.toBeNull();
    expect(validateStroke(valid, 100, "red", 6)).not.toBeNull();
    expect(validateStroke(valid, 100, "#ABCDEF", 900)).not.toBeNull();
    for (const duration of [-1, NaN, Infinity, RULES.maxDuration + 1])
      expect(validateStroke(valid, duration, "#ABCDEF", 6)).not.toBeNull();
    expect(
      validateStroke(
        Array(RULES.maxPoints + 1).fill(valid[0]),
        100,
        "#ABCDEF",
        6,
      ),
    ).not.toBeNull();
    expect(
      validateStroke(
        Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 4000 : 0, y: 0 })),
        100,
        "#ABCDEF",
        6,
      ),
    ).not.toBeNull();
  });
});
