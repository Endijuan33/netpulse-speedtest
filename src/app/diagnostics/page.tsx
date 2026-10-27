"use client";

import { useEffect, useState } from "react";

interface Diag {
  host: string;
  resolvers: { resolver: string; server: string; timeMs: number | null; error: string | null }[];
  timing: { dnsMs: number | null; tcpMs: number | null; tlsMs: number | null; httpMs: number | null; status: number | null; error: string | null };
  note: string;
}

export default function DiagnosticsPage() {
  const [host, setHost] = useState("cloudflare.com");
  const [data, setData] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v4, setV4] = useState<string>("checking…");
  const [v6, setV6] = useState<string>("checking…");

  const run = async (h: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/diagnostics?host=${encodeURIComponent(h)}`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError((j as { message?: string }).message ?? "Diagnostics failed."); setData(null); return; }
      setData(await res.json());
    } catch { setError("Diagnostics request failed."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void run("cloudflare.com");
    // IPv4/IPv6 connectivity: distinct endpoints, failures shown, not hidden.
    fetch("https://ipv4.icanhazip.com/").then((r) => r.text()).then((t) => setV4(`reachable (${t.trim()})`)).catch(() => setV4("unreachable"));
    fetch("https://ipv6.icanhazip.com/").then((r) => r.text()).then((t) => setV6(`reachable (${t.trim()})`)).catch(() => setV6("unreachable"));
  }, []);

  const ms = (v: number | null) => (v === null ? "—" : `${v} ms`);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900" aria-label="Network diagnostics">
      <h1 className="text-2xl font-bold">DNS &amp; Network Diagnostics</h1>
      <p className="text-sm text-gray-500">Server-side measurements. Browser-side timings may differ — neither is a universal measurement. Only allowlisted hosts (or public DNS names resolving to public IPs) may be probed; SSRF targets are rejected.</p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(host); }}>
        <label className="sr-only" htmlFor="diag-host">Host to diagnose</label>
        <input id="diag-host" value={host} onChange={(e) => setHost(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800" />
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{loading ? "Running…" : "Run diagnostics"}</button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!data && !error && <div className="mt-4 animate-pulse h-24 rounded bg-gray-100 dark:bg-gray-800" aria-label="Loading diagnostics" />}
      {data && (
        <div className="mt-4 space-y-4">
          <div>
            <h2 className="font-semibold">DNS resolvers — {data.host}</h2>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-1">Resolver</th><th>Server</th><th>Resolution time</th><th>Error</th></tr></thead>
              <tbody>
                {data.resolvers.map((r) => (
                  <tr key={r.resolver} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1">{r.resolver}</td><td>{r.server}</td><td>{ms(r.timeMs)}</td><td>{r.error ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="font-semibold">Connection timing</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {[["DNS", ms(data.timing.dnsMs)], ["TCP connect", ms(data.timing.tcpMs)], ["TLS handshake", ms(data.timing.tlsMs)], ["HTTP response", ms(data.timing.httpMs)], ["HTTP status", data.timing.status === null ? "—" : String(data.timing.status)]].map(([k, v]) => (
                <div key={k} className="rounded bg-gray-50 p-2 dark:bg-gray-800"><dt className="text-xs text-gray-500">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            {data.timing.error && <p className="mt-2 text-sm text-amber-700">Note: {data.timing.error}</p>}
          </div>
          <p className="text-xs text-gray-500">{data.note}</p>
        </div>
      )}
      <div className="mt-6">
        <h2 className="font-semibold">IP connectivity</h2>
        <p className="text-sm">IPv4: {v4}</p>
        <p className="text-sm">IPv6: {v6}</p>
      </div>
    </section>
  );
}
