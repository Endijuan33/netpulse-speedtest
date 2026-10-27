"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Gauge } from "@/components/Gauge";
import { SpeedUnitToggle } from "@/components/SpeedUnitToggle";
import { MetricCard, StatusBadge } from "@/components/ui";
import { runSpeedTest, type LiveSample, type Phase } from "@/lib/speedtest";
import {
  formatSpeed,
  readSpeedUnit,
  storeSpeedUnit,
  type SpeedUnit,
} from "@/lib/units";
import type { SpeedResult } from "@/lib/validation";
import { saveResult, toCsv, toTxt } from "@/lib/history";
import {
  ArrowDown,
  ArrowUp,
  Activity,
  Gauge as GaugeIcon,
  Loader2,
  Play,
  X,
} from "lucide-react";

interface NetworkInfo {
  ip?: string | null;
  isp?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  unavailable?: string[];
}

interface ServerItem {
  id: string;
  label: string;
  hostname: string;
  provider: string;
  type: string;
}

const PHASES: Phase[] = [
  "Initializing",
  "Detecting network",
  "Finding optimal server",
  "Measuring ping",
  "Measuring jitter",
  "Measuring download",
  "Measuring upload",
  "Measuring loaded latency",
  "Running diagnostics",
  "Generating report",
];

const PHASE_LOG: Partial<Record<Phase, string>> = {
  Initializing: "Connecting to test server…",
  "Detecting network": "Detecting network…",
  "Finding optimal server": "Selecting test server…",
  "Measuring ping": "Measuring ping…",
  "Measuring jitter": "Measuring jitter…",
  "Measuring download": "Measuring download speed…",
  "Measuring upload": "Measuring upload speed…",
  "Measuring loaded latency": "Measuring latency under load…",
  "Running diagnostics": "Running network diagnostics…",
  "Generating report": "Generating final report…",
};

export default function Dashboard() {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [serverChoice, setServerChoice] = useState<"auto" | "origin">("auto");
  const [serverLat, setServerLat] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(0);
  const [dlSamples, setDlSamples] = useState<LiveSample[]>([]);
  const [ulSamples, setUlSamples] = useState<LiveSample[]>([]);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hideIp, setHideIp] = useState(false);
  const [unit, setUnit] = useState<SpeedUnit>("Mbps");
  const [log, setLog] = useState<{ time: string; text: string }[]>([]);
  useEffect(() => {
    setUnit(readSpeedUnit());
  }, []);
  const changeUnit = (u: SpeedUnit) => {
    setUnit(u);
    storeSpeedUnit(u);
  };
  const [shareLink, setShareLink] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPhaseRef = useRef<Phase | null>(null);

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [
      ...prev.slice(-50),
      { time: new Date().toLocaleTimeString(), text },
    ]);
  }, []);

  useEffect(() => {
    fetch("/api/network-info")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: NetworkInfo) => setInfo(j))
      .catch(() => setInfoError(true));
    fetch("/api/servers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: { servers?: ServerItem[] }) => setServers(j.servers ?? []))
      .catch(() => undefined);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Live test log follows actual engine phases (one entry per phase change).
  useEffect(() => {
    if (phase && phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase;
      pushLog(PHASE_LOG[phase] ?? phase);
      if (phase === "Measuring download") pushLog("Download test started.");
      if (phase === "Measuring upload") pushLog("Upload test started.");
    }
    if (!phase) lastPhaseRef.current = null;
  }, [phase, pushLog]);

  const measureReference = async (hostname: string) => {
    setServerLat((p) => ({ ...p, [hostname]: "measuring…" }));
    try {
      const start = performance.now();
      await fetch(`https://${hostname}/`, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      setServerLat((p) => ({
        ...p,
        [hostname]: `${Math.round(performance.now() - start)} ms (browser-measured, approximate)`,
      }));
    } catch {
      setServerLat((p) => ({ ...p, [hostname]: "unreachable from this browser" }));
    }
  };

  const start = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    setDurationSec(null);
    setShareLink(null);
    setDlSamples([]);
    setUlSamples([]);
    setCurrent(0);
    setElapsed(0);
    setProgress(0);
    setLog([]);
    pushLog("Connecting to test server…");
    startRef.current = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      500,
    );
    timerRef.current = timer;
    const short =
      new URLSearchParams(window.location.search).get("testMode") === "short";
    try {
      const { result: partial } = await runSpeedTest(
        {
          onPhase: (p) => setPhase(p),
          onDownloadSample: (s, cur) => {
            setDlSamples((prev) => [...prev.slice(-200), s]);
            setCurrent(cur);
          },
          onUploadSample: (s, cur) => {
            setUlSamples((prev) => [...prev.slice(-200), s]);
            setCurrent(cur);
          },
          onProgress: (p) => setProgress(p),
        },
        controller.signal,
        { short },
      );
      const full: SpeedResult = {
        ...partial,
        id: `np-${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
        hideIp,
      };
      setResult(full);
      setDurationSec(Math.round((Date.now() - startRef.current) / 1000));
      pushLog(`Download test completed (${formatSpeed(full.downloadMbps, "Mbps")}).`);
      pushLog(`Upload test completed (${formatSpeed(full.uploadMbps, "Mbps")}).`);
      pushLog(`Test completed (${Math.round((Date.now() - startRef.current) / 1000)} s).`);
      try {
        await saveResult(full);
      } catch {
        /* history is best-effort; the result cards still show */
      }
      setCurrent(0);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setToast("Test cancelled.");
        pushLog("Test cancelled by user.");
      } else {
        setError("Test failed. Check your connection and try again.");
        pushLog("Test failed.");
      }
    } finally {
      setRunning(false);
      setPhase(null);
      setCurrent(0);
      clearInterval(timer);
      if (timerRef.current === timer) timerRef.current = null;
    }
  }, [hideIp, pushLog]);

  const cancel = () => controllerRef.current?.abort();

  const printReport = () => {
    if (!result) return;
    const win = window.open(`/print/${result.id}`, "_blank", "noopener");
    if (!win)
      setToast(
        "Popup blocked — allow popups for this site, then try Print report again.",
      );
  };

  const share = async () => {
    if (!result) return;
    const payload = {
      ...result,
      isp: result.isp ?? undefined,
      publicIp: hideIp ? undefined : (result.publicIp ?? undefined),
    };
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: payload }),
    });
    if (!res.ok) {
      setToast("Sharing failed. Try again.");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const link = `${window.location.origin}/r/${id}#${encoded}`;
    setShareLink(link);
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setToast(
      "Share link copied. Payload travels in the URL fragment — only link holders can read it.",
    );
  };

  const downloadFile = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Throughput chart merges both series by timestamp; values follow the unit.
  const chartMap = new Map<number, { t: number; download: number | null; upload: number | null }>();
  for (const s of dlSamples) chartMap.set(s.t, { t: s.t, download: s.mbps, upload: chartMap.get(s.t)?.upload ?? null });
  for (const s of ulSamples) {
    const prev = chartMap.get(s.t);
    chartMap.set(s.t, prev ? { ...prev, upload: s.mbps } : { t: s.t, download: null, upload: s.mbps });
  }
  const conv = (v: number | null) => (v === null ? null : unit === "MBps" ? Math.round((v / 8) * 100) / 100 : v);
  const chartData = [...chartMap.values()]
    .sort((a, b) => a.t - b.t)
    .map((d) => ({ t: d.t, download: conv(d.download), upload: conv(d.upload) }));
  const gaugeValue = running ? current : 0;
  const origin = servers.find((s) => s.type === "origin");
  const references = servers.filter((s) => s.type !== "origin");
  const location = [info?.city, info?.region, info?.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Row 1: connection overview | gauge | test server (reference layout) */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="np-card p-5 xl:col-span-3" aria-label="Connection overview">
          <h2 className="text-sm font-semibold np-muted">Connection Overview</h2>
          <p className="mt-3 text-lg font-bold">{info ? (info.isp ?? "ISP unknown") : (infoError ? "ISP unknown" : "Detecting…")}</p>
          <p className="text-sm np-muted">{location || "Location unknown"}</p>
          <div className="np-elevated mt-4 flex items-center justify-between p-3">
            <span className="text-sm np-muted">Public IP</span>
            <span className="font-mono text-sm font-semibold">{info?.ip ?? "—"}</span>
            {info?.ip && (
              <button type="button" className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "var(--np-border)" }} onClick={() => navigator.clipboard.writeText(info.ip ?? "").catch(() => undefined)} aria-label="Copy public IP">
                Copy
              </button>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <StatusBadge tone={running ? "warn" : "ok"}>{running ? "Testing…" : "● Ready"}</StatusBadge>
            <span className="text-sm np-muted">{running ? "A test is running." : "Connection is ready to test."}</span>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="np-muted">Test server</dt><dd className="font-medium">{origin?.label ?? "Origin server"}</dd></div>
            <div className="flex justify-between"><dt className="np-muted">Server region</dt><dd className="font-medium">Deployment region (iad1)</dd></div>
          </dl>
          <p className="mt-3 text-xs np-muted">This deployment has a single origin test server; there is no fleet to choose from. Reference endpoints below are latency-only, not speedtest servers.</p>
        </section>

        <section className="np-card relative overflow-hidden p-6 xl:col-span-6" aria-label="Speedtest">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse at 50% 0%, #2563ff33, transparent 60%), radial-gradient(ellipse at 90% 100%, #a855f733, transparent 55%)" }} aria-hidden="true" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Network Speedtest</h1>
                <p className="text-sm np-muted" role="status" aria-live="polite">
                  {infoError ? "Network info unavailable — test still works." : info ? `${info.ip ?? "IP unknown"} · ${info.isp ?? "ISP unknown"}` : "Detecting network…"}
                </p>
              </div>
              <SpeedUnitToggle unit={unit} onChange={changeUnit} />
            </div>
            <div className="mt-4">
              <Gauge value={gaugeValue} unit={unit} label={running && phase === "Measuring upload" ? "Upload" : "Download"} />
              <p className="mt-2 text-center text-sm np-muted" aria-live="polite">
                Current: {formatSpeed(current, unit)} · Elapsed: {elapsed}s
              </p>
            </div>
            <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
              {!running ? (
                <button onClick={start} className="np-btn-primary flex items-center gap-2 px-8 py-3">
                  <Play className="h-4 w-4" aria-hidden="true" /> START TEST
                </button>
              ) : (
                <button onClick={cancel} className="flex items-center gap-2 rounded-full bg-[#ef4444] px-8 py-3 font-semibold text-white">
                  <X className="h-4 w-4" aria-hidden="true" /> Cancel Test
                </button>
              )}
              {result && !running && (
                <button onClick={start} className="rounded-full border px-6 py-3 font-semibold" style={{ borderColor: "var(--np-border)" }}>
                  Retest
                </button>
              )}
            </div>
            {running && (
              <div className="mt-5" aria-live="polite">
                <ol className="flex flex-wrap gap-2 text-xs" aria-label="Test phases">
                  {PHASES.map((p) => (
                    <li key={p} className={`rounded-full px-2 py-1 ${phase === p ? "bg-[#2563ff] text-white" : "np-elevated np-muted"}`}>{p}</li>
                  ))}
                </ol>
                <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--np-elevated)" }} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Test progress">
                  <div className="h-full bg-gradient-to-r from-[#00a8ff] to-[#a855f7] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {phase}…
                </p>
              </div>
            )}
            {error && <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: "#ef444422", color: "#ef4444" }} role="alert">{error}</p>}
            {toast && <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: "#10b98122", color: "#10b981" }} role="status">{toast}</p>}
          </div>
        </section>

        <section className="np-card p-5 xl:col-span-3" aria-label="Test server selector">
          <h2 className="text-sm font-semibold np-muted">Test Server</h2>
          <label className="mt-3 block text-xs np-muted" htmlFor="server-select">Selected test server</label>
          <select
            id="server-select"
            className="np-input mt-1 w-full"
            value={serverChoice}
            onChange={(e) => setServerChoice(e.target.value as "auto" | "origin")}
            aria-describedby="server-note"
          >
            <option value="auto">Auto</option>
            <option value="origin">Origin server (explicit)</option>
          </select>
          <p className="mt-1 text-xs np-muted">Selected: {serverChoice === "auto" ? "Auto — resolves to the origin server" : "Origin server (explicit)"}.</p>
          <p id="server-note" className="mt-2 text-xs np-muted">
            Auto selects the origin server handling this request. Speedtests always run against it; changing this list cannot move the test to another region.
          </p>
          <h3 className="mt-5 text-sm font-semibold">Latency references</h3>
          <p className="text-xs np-muted">Not speedtest servers. Measure their browser-measured latency only.</p>
          <ul className="mt-2 space-y-2">
            {references.map((s) => (
              <li key={s.id} className="np-elevated flex items-center justify-between gap-2 p-2 text-sm">
                <span>{s.label}</span>
                <button type="button" className="shrink-0 rounded-full border px-2 py-1 text-xs" style={{ borderColor: "var(--np-border)" }} onClick={() => void measureReference(s.hostname)}>
                  {serverLat[s.hostname] ?? "Measure"}
                </button>
              </li>
            ))}
            {references.length === 0 && <li className="text-sm np-muted">Loading servers…</li>}
          </ul>
        </section>
      </div>

      {/* Row 2: metric cards with real sparklines */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ArrowDown aria-hidden="true" />} name="Download" value={result ? formatSpeed(result.downloadMbps, unit).replace(/ (Mbps|MB\/s)$/, "") : "—"} unit={unit === "MBps" ? "MB/s" : "Mbps"} accent="#00a8ff" samples={dlSamples.map((s) => (unit === "MBps" ? s.mbps / 8 : s.mbps))} sampleLabel="Download samples" />
        <MetricCard icon={<ArrowUp aria-hidden="true" />} name="Upload" value={result ? formatSpeed(result.uploadMbps, unit).replace(/ (Mbps|MB\/s)$/, "") : "—"} unit={unit === "MBps" ? "MB/s" : "Mbps"} accent="#a855f7" samples={ulSamples.map((s) => (unit === "MBps" ? s.mbps / 8 : s.mbps))} sampleLabel="Upload samples" />
        <MetricCard icon={<Activity aria-hidden="true" />} name="Ping" value={result ? String(result.idleLatencyMs) : "—"} unit="ms" accent="#f59e0b" />
        <MetricCard icon={<GaugeIcon aria-hidden="true" />} name="Jitter" value={result ? String(result.jitterMs) : "—"} unit="ms" accent="#ef4444" />
      </div>

      {/* Row 3: realtime chart + live log */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="np-card p-5 xl:col-span-8" aria-label="Realtime throughput">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Realtime Throughput</h2>
            <p className="text-xs np-muted"><span className="text-[#00a8ff]">● Download</span> <span className="text-[#a855f7]">● Upload</span></p>
          </div>
          <div className="mt-4 h-64" aria-label="Live throughput chart">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2c4a" />
                  <XAxis dataKey="t" tick={{ fill: "#94a3b8", fontSize: 12 }} label={{ value: "ms", position: "insideBottomRight", fill: "#94a3b8" }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} label={{ value: unit === "MBps" ? "MB/s" : "Mbps", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
                  <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)} ${unit === "MBps" ? "MB/s" : "Mbps"}`, name]} contentStyle={{ background: "#101a30", border: "1px solid #1e2c4a", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="download" name="Download" stroke="#00a8ff" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="upload" name="Upload" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg text-sm np-muted" style={{ background: "var(--np-elevated)" }}>
                No samples yet — start a test to see live throughput.
              </div>
            )}
          </div>
          <p className="mt-2 text-xs np-muted">Chart shows only samples actually measured in this run. No artificial samples are generated.</p>
        </section>

        <section className="np-card p-5 xl:col-span-4" aria-label="Live test log">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Live test log</h2>
            <StatusBadge tone={running ? "warn" : result ? "ok" : "neutral"}>{running ? "Testing" : result ? "Testing completed" : "Idle"}</StatusBadge>
          </div>
          {log.length === 0 ? (
            <p className="mt-4 text-sm np-muted">No log entries yet. Start a test to see live status messages.</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {log.map((e, i) => (
                <li key={i} className="flex gap-2"><span className="np-muted tabular-nums">{e.time}</span><span>{e.text}</span></li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Row 4: test summary (last result) */}
      {result ? (
        <section className="np-card p-6" aria-label="Test result">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Test Summary (Last Result)</h2>
            <p className="text-sm np-muted">{new Date(result.timestamp).toLocaleString()} · Duration {durationSec ?? "—"} s</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Download", formatSpeed(result.downloadMbps, unit)],
              ["Upload", formatSpeed(result.uploadMbps, unit)],
              ["Ping (Idle)", `${result.idleLatencyMs} ms`],
              ["Download latency", `${result.downloadLatencyMs} ms`],
              ["Upload latency", `${result.uploadLatencyMs} ms`],
              ["Jitter", `${result.jitterMs} ms (max ${result.maxJitterMs} ms)`],
              ["Packet loss", `${result.httpRequestLossPercent}% — HTTP request loss, not ICMP`],
              ["ISP", result.isp ?? "unknown"],
              ["Server", result.server],
              ["Public IP", hideIp ? "hidden by user" : (result.publicIp ?? "unknown")],
              ["Test ID", result.id],
            ].map(([k, v]) => (
              <div key={k} className="np-elevated p-3">
                <dt className="text-xs np-muted">{k}</dt>
                <dd className="mt-0.5 break-all font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="no-print mt-4 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hideIp} onChange={(e) => setHideIp(e.target.checked)} /> Hide public IP when sharing
            </label>
            <button onClick={share} className="rounded-full bg-[#2563ff] px-4 py-2 text-sm text-white">Generate share link</button>
            <button onClick={() => downloadFile(JSON.stringify(result, null, 2), `${result.id}.json`, "application/json")} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Export JSON</button>
            <button onClick={() => downloadFile(toCsv([result], unit), `${result.id}.csv`, "text/csv")} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Export CSV</button>
            <button onClick={() => downloadFile(toTxt({ ...result, publicIp: hideIp ? undefined : result.publicIp }, unit), `${result.id}.txt`, "text/plain")} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Export TXT</button>
            <button onClick={printReport} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Print report</button>
          </div>
          {shareLink && (
            <p className="mt-3 break-all text-sm">Share link: <a className="text-[#00a8ff] underline" href={shareLink}>{shareLink}</a></p>
          )}
          <p className="mt-3 text-xs np-muted">Sharing is fragment-encoded (no server-side result store). Anyone with the link can read the payload in the fragment.</p>
        </section>
      ) : (
        <section className="np-card border-dashed p-6 text-center text-sm np-muted" aria-label="Empty result state">
          No test result yet. Press START TEST to measure your connection.
        </section>
      )}
    </div>
  );
}
