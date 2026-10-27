/** Speed display unit. Canonical stored/measured values are always Mbps; this only affects display. */
export type SpeedUnit = "Mbps" | "MBps";

export const SPEED_UNIT_KEY = "netpulse-speed-unit";

export function parseSpeedUnit(raw: string | null): SpeedUnit {
  return raw === "MBps" ? "MBps" : "Mbps";
}

export function readSpeedUnit(): SpeedUnit {
  if (typeof window === "undefined") return "Mbps";
  try {
    return parseSpeedUnit(window.localStorage.getItem(SPEED_UNIT_KEY));
  } catch {
    return "Mbps";
  }
}

export function storeSpeedUnit(unit: SpeedUnit): void {
  try {
    window.localStorage.setItem(SPEED_UNIT_KEY, unit);
  } catch {
    /* storage unavailable — unit simply does not persist */
  }
}

/** Convert a canonical Mbps value to the display unit. MB/s = Mbps / 8. */
export function convertSpeed(mbps: number, unit: SpeedUnit): number {
  return unit === "MBps" ? mbps / 8 : mbps;
}

/** Format a canonical Mbps value in the display unit, e.g. "19.4 Mbps" or "2.4 MB/s". */
export function formatSpeed(mbps: number, unit: SpeedUnit): string {
  const v = convertSpeed(mbps, unit);
  return `${v.toFixed(1)} ${unit === "MBps" ? "MB/s" : "Mbps"}`;
}
