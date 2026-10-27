/**
 * Gauge geometry — the SINGLE source of truth for needle angle and arc fill.
 *
 * Root cause of the old mismatch (round 3, issues 1–2): the needle swept
 * 240° (angle -120°..+120°) while the background arc was a 180° semicircle,
 * the needle tip at the extremes fell outside the SVG viewBox, and the blue
 * arc used strokeDasharray 410 while the actual arc length is ~327 — so the
 * fill fraction never matched the needle. On top of that, the arc was
 * animated by a Motion spring (0.4 s easeOut) while the needle jumped
 * instantly, so the two visibly disagreed on every sample.
 *
 * Fixed geometry: centre (100, 105), radius 78, viewBox 0 0 200 150, arc
 * from -120° to +120° through the top (a true 240° arc, endpoints
 * (32.5, 144) and (167.5, 144)). Both needle and arc derive from the same
 * normalized value below, and the arc uses pathLength=100 so dashoffset is
 * exactly 100 * (1 - norm) — no hardcoded dasharray guesswork.
 *
 * Scale: logarithmic spacing over a FIXED 0–1000 Mbps range.
 * A linear 0–1000 gauge barely moves below 100 Mbps and the old adaptive
 * max (ceil(value/100)*100) made the needle jump BACKWARDS as the max grew
 * mid-test. Log spacing (norm = log10(1+v) / log10(1+1000)) puts 20 Mbps at
 * ~44% of sweep and 200 Mbps at ~77%, with log-spaced marks, and
 * the fixed max removes the backwards-jump entirely. The displayed number
 * is always the true linear Mbps; only the needle/arc position is log.
 */
export const GAUGE_MAX_MBPS = 1000;
export const GAUGE_START_DEG = -120;
export const GAUGE_SWEEP_DEG = 240;
export const GAUGE_CX = 100;
export const GAUGE_CY = 105;
export const GAUGE_RADIUS = 78;

/** Normalized gauge position in [0, 1] for a linear Mbps value. */
export function gaugeNorm(valueMbps: number, maxMbps = GAUGE_MAX_MBPS): number {
  if (!Number.isFinite(valueMbps) || valueMbps <= 0) return 0;
  if (valueMbps >= maxMbps) return 1;
  return Math.log10(1 + valueMbps) / Math.log10(1 + maxMbps);
}

/** Needle angle in degrees, from the normalized position. */
export function gaugeAngle(norm: number): number {
  const n = Math.max(0, Math.min(1, norm));
  return GAUGE_START_DEG + n * GAUGE_SWEEP_DEG;
}

/** Arc dashoffset for a pathLength=100 arc, from the normalized position. */
export function gaugeDashOffset(norm: number): number {
  const n = Math.max(0, Math.min(1, norm));
  return 100 * (1 - n);
}

/** Needle tip coordinates for a normalized position. */
export function gaugeTip(norm: number): { x: number; y: number } {
  const rad = (gaugeAngle(norm) * Math.PI) / 180;
  return {
    x: GAUGE_CX + GAUGE_RADIUS * Math.sin(rad),
    y: GAUGE_CY - GAUGE_RADIUS * Math.cos(rad),
  };
}

/** Full geometry for a linear Mbps value: angle and dashoffset agree by construction. */
export function gaugeGeometry(
  valueMbps: number,
  maxMbps = GAUGE_MAX_MBPS,
): {
  norm: number;
  angle: number;
  dashOffset: number;
  tip: { x: number; y: number };
} {
  const norm = gaugeNorm(valueMbps, maxMbps);
  return {
    norm,
    angle: gaugeAngle(norm),
    dashOffset: gaugeDashOffset(norm),
    tip: gaugeTip(norm),
  };
}
