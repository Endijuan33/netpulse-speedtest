"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { GAUGE_CX, GAUGE_CY, GAUGE_MAX_MBPS, gaugeGeometry } from "@/lib/gauge";
import { convertSpeed, formatSpeed, type SpeedUnit } from "@/lib/units";

/**
 * SVG arc gauge, reference-style: the value, unit, phase pill, and a
 * download/upload icon circle sit INSIDE the arc (centred on the arc
 * centre), the unit toggle lives below the gauge on the dashboard, and
 * the track is always a dim blue→purple gradient — never a flat grey
 * arc. Needle angle and progress-arc fill derive from ONE smoothed value
 * (see src/lib/gauge.ts): the needle tip and the arc dashoffset share
 * the same normalized position on every frame, so they can never
 * disagree. Smoothing is a single exponential (rAF, tau ~140 ms).
 * Reduced motion: jump directly to the target. The displayed number is
 * the true linear speed; only the needle/arc position uses the log scale.
 * At idle (norm 0) the needle points exactly at tick 0 and only the dim
 * track shows — the progress arc is drawn only when norm > 0.
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
  // Reference tick marks (log scale): label positions are computed from the
  // same geometry as the needle, so ticks, needle and arc can never drift.
  const ticks = [0, 1, 5, 10, 50, 100, 500, 1000].map((v) => {
    const tip = gaugeGeometry(v, GAUGE_MAX_MBPS).tip;
    const f = 92 / 78;
    // Clamp inside the 200x150 viewBox so end labels (500/1000) are never
    // clipped by the SVG edge — the previous radius pushed them outside.
    const x = Math.min(186, Math.max(14, GAUGE_CX + (tip.x - GAUGE_CX) * f));
    const y = Math.min(140, Math.max(10, GAUGE_CY + (tip.y - GAUGE_CY) * f));
    return { v, x, y };
  });
  const num = convertSpeed(displayed, unit).toFixed(1);
  const unitLabel = unit === "MBps" ? "MB/s" : "Mbps";
  return (
    <div
      className="mx-auto w-full max-w-[340px]"
      role="img"
      aria-label={`${label}: ${formatSpeed(displayed, unit)}`}
    >
      <div className="relative">
        <svg
          viewBox="0 0 200 150"
          className="block h-auto w-full"
          aria-hidden="true"
          data-testid="gauge"
          data-norm={geo.norm.toFixed(3)}
          data-angle={geo.angle.toFixed(1)}
        >
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00a8ff" />
              <stop offset="55%" stopColor="#2563ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          {/* Dim gradient track: always visible, including at idle. */}
          <path
            d="M 32.5 144 A 78 78 0 1 1 167.5 144"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeOpacity="0.28"
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
          />
          {/* Full-strength progress arc, only once there is a value. */}
          {geo.norm > 0 && (
            <path
              d="M 32.5 144 A 78 78 0 1 1 167.5 144"
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="14"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={geo.dashOffset}
            />
          )}
          {ticks.map((t) => (
            <text key={t.v} x={t.x} y={t.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#94a3b8" stroke="#050918" strokeOpacity="0.55" strokeWidth="2" paintOrder="stroke">
              {t.v}
            </text>
          ))}
          <line
            data-testid="gauge-needle"
            data-angle={geo.angle.toFixed(1)}
            x1={GAUGE_CX}
            y1={GAUGE_CY}
            x2={geo.tip.x}
            y2={geo.tip.y}
            stroke="#f8fafc"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        {/* Centre content: icon circle, value, unit, phase pill. The icon
          circle covers the needle base, as in the reference. */}
        <div
          className="pointer-events-none absolute flex flex-col items-center"
          style={{ left: "50%", top: "70%", transform: "translate(-50%, -50%)" }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#00a8ff] to-[#a855f7] shadow-lg shadow-[#2563ff]/40">
            {label === "Upload" ? (
              <ArrowUp className="h-6 w-6 text-white" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-6 w-6 text-white" aria-hidden="true" />
            )}
          </span>
          <p className="mt-1 text-4xl font-bold leading-none tabular-nums">{num}</p>
          <p className="text-sm np-muted">{unitLabel}</p>
          <span className="mt-1.5 rounded-full bg-[#2563ff]/25 px-3 py-0.5 text-xs font-semibold text-[#9cc3ff]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
