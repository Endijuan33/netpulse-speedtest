"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getResult } from "@/lib/history";
import type { SpeedResult } from "@/lib/validation";

/**
 * Dedicated printable report. It auto-prints once (guarded, one-shot) after
 * the result loads from IndexedDB, and always offers a manual Print button.
 * This page lives in its own tab by design: if the native print dialog
 * hangs, only this tab is affected — the dashboard tab stays responsive.
 */
export default function PrintPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const printedRef = useRef(false);

  useEffect(() => {
    getResult(id)
      .then((r) => {
        if (!r) setState("missing");
        else {
          setResult(r);
          setState("ok");
        }
      })
      .catch(() => setState("missing"));
  }, [id]);

  useEffect(() => {
    if (state !== "ok" || printedRef.current) return;
    printedRef.current = true;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === "loading") return <div className="animate-pulse h-24 rounded bg-gray-100" aria-label="Loading printable report" />;
  if (state === "missing" || !result) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-bold">Printable report not available</h1>
        <p className="mt-2 text-sm text-gray-500">
          The result was not found in this browser&apos;s history (IndexedDB). Print reports are generated from the dashboard right after a test.
        </p>
        <Link href="/" className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-white">Go to dashboard</Link>
      </section>
    );
  }

  const rows: [string, string][] = [
    ["Test ID", result.id],
    ["Timestamp", new Date(result.timestamp).toLocaleString()],
    ["Download", `${result.downloadMbps} Mbps`],
    ["Upload", `${result.uploadMbps} Mbps`],
    ["Idle latency (HTTP)", `${result.idleLatencyMs} ms`],
    ["Download latency", `${result.downloadLatencyMs} ms`],
    ["Upload latency", `${result.uploadLatencyMs} ms`],
    ["Jitter", `${result.jitterMs} ms (max ${result.maxJitterMs} ms)`],
    ["HTTP request loss", `${result.httpRequestLossPercent}% — not ICMP packet loss`],
    ["Server", result.server],
    ["ISP", result.isp ?? "unknown"],
    ["Public IP", result.hideIp ? "hidden by user" : (result.publicIp ?? "unknown")],
  ];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6" aria-label="Printable test report">
      <h1 className="text-2xl font-bold">NetPulse Test Report</h1>
      <div className="no-print mt-4 flex gap-2">
        <button onClick={() => window.print()} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Print this report</button>
        <Link href="/" className="rounded-md border px-4 py-2 text-sm">Back to dashboard</Link>
      </div>
      <p className="no-print mt-2 text-xs text-gray-500">
        If a print dialog appears, it belongs to this tab only — your dashboard tab stays responsive.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-gray-500">Ping is HTTP round-trip latency, not ICMP. Packet loss shown is HTTP request loss, not ICMP packet loss.</p>
    </section>
  );
}
