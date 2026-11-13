import { describe, expect, it } from "vitest";
import { estimateOneRepMax, isReliableEstimate } from "./one-rep-max";

describe("estimateOneRepMax", () => {
  it("uses Epley by default: weight × (1 + reps / 30)", () => {
    expect(estimateOneRepMax({ weightKg: 80, reps: 8 })).toBeCloseTo(101.33, 2);
  });

  it("supports Brzycki: weight × 36 / (37 − reps)", () => {
    expect(estimateOneRepMax({ weightKg: 80, reps: 8 }, "brzycki")).toBeCloseTo(99.31, 2);
  });

  it.each(["epley", "brzycki"] as const)(
    "returns the lifted weight for a single rep (%s)",
    (formula) => {
      expect(estimateOneRepMax({ weightKg: 120, reps: 1 }, formula)).toBe(120);
    },
  );

  it("accepts fractional weights", () => {
    expect(estimateOneRepMax({ weightKg: 22.5, reps: 10 })).toBeCloseTo(30, 2);
  });

  it.each([0, -1, 2.5, Number.NaN])("rejects invalid reps: %s", (reps) => {
    expect(() => estimateOneRepMax({ weightKg: 80, reps })).toThrow(RangeError);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid weight: %s",
    (weightKg) => {
      expect(() => estimateOneRepMax({ weightKg, reps: 5 })).toThrow(RangeError);
    },
  );

  it("rejects reps where Brzycki is undefined (37 or more)", () => {
    expect(() => estimateOneRepMax({ weightKg: 40, reps: 37 }, "brzycki")).toThrow(RangeError);
  });
});

describe("isReliableEstimate", () => {
  it("treats up to 10 reps as reliable", () => {
    expect(isReliableEstimate(1)).toBe(true);
    expect(isReliableEstimate(10)).toBe(true);
  });

  it("treats more than 10 reps as unreliable", () => {
    expect(isReliableEstimate(11)).toBe(false);
  });
});
