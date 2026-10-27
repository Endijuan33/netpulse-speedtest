import { describe, expect, it } from "vitest";
import { trendPercent, previousPeriodRange } from "../src/lib/trends";

describe("trendPercent", () => {
  it("computes up/down percentages", () => {
    expect(trendPercent(110, [100])).toBeCloseTo(10);
    expect(trendPercent(80, [100])).toBeCloseTo(-20);
  });
  it("returns null with no previous records or a zero previous average", () => {
    expect(trendPercent(110, [])).toBeNull();
    expect(trendPercent(110, [0, 0])).toBeNull();
  });
  it("returns null for a non-finite current average", () => {
    expect(trendPercent(Number.NaN, [100])).toBeNull();
  });
});

describe("previousPeriodRange", () => {
  it("returns the equal-length preceding window", () => {
    expect(previousPeriodRange(1000, 2000)).toEqual({ start: 0, end: 1000 });
  });
  it("returns null for degenerate ranges", () => {
    expect(previousPeriodRange(2000, 2000)).toBeNull();
    expect(previousPeriodRange(2000, 1000)).toBeNull();
  });
});
