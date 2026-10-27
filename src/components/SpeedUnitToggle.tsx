"use client";

import type { SpeedUnit } from "@/lib/units";

/** Speed-unit selector, shown BEFORE a test starts (and on results). Persisted by the caller. */
export function SpeedUnitToggle({
  unit,
  onChange,
}: {
  unit: SpeedUnit;
  onChange: (unit: SpeedUnit) => void;
}) {
  return (
    <fieldset
      className="flex items-center gap-1 rounded-full border border-gray-300 p-1 text-sm dark:border-gray-700"
      aria-label="Speed unit"
    >
      <legend className="sr-only">Speed unit</legend>
      {(["Mbps", "MBps"] as const).map((u) => (
        <label
          key={u}
          className={`cursor-pointer rounded-full px-3 py-1 ${unit === u ? "bg-blue-600 font-semibold text-white" : "text-gray-600 dark:text-gray-300"}`}
        >
          <input
            type="radio"
            name="speed-unit"
            className="sr-only"
            checked={unit === u}
            onChange={() => onChange(u)}
          />
          {u === "MBps" ? "MB/s" : "Mbps"}
        </label>
      ))}
    </fieldset>
  );
}
