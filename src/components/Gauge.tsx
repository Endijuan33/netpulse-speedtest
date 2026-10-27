"use client";

import { useEffect, useRef, useState } from "react";
import { GAUGE_CX, GAUGE_CY, GAUGE_MAX_MBPS, gaugeGeometry } from "@/lib/gauge";
import { formatSpeed, type SpeedUnit } from "@/lib/units";

/**
 * SVG arc gauge. Needle angle and blue arc fill are derived from ONE
 * smoothed value (see src/lib/gauge.ts): the needle tip and the arc
 * dashoffset share the same normalized position on every frame, so they
 * can never disagree. Smoothing is a single exponential (rAF, tau ~140 ms)
 * applied to the displayed value — not a Motion spring on the arc alone,
 * which previously made the arc lag the needle. Reduced motion: jump
 * directly to the target. The displayed number is the true linear speed;
 * only the needle/arc position uses the log scale.
 */
export function Gauge({
  value,
  unit = "Mbps",
  label,
}: {
  value: number;
  unit?: SpeedUnit;
  label: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, now - last);
      last = now;
      // Exponential approach: ~63% of the gap closes every 140 ms.
      const alpha = 1 - Math.exp(-dt / 140);
      const next =
        displayedRef.current + (value - displayedRef.current) * alpha;
      if (Math.abs(value - next) < 0.05) {
        displayedRef.current = value;
        setDisplayed(value);
        rafRef.current = null;
        return;
      }
      displayedRef.current = next;
      setDisplayed(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const geo = gaugeGeometry(displayed, GAUGE_MAX_MBPS);
  return (
    <div
      className="flex flex-col items-center"
      role="img"
      aria-label={`${label}: ${formatSpeed(displayed, unit)}`}
    >
      <svg
        viewBox="0 0 200 150"
        className="w-full max-w-[320px]"
        aria-hidden="true"
        data-testid="gauge"
        data-norm={geo.norm.toFixed(3)}
        data-angle={geo.angle.toFixed(1)}
      >
        <path
          d="M 32.5 144 A 78 78 0 1 1 167.5 144"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d="M 32.5 144 A 78 78 0 1 1 167.5 144"
          fill="none"
          stroke="#2563eb"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={geo.dashOffset}
        />
        <line
          data-testid="gauge-needle"
          data-angle={geo.angle.toFixed(1)}
          x1={GAUGE_CX}
          y1={GAUGE_CY}
          x2={geo.tip.x}
          y2={geo.tip.y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r="6" fill="currentColor" />
      </svg>
      <p className="text-4xl font-bold tabular-nums">
        {formatSpeed(displayed, unit)}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
