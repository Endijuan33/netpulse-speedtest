/**
 * Honest history trend math (visual polish, no invented numbers).
 *
 * A trend compares the average of the CURRENT period against the average
 * of the immediately PRECEDING equal-length period from the same dataset.
 * It returns null — rendered as "—", never as a fabricated percent — when
 * the previous window has no records, its average is zero/negative, or the
 * current period is empty/degenerate.
 */
export function trendPercent(
  currentAvg: number,
  previousValues: number[],
): number | null {
  if (!Number.isFinite(currentAvg) || previousValues.length === 0) return null;
  const prevAvg =
    previousValues.reduce((a, b) => a + b, 0) / previousValues.length;
  if (!Number.isFinite(prevAvg) || prevAvg <= 0) return null;
  return ((currentAvg - prevAvg) / prevAvg) * 100;
}

/** Equal-length window immediately before [startMs, endMs]. Null if degenerate. */
export function previousPeriodRange(
  startMs: number,
  endMs: number,
): { start: number; end: number } | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const duration = endMs - startMs;
  if (duration <= 0) return null;
  return { start: startMs - duration, end: startMs };
}
