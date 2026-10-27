/** Pure, unit-tested measurement statistics. All functions are side-effect free. */

/** Bytes transferred over `durationMs` -> megabits per second. */
export function bytesToMbps(bytes: number, durationMs: number): number {
  if (durationMs <= 0 || bytes < 0) return 0;
  return (bytes * 8) / (durationMs / 1000) / 1_000_000;
}

/** Bytes transferred over `durationMs` -> megabytes per second. */
export function bytesToMBps(bytes: number, durationMs: number): number {
  if (durationMs <= 0 || bytes < 0) return 0;
  return bytes / (durationMs / 1000) / 1_000_000;
}

export interface SampleStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  count: number;
}

/** min / max / mean / median over a numeric sample set. Empty input -> zeros. */
export function summarize(samples: number[]): SampleStats {
  if (samples.length === 0)
    return { min: 0, max: 0, mean: 0, median: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    median,
    count: samples.length,
  };
}

export interface JitterStats {
  /** Mean of |sample[i] - sample[i-1]| — the standard jitter definition. */
  averageJitter: number;
  maxJitter: number;
}

/**
 * Jitter = mean absolute successive difference of latency samples.
 * Documented formula, used identically by the engine and the UI tooltip.
 */
export function computeJitter(samples: number[]): JitterStats {
  if (samples.length < 2) return { averageJitter: 0, maxJitter: 0 };
  const diffs: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    diffs.push(Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
  }
  return {
    averageJitter: diffs.reduce((a, b) => a + b, 0) / diffs.length,
    maxJitter: Math.max(...diffs),
  };
}

export interface LossStats {
  sent: number;
  failed: number;
  /** Percentage of failed requests. This is HTTP request loss, NOT ICMP packet loss. */
  lossPercent: number;
}

export function computeLoss(sent: number, failed: number): LossStats {
  if (sent <= 0) return { sent: 0, failed: 0, lossPercent: 0 };
  return { sent, failed, lossPercent: (failed / sent) * 100 };
}
