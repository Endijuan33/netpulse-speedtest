"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isValidShareId } from "@/lib/share";
import type { SpeedResult } from "@/lib/validation";

export default function SharedResultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "invalid">("loading");

  useEffect(() => {
    if (!isValidShareId(id)) { setState("invalid"); return; }
    const frag = window.location.hash.slice(1);
    if (!frag) { setState("missing"); return; }
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(frag)))) as SpeedResult;
      setResult(decoded);
      setState("ok");
    } catch {
      setState("missing");
    }
  }, [id]);

  if (state === "invalid") return <p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">Invalid share ID.</p>;
  if (state === "missing") return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-2xl font-bold">Shared result not available</h1>
      <p className="mt-2 text-sm text-gray-500">This deployment has no server-side result store: the payload travels in the URL fragment. If the fragment was stripped (for example by a link shortener), the result cannot be recovered. Ask the sender for the full link.</p>
    </section>
  );
  if (state === "loading" || !result) return <div className="animate-pulse h-24 rounded bg-gray-100 dark:bg-gray-800" aria-label="Loading shared result" />;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900" aria-label="Shared result">
      <h1 className="text-2xl font-bold">Shared NetPulse Result</h1>
      <p className="text-sm text-gray-500">ID: {result.id} · {new Date(result.timestamp).toLocaleString()} · Server: {result.server}</p>
      <p className="text-xs text-gray-500">Privacy: this page shows only what the sender encoded in the link. {result.hideIp || !result.publicIp ? "The public IP was hidden." : ""}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Download", `${result.downloadMbps} Mbps`], ["Upload", `${result.uploadMbps} Mbps`], ["Idle latency", `${result.idleLatencyMs} ms`], ["Jitter", `${result.jitterMs} ms`], ["HTTP request loss", `${result.httpRequestLossPercent}% (not ICMP)`], ["ISP", result.isp ?? "unknown"]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><dt className="text-xs text-gray-500">{k}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
