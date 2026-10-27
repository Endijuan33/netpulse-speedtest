import { describe, it, expect } from "vitest";
import { bytesToMbps, bytesToMBps, summarize, computeJitter, computeLoss } from "../src/lib/stats";

describe("speed calculation", () => {
  it("converts 1 MB in 1 s to 8 Mbps and 1 MB/s", () => {
    expect(bytesToMbps(1_000_000, 1000)).toBeCloseTo(8);
    expect(bytesToMBps(1_000_000, 1000)).toBeCloseTo(1);
  });
  it("returns 0 for zero duration or negative bytes", () => {
    expect(bytesToMbps(1000, 0)).toBe(0);
    expect(bytesToMbps(-5, 1000)).toBe(0);
  });
});

describe("ping stats", () => {
  it("computes min/max/mean/median", () => {
    const s = summarize([10, 20, 30]);
    expect(s).toMatchObject({ min: 10, max: 30, mean: 20, median: 20, count: 3 });
  });
  it("handles empty input", () => {
    expect(summarize([]).count).toBe(0);
  });
});

describe("jitter", () => {
  it("uses mean absolute successive difference", () => {
    const j = computeJitter([10, 20, 20, 30]);
    expect(j.averageJitter).toBeCloseTo((10 + 0 + 10) / 3);
    expect(j.maxJitter).toBe(10);
  });
  it("is zero for fewer than 2 samples", () => {
    expect(computeJitter([10])).toEqual({ averageJitter: 0, maxJitter: 0 });
  });
});

describe("packet/request loss", () => {
  it("computes HTTP request loss percent", () => {
    expect(computeLoss(10, 2).lossPercent).toBe(20);
    expect(computeLoss(0, 0).lossPercent).toBe(0);
  });
});
