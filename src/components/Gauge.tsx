"use client";

import { motion } from "motion/react";

/** SVG arc gauge. Respects reduced motion via framer-motion's default handling of instant transitions when the user prefers it (value is applied directly when motion is reduced). */
export function Gauge({ value, max = 1000, label }: { value: number; max?: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const angle = -120 + pct * 240;
  const rad = (angle * Math.PI) / 180;
  const x = 100 + 78 * Math.sin(rad);
  const y = 100 - 78 * Math.cos(rad);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${value.toFixed(1)} Mbps`}>
      <svg viewBox="0 0 200 120" className="w-full max-w-[320px]" aria-hidden="true">
        <path d="M 22 100 A 78 78 0 1 1 178 100" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M 22 100 A 78 78 0 1 1 178 100"
          fill="none"
          stroke="#2563eb"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray="410"
          animate={{ strokeDashoffset: 410 * (1 - pct) }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
        />
        <line x1="100" y1="100" x2={x} y2={y} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="currentColor" />
      </svg>
      <p className="text-4xl font-bold tabular-nums">{value.toFixed(1)}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label} (Mbps)</p>
    </div>
  );
}
