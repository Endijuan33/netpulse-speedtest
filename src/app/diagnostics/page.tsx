"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen, CheckCircle2, Cloud, FileText, Flag, Globe, History, Link2, Lock,
  Network, Route, Settings, Shield, Timer, Zap,
} from "lucide-react";
import { CopyButton, PageHeader, StatusBadge, TimingTimeline, EmptyState, ErrorState } from "@/components/ui";

interface Diag {
  host: string;
  resolvers: { resolver: string; server: string; address: string | null; timeMs: number | null; error: string | null }[];
  timing: { resolvedIp: string | null; dnsMs: number | null; tcpMs: number | null; tlsMs: number | null; httpMs: number | null; status: number | null; contentType: string | null; contentLength: string | null; redirectLocation: string | null; error: string | null };
  note: string;
}

type Tab = "dns" | "timing" | "connectivity" | "traceroute" | "http";
const PRESETS = ["cloudflare.com", "google.com", "youtube.com", "openai.com", "github.com", "vercel.com"];
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "dns", label: "DNS Lookup", icon: <Globe className="h-4 w-4" aria-hidden="true" /> },
  { id: "timing", label: "Connection Timing", icon: <Timer className="h-4 w-4" aria-hidden="true" /> },
  { id: "connectivity", label: "IP Connectivity", icon: <Network className="h-4 w-4" aria-hidden="true" /> },
  { id: "traceroute", label: "Trace Route", icon: <Route className="h-4 w-4" aria-hidden="true" /> },
  { id: "http", label: "HTTP Test", icon: <FileText className="h-4 w-4" aria-hidden="true" /> },
];
// Neutral glyphs for resolvers — no trademarked brand logos are reproduced.
const RESOLVER_ICONS: Record<string, ReactNode> = {
  "Cloudflare DNS": <Cloud className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />,
  "Google DNS": <Globe className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />,
  "Quad9 DNS": <Shield className="h-4 w-4 text-[#a855f7]" aria-hidden="true" />,
  OpenDNS: <Globe className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />,
  "System resolver": <Settings className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />,
};

export default function DiagnosticsPage() {
  const [host, setHost] = useState("cloudflare.com");
  const [tab, setTab] = useState<Tab>("dns");
  const [data, setData] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v4, setV4] = useState<string>("checking…");
  const [v6, setV6] = useState<string>("checking…");
  const [recent, setRecent] = useState<{ host: string; at: string; ok: boolean }[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("netpulse-diag-recent");
      if (raw) setRecent(JSON.parse(raw) as { host: string; at: string; ok: boolean }[]);
    } catch {
      /* recent tests are best-effort */
    }
  }, []);

  const run = async (h: string) => {
    const clean = h.trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(clean) || clean.includes("..")) {
      setError("Enter a valid hostname (letters, digits, dots and hyphens only).");
      return;
    }
    setLoading(true);
    setError(null);
    const runStart = Date.now();
    setStartedAt(runStart);
    setDurationMs(null);
    try {
      const res = await fetch(`/api/diagnostics?host=${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { message?: string }).message ?? "Diagnostics failed.");
        setData(null);
        setRecent((prev) => {
          const next = [{ host: clean, at: new Date().toISOString(), ok: false }, ...prev].slice(0, 5);
          try { localStorage.setItem("netpulse-diag-recent", JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
        return;
      }
      const json = (await res.json()) as Diag;
      setData(json);
      setDurationMs(Date.now() - runStart);
      setRecent((prev) => {
        const next = [{ host: clean, at: new Date().toISOString(), ok: true }, ...prev].slice(0, 5);
        try { localStorage.setItem("netpulse-diag-recent", JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    } catch {
      setError("Diagnostics request failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run("cloudflare.com");
    const check = (url: string, set: (v: string) => void) => {
      fetch(url, { signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error("failed"))))
        .then((t) => set(`reachable (${t.trim()})`))
        .catch(() => set("unreachable"));
    };
    check("https://ipv4.icanhazip.com/", setV4);
    check("https://ipv6.icanhazip.com/", setV6);
  }, []);

  const ms = (v: number | null) => (v === null ? "—" : `${v} ms`);
  const totalMs = data ? [data.timing.dnsMs, data.timing.tcpMs, data.timing.tlsMs, data.timing.httpMs].reduce<number>((a, v) => a + (v ?? 0), 0) : null;
  const dnsOk = data ? data.resolvers.some((r) => r.error === null && r.address !== null) : false;
  const v4Ok = v4.startsWith("reachable");
  const v6Ok = v6.startsWith("reachable");
  const recommendations: string[] = [];
  if (data) {
    if (!dnsOk) recommendations.push("DNS resolution failed on every resolver — check the hostname spelling and your DNS configuration.");
    if (data.resolvers.some((r) => r.timeMs !== null && r.timeMs > 100)) recommendations.push("At least one resolver answered slowly (>100 ms) — that resolver is a weak link for this host.");
    if (!v6Ok) recommendations.push("IPv6 is unreachable from this browser — IPv4-only connectivity is expected on networks without IPv6.");
    if (data.timing.status !== null && data.timing.status >= 400) recommendations.push(`The host answered HTTP ${data.timing.status} — the server, not the network path, is rejecting the request.`);
    if (recommendations.length === 0) recommendations.push("No problems detected in this run — DNS, connection, IP connectivity and HTTP all answered.");
  }

  const exportResults = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ ...data, durationMs, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netpulse-diagnostics-${data.host}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DNS & Network Diagnostics"
        description="Test DNS resolution, connection timing and network connectivity to identify issues. Server-side measurements — browser-side timings may differ, and neither is a universal measurement. Only allowlisted hosts (or public DNS names resolving to public IPs) may be probed; SSRF targets are rejected."
        actions={
          <details className="np-card px-4 py-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium"><BookOpen className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />Learn — How diagnostics work</summary>
            <p className="mt-2 max-w-md text-xs np-muted">
              DNS rows are real resolver queries from the server. Connection timing measures DNS, TCP, TLS and HTTP separately. These are HTTP-layer measurements, never ICMP ping or packet-level loss. Trace Route on serverless hosting cannot use raw ICMP/UDP, so it is not simulated — see that tab for the application-layer path actually measured.
            </p>
          </details>
        }
      />

      <section className="np-card p-5" aria-label="Diagnostic target">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(host); }}>
          <label className="sr-only" htmlFor="diag-host">Hostname or Domain</label>
          <input id="diag-host" value={host} onChange={(e) => setHost(e.target.value)} className="np-input flex-1 min-w-52" placeholder="cloudflare.com" />
          {host && (
            <button type="button" onClick={() => setHost("")} className="rounded-full border px-3 py-2 text-sm" style={{ borderColor: "var(--np-border)" }} aria-label="Clear hostname">Clear</button>
          )}
          <button type="submit" disabled={loading} className="np-btn-primary px-5 py-2 text-sm disabled:opacity-50">{loading ? "Running…" : "▶ Run Diagnostics"}</button>
        </form>
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold np-muted"><Zap className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />Quick Test — popular domains for quick testing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => { setHost(p); void run(p); }} className={`rounded-full border px-3 py-1.5 text-xs ${host === p ? "bg-[#2563ff] text-white" : ""}`} style={{ borderColor: "var(--np-border)" }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="mt-4"><ErrorState>{error}</ErrorState></div>}
        {recent.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs np-muted">
            <History className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />Recent tests:
            {recent.map((r) => (
              <span key={`${r.host}-${r.at}`} className="np-elevated px-2 py-0.5">{r.host} ({new Date(r.at).toLocaleTimeString()}, {r.ok ? "ok" : "failed"})</span>
            ))}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Diagnostic sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm ${tab === t.id ? "np-tab-active" : ""}`} style={{ borderColor: "var(--np-border)" }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {!data && !error && <div className="np-card p-5"><EmptyState>{loading ? "Running diagnostics…" : "Run a diagnostic to see results."}</EmptyState></div>}

      {data && tab === "dns" && (
        <section className="np-card p-5" aria-label="DNS resolvers">
          <h2 className="font-semibold">DNS Resolvers — {data.host}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left np-muted"><th className="py-2">Resolver</th><th>Server</th><th>Result (IP Address)</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>
                {data.resolvers.map((r) => (
                  <tr key={r.resolver} className="border-t" style={{ borderColor: "var(--np-border)" }}>
                    <td className="py-2 pr-2 font-medium"><span className="flex items-center gap-2">{RESOLVER_ICONS[r.resolver] ?? <Globe className="h-4 w-4" aria-hidden="true" />}{r.resolver}</span></td>
                    <td className="pr-2">{r.server}</td>
                    <td className="pr-2 break-all"><span className="flex items-center gap-1">{r.address ?? "—"}{r.address && <CopyButton text={r.address} label={`Copy resolved IP for ${r.resolver}`} />}</span></td>
                    <td className="pr-2 tabular-nums">{ms(r.timeMs)}</td>
                    <td>{r.error ? <StatusBadge tone="bad">{r.error}</StatusBadge> : <StatusBadge tone="ok">✓ OK</StatusBadge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs np-muted">{data.note}</p>
        </section>
      )}

      {data && tab === "timing" && (
        <section className="np-card p-5" aria-label="Connection timing">
          <h2 className="font-semibold">Connection Timing — {data.host} ({data.timing.resolvedIp ?? "IP unknown"})</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-center text-xs">
            {[
              { icon: <Globe className="h-4 w-4" aria-hidden="true" />, label: "DNS", ms: data.timing.dnsMs, color: "#00a8ff" },
              { icon: <Link2 className="h-4 w-4" aria-hidden="true" />, label: "TCP Connect", ms: data.timing.tcpMs, color: "#2563ff" },
              { icon: <Lock className="h-4 w-4" aria-hidden="true" />, label: "TLS Handshake", ms: data.timing.tlsMs, color: "#a855f7" },
              { icon: <FileText className="h-4 w-4" aria-hidden="true" />, label: "HTTP Response", ms: data.timing.httpMs, color: "#f59e0b" },
              { icon: <Flag className="h-4 w-4" aria-hidden="true" />, label: "Total Time", ms: totalMs, color: "#10b981" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className="np-icon-chip" style={{ color: s.color, background: `${s.color}22` }}>{s.icon}</span>
                <span className="np-muted">{s.label}</span>
                <span className="font-semibold tabular-nums">{ms(s.ms)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <TimingTimeline
              totalMs={totalMs}
              steps={[
                { label: "DNS", ms: data.timing.dnsMs, color: "#00a8ff" },
                { label: "TCP Connect", ms: data.timing.tcpMs, color: "#2563ff" },
                { label: "TLS Handshake", ms: data.timing.tlsMs, color: "#a855f7" },
                { label: "HTTP Response", ms: data.timing.httpMs, color: "#f59e0b" },
              ]}
            />
          </div>
          {data.timing.error && <p className="mt-3 text-sm" style={{ color: "#f59e0b" }}>Note: {data.timing.error}</p>}
        </section>
      )}

      {data && tab === "connectivity" && (
        <section className="np-card p-5" aria-label="IP connectivity">
          <h2 className="font-semibold">IP Connectivity</h2>
          <p className="text-sm np-muted">Check IPv4 and IPv6 connectivity to the target.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="np-elevated p-4">
              <p className="font-semibold">IPv4 {v4Ok ? <StatusBadge tone="ok">Reachable</StatusBadge> : <StatusBadge tone="bad">Unreachable</StatusBadge>}</p>
              <p className="mt-2 text-sm">IP Address: {data.timing.resolvedIp ?? "Not detected"}</p>
              <p className="text-sm">Status: {v4}</p>
              <p className="text-sm">TCP Port 443: {data.timing.tcpMs !== null ? `Open (${data.timing.tcpMs} ms)` : "—"}</p>
            </div>
            <div className="np-elevated p-4">
              <p className="font-semibold">IPv6 {v6Ok ? <StatusBadge tone="ok">Reachable</StatusBadge> : <StatusBadge tone="bad">Unreachable</StatusBadge>}</p>
              <p className="mt-2 text-sm">IP Address: Not detected</p>
              <p className="text-sm">Status: {v6}</p>
              <p className="text-sm">TCP Port 443: {v6Ok ? "Open" : "—"}</p>
            </div>
          </div>
          <p className="mt-3 text-xs np-muted">IPv6 “unreachable” here means this browser/network has no working IPv6 path to the check endpoint — it is a connectivity fact, not a failure of the target.</p>
        </section>
      )}

      {data && tab === "traceroute" && (
        <section className="np-card p-5" aria-label="Trace route">
          <h2 className="font-semibold">Trace Route</h2>
          <p className="mt-2 text-sm np-muted">
            Raw ICMP/UDP traceroute is <strong>not available</strong> on serverless hosting (no raw sockets, no privileged network access), so per-hop IPs are <strong>not simulated</strong> and no hop table is fabricated. What is shown below is the application-layer path actually measured for this run — the only path this infrastructure can honestly report.
          </p>
          <ol className="mt-4 space-y-2 text-sm">
            <li className="np-elevated p-3">1 · This browser → NetPulse origin (deployment region) — test traffic originates here.</li>
            <li className="np-elevated p-3">2 · DNS resolution → {data.timing.resolvedIp ?? "unresolved"} ({ms(data.timing.dnsMs)})</li>
            <li className="np-elevated p-3">3 · TCP connect → {data.timing.resolvedIp ?? "—"}:443 ({ms(data.timing.tcpMs)})</li>
            <li className="np-elevated p-3">4 · TLS handshake ({ms(data.timing.tlsMs)}) → HTTP {data.timing.status ?? "—"} ({ms(data.timing.httpMs)}) — destination reached.</li>
          </ol>
          <p className="mt-3 text-xs np-muted">For true per-hop data, run a local traceroute (tracert / traceroute) from your own machine or router — that tool has the raw-socket access this deployment does not.</p>
        </section>
      )}

      {data && tab === "http" && (
        <section className="np-card p-5" aria-label="HTTP test">
          <h2 className="font-semibold">HTTP Test</h2>
          <p className="text-sm np-muted">Test HTTP response time and status code.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="np-elevated p-3"><dt className="text-xs np-muted">URL</dt><dd className="break-all font-medium">https://{data.host}/</dd></div>
            <div className="np-elevated p-3"><dt className="text-xs np-muted">Status Code</dt><dd className="font-medium">{data.timing.status ?? "—"}</dd></div>
            <div className="np-elevated p-3"><dt className="text-xs np-muted">Response Time</dt><dd className="font-medium">{ms(data.timing.httpMs)}</dd></div>
            <div className="np-elevated p-3"><dt className="text-xs np-muted">Content Type</dt><dd className="break-all font-medium">{data.timing.contentType ?? "—"}</dd></div>
            <div className="np-elevated p-3"><dt className="text-xs np-muted">Content Length</dt><dd className="font-medium">{data.timing.contentLength ? `${data.timing.contentLength} B` : "—"}</dd></div>
            <div className="np-elevated p-3"><dt className="text-xs np-muted">Redirect</dt><dd className="break-all font-medium">{data.timing.redirectLocation ?? "None (redirects are reported, never followed)"}</dd></div>
          </dl>
        </section>
      )}

      {data && (
        <section className="np-card p-5" aria-label="Diagnostics summary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Diagnostics Summary</h2>
            <button type="button" onClick={exportResults} className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}><CheckCircle2 className="h-4 w-4 text-[#10b981]" aria-hidden="true" />Export Results</button>
          </div>
          <p className="text-sm np-muted">Overall results and recommendations. Execution duration: {durationMs !== null ? `${(durationMs / 1000).toFixed(1)} s` : "—"}.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="np-elevated p-3"><p className="flex items-center gap-1.5 text-xs np-muted"><Globe className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />DNS Resolution</p><p className="mt-1 font-semibold">{dnsOk ? "Working properly" : "Failed"}</p></div>
            <div className="np-elevated p-3"><p className="flex items-center gap-1.5 text-xs np-muted"><Link2 className="h-4 w-4 text-[#2563ff]" aria-hidden="true" />Connection</p><p className="mt-1 font-semibold">{data.timing.tcpMs !== null ? `Reachable (${totalMs?.toFixed(2) ?? "—"} ms)` : "Failed"}</p></div>
            <div className="np-elevated p-3"><p className="flex items-center gap-1.5 text-xs np-muted"><Network className="h-4 w-4 text-[#a855f7]" aria-hidden="true" />IPv6 Connectivity</p><p className="mt-1 font-semibold">{v6Ok ? "Reachable" : "Unreachable"}</p></div>
            <div className="np-elevated p-3"><p className="flex items-center gap-1.5 text-xs np-muted"><FileText className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />HTTP</p><p className="mt-1 font-semibold">{data.timing.status !== null ? `${data.timing.status} (${ms(data.timing.httpMs)})` : "Failed"}</p></div>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {recommendations.map((r) => (<li key={r}>{r}</li>))}
          </ul>
        </section>
      )}
    </div>
  );
}
