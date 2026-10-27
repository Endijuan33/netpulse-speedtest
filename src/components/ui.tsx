"use client";

import type { ReactNode } from "react";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

/** Shared premium primitives for all four pages (design tokens in globals.css). */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm np-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Sparkline({ values, color = "#00a8ff", label }: { values: number[]; color?: string; label: string }) {
  if (values.length < 2) return <p className="mt-2 text-xs np-muted">No samples yet.</p>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - min) / range) * 32}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="mt-2 h-10 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MetricCard({ icon, name, value, unit, accent, samples, sampleLabel }: { icon: ReactNode; name: string; value: string; unit?: string; accent: string; samples?: number[]; sampleLabel?: string }) {
  return (
    <section className="np-card np-card-hover p-4" aria-label={name}>
      <div className="flex items-center gap-2 text-sm np-muted">
        <span style={{ color: accent }}>{icon}</span>
        <span>{name}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">
        {value} {unit && <span className="text-base font-medium np-muted">{unit}</span>}
      </p>
      {samples && <Sparkline values={samples} color={accent} label={sampleLabel ?? `${name} samples`} />}
    </section>
  );
}

export function StatusBadge({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const bg = tone === "ok" ? "#10b98122" : tone === "warn" ? "#f59e0b22" : tone === "bad" ? "#ef444422" : "#94a3b822";
  const fg = tone === "ok" ? "#10b981" : tone === "warn" ? "#f59e0b" : tone === "bad" ? "#ef4444" : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

export function InfoCard({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="np-elevated flex items-start justify-between gap-2 p-3">
      <div className="min-w-0">
        <p className="text-xs np-muted">{label}</p>
        <p className="mt-0.5 break-all font-medium">{value}</p>
      </div>
      {copy && <CopyButton text={copy} label={`Copy ${label}`} />}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable; button is a no-op rather than an error */
        }
      }}
      className="shrink-0 rounded-md border p-1.5"
      style={{ borderColor: "var(--np-border)" }}
    >
      {done ? <Check className="h-4 w-4 text-[#10b981]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export function Skeleton({ label = "Loading" }: { label?: string }) {
  return <div className="animate-pulse space-y-3" aria-label={label}><div className="h-6 rounded" style={{ background: "var(--np-elevated)" }} /><div className="h-6 rounded" style={{ background: "var(--np-elevated)" }} /><div className="h-6 rounded" style={{ background: "var(--np-elevated)" }} /></div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm np-muted">{children}</p>;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg p-3 text-sm" style={{ background: "#ef444422", color: "#ef4444" }}>{children}</p>;
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="np-card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm np-muted">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-full bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Horizontal timing timeline: each step sized by its share of the total. */
export function TimingTimeline({ steps, totalMs }: { steps: { label: string; ms: number | null; color: string }[]; totalMs: number | null }) {
  const total = totalMs ?? steps.reduce((a, s) => a + (s.ms ?? 0), 0);
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--np-elevated)" }} role="img" aria-label={`Total ${total.toFixed(1)} ms`}>
        {steps.map((s) => (
          <div key={s.label} style={{ width: `${total > 0 ? ((s.ms ?? 0) / total) * 100 : 0}%`, background: s.color }} title={`${s.label}: ${s.ms ?? "—"} ms`} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {steps.map((s) => (
          <div key={s.label} className="np-elevated p-2">
            <dt className="text-xs np-muted">{s.label}</dt>
            <dd className="font-semibold tabular-nums">{s.ms === null ? "—" : `${s.ms} ms`}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs np-muted">Total: {total.toFixed(1)} ms (sum of measured steps; steps that failed show — and are excluded).</p>
    </div>
  );
}
