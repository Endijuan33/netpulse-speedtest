import { describe, it, expect } from "vitest";
import {
  GAUGE_MAX_MBPS,
  gaugeAngle,
  gaugeDashOffset,
  gaugeGeometry,
  gaugeNorm,
  gaugeTip,
} from "../src/lib/gauge";
import { convertSpeed, formatSpeed, parseSpeedUnit } from "../src/lib/units";

/**
 * Round 3 regressions:
 * - Needle angle and arc fill must agree at every point of the scale
 *   (old bug: 240° needle vs 180° arc + dasharray 410 vs actual length ~327).
 * - Log scale: norm(0)=0, norm(max)=1, strictly increasing.
 * - Unit conversion: MB/s = Mbps / 8, persisted value parses safely.
 */
describe("gauge geometry: needle and arc agree", () => {
  it("angle and dashoffset are the same function of norm at 0/25/50/75/100% of scale", () => {
    for (const norm of [0, 0.25, 0.5, 0.75, 1]) {
      expect(gaugeAngle(norm)).toBeCloseTo(-120 + norm * 240, 9);
      expect(gaugeDashOffset(norm)).toBeCloseTo(100 * (1 - norm), 9);
    }
  });
  it("geometry for a value uses one norm for angle, offset and tip", () => {
    for (const v of [0, 1, 20, 200, 1000, 5000]) {
      const g = gaugeGeometry(v, GAUGE_MAX_MBPS);
      expect(g.angle).toBeCloseTo(gaugeAngle(g.norm), 9);
      expect(g.dashOffset).toBeCloseTo(gaugeDashOffset(g.norm), 9);
      const tip = gaugeTip(g.norm);
      expect(g.tip.x).toBeCloseTo(tip.x, 9);
      expect(g.tip.y).toBeCloseTo(tip.y, 9);
    }
  });
  it("log scale endpoints and monotonicity", () => {
    expect(gaugeNorm(0)).toBe(0);
    expect(gaugeNorm(GAUGE_MAX_MBPS)).toBe(1);
    expect(gaugeNorm(20)).toBeGreaterThan(gaugeNorm(10));
    expect(gaugeNorm(200)).toBeGreaterThan(gaugeNorm(20));
    expect(gaugeNorm(200)).toBeLessThan(1);
    // Needle tip stays inside the 200x150 viewBox at both extremes.
    expect(gaugeTip(0).x).toBeGreaterThanOrEqual(0);
    expect(gaugeTip(0).y).toBeLessThanOrEqual(150);
    expect(gaugeTip(1).x).toBeLessThanOrEqual(200);
    expect(gaugeTip(1).y).toBeLessThanOrEqual(150);
  });
});

describe("speed units", () => {
  it("converts Mbps to MB/s by dividing by 8", () => {
    expect(convertSpeed(80, "MBps")).toBe(10);
    expect(convertSpeed(19.44, "MBps")).toBeCloseTo(2.43, 2);
    expect(convertSpeed(80, "Mbps")).toBe(80);
    expect(formatSpeed(80, "MBps")).toBe("10.0 MB/s");
    expect(formatSpeed(80, "Mbps")).toBe("80.0 Mbps");
  });
  it("parses persisted unit safely, defaulting to Mbps", () => {
    expect(parseSpeedUnit("MBps")).toBe("MBps");
    expect(parseSpeedUnit("Mbps")).toBe("Mbps");
    expect(parseSpeedUnit(null)).toBe("Mbps");
    expect(parseSpeedUnit("gibberish")).toBe("Mbps");
  });
});
