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
import { runSpeedTest, type LiveSample, type Phase } from "@/lib/speedtest";
import {
  formatSpeed,
  readSpeedUnit,
  storeSpeedUnit,
  type SpeedUnit,
} from "@/lib/units";
import type { SpeedResult } from "@/lib/validation";
import { saveResult, toCsv, toTxt } from "@/lib/history";
import { Loader2 } from "lucide-react";

interface NetworkInfo {
  ip?: string | null;
  isp?: string | null;
  city?: string | null;
  country?: string | null;
  unavailable?: string[];
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

export default function Dashboard() {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(0);
  const [dlSamples, setDlSamples] = useState<LiveSample[]>([]);
  const [ulSamples, setUlSamples] = useState<LiveSample[]>([]);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hideIp, setHideIp] = useState(false);
  const [unit, setUnit] = useState<SpeedUnit>("Mbps");
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

  useEffect(() => {
    fetch("/api/network-info")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((j: NetworkInfo) => setInfo(j))
      .catch(() => setInfoError(true));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = useCallback(async () => {
    // Abort any previous run before starting a new one — no race conditions.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    setShareLink(null);
    setDlSamples([]);
    setUlSamples([]);
    setCurrent(0);
    setElapsed(0);
    setProgress(0);
    startRef.current = Date.now();
    // Timer is local to this run: the old shared timerRef meant a second
    // start's finally() cleared the new run's interval and froze Elapsed.
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
      // History saving is silent in production (round 3, issue 6): the
      // result is still listed on /history, but no internal toast is shown.
      try {
        await saveResult(full);
      } catch {
        /* history is best-effort; the result cards still show */
      }
      // Needle reset (round 3, issue 5): the live current value returns to
      // zero and the gauge (which shows 0 whenever not running) animates
      // back to idle. The result itself is NOT erased — it stays in the
      // result cards below.
      setCurrent(0);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError")
        setToast("Test cancelled.");
      else setError("Test failed. Check your connection and try again.");
    } finally {
      setRunning(false);
      setPhase(null);
      setCurrent(0);
      clearInterval(timer);
      if (timerRef.current === timer) timerRef.current = null;
    }
  }, [hideIp]);

  const cancel = () => controllerRef.current?.abort();

  const printReport = () => {
    // Print in a dedicated tab, never window.print() on the dashboard:
    // a native print dialog that hangs (seen in automated browsers) used to
    // freeze the dashboard tab itself. The print tab auto-prints, and if its
    // dialog hangs, only that tab is affected; the dashboard stays usable.
    if (!result) return;
    const win = window.open(`/print/${result.id}`, "_blank", "noopener");
    if (!win)
      setToast(
        "Popup blocked — allow popups for this site, then try Print report again.",
      );
  };

  const share = async () => {
    if (!result) return;
    // Strip nulls (e.g. an ISP of null from older stored results): the share
    // schema accepts strings or absence, never null — null used to 400 here.
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

  const rawChartData =
    phase === "Measuring upload" ||
    (result && ulSamples.length > 0 && dlSamples.length > 0 && phase === null)
      ? ulSamples
      : dlSamples;
  // Chart values follow the selected unit; canonical samples stay in Mbps.
  const chartData =
    unit === "MBps"
      ? rawChartData.map((s) => ({ ...s, mbps: s.mbps / 8 }))
      : rawChartData;
  // Gauge shows the live value while running and animates back to idle (0)
  // on completion or cancel — never the frozen final value (round 3, issue 5).
  const gaugeValue = running ? current : 0;

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
        aria-label="Speedtest"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Network Speedtest</h1>
            <p
              className="text-sm text-gray-500 dark:text-gray-400"
              role="status"
              aria-live="polite"
            >
              {infoError
                ? "Network info unavailable — test still works."
                : info
                  ? `${info.ip ?? "IP unknown"} · ${info.isp ?? "ISP unknown"} · ${info.city ?? ""} ${info.country ?? ""}`.trim()
                  : "Detecting network…"}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connection status: {running ? "Testing…" : "Ready"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <SpeedUnitToggle unit={unit} onChange={changeUnit} />
            {!running ? (
              <button
                onClick={start}
                className="rounded-full bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                START TEST
              </button>
            ) : (
              <button
                onClick={cancel}
                className="rounded-full bg-red-600 px-8 py-3 font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Cancel Test
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <Gauge
            value={gaugeValue}
            unit={unit}
            label={
              running && phase === "Measuring upload" ? "Upload" : "Download"
            }
          />
          <p
            className="mt-2 text-center text-sm text-gray-500"
            aria-live="polite"
          >
            Current: {formatSpeed(current, unit)} · Elapsed: {elapsed}s
          </p>
        </div>

        {running && (
          <div className="mt-6" aria-live="polite">
            <ol
              className="flex flex-wrap gap-2 text-xs"
              aria-label="Test phases"
            >
              {PHASES.map((p) => (
                <li
                  key={p}
                  className={`rounded-full px-2 py-1 ${phase === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                >
                  {p}
                </li>
              ))}
            </ol>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Test progress"
            >
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{" "}
              {phase}…
            </p>
          </div>
        )}

        {error && (
          <p
            className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        {toast && (
          <p
            className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
            role="status"
          >
            {toast}
          </p>
        )}

        <div className="mt-6 h-56" aria-label="Live speed chart">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  label={{ value: "ms", position: "insideBottomRight" }}
                />
                <YAxis
                  label={{
                    value: unit === "MBps" ? "MB/s" : "Mbps",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip
                  formatter={(v) => [
                    `${Number(v).toFixed(1)} ${unit === "MBps" ? "MB/s" : "Mbps"}`,
                    "Speed",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="mbps"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md bg-gray-100 text-sm text-gray-500 dark:bg-gray-800">
              No samples yet — start a test to see live throughput.
            </div>
          )}
        </div>
      </section>

      {result ? (
        <section
          className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
          aria-label="Test result"
        >
          <h2 className="text-xl font-bold">Test Result</h2>
          <p className="text-sm text-gray-500">
            ID: {result.id} · {new Date(result.timestamp).toLocaleString()} ·
            Server: {result.server}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Download", formatSpeed(result.downloadMbps, unit)],
              ["Upload", formatSpeed(result.uploadMbps, unit)],
              ["Idle latency (HTTP)", `${result.idleLatencyMs} ms`],
              ["Download latency", `${result.downloadLatencyMs} ms`],
              ["Upload latency", `${result.uploadLatencyMs} ms`],
              [
                "Jitter (mean abs. successive diff.)",
                `${result.jitterMs} ms (max ${result.maxJitterMs} ms)`,
              ],
              [
                "HTTP request loss",
                `${result.httpRequestLossPercent}% — not ICMP packet loss`,
              ],
              ["ISP", result.isp ?? "unknown"],
              [
                "Public IP",
                hideIp ? "hidden by user" : (result.publicIp ?? "unknown"),
              ],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
              >
                <dt className="text-xs text-gray-500">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="no-print mt-4 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hideIp}
                onChange={(e) => setHideIp(e.target.checked)}
              />{" "}
              Hide public IP when sharing
            </label>
            <button
              onClick={share}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white"
            >
              Generate share link
            </button>
            <button
              onClick={() =>
                downloadFile(
                  JSON.stringify(result, null, 2),
                  `${result.id}.json`,
                  "application/json",
                )
              }
              className="rounded-md border px-4 py-2 text-sm"
            >
              Export JSON
            </button>
            <button
              onClick={() =>
                downloadFile(
                  toCsv([result], unit),
                  `${result.id}.csv`,
                  "text/csv",
                )
              }
              className="rounded-md border px-4 py-2 text-sm"
            >
              Export CSV
            </button>
            <button
              onClick={() =>
                downloadFile(
                  toTxt(
                    {
                      ...result,
                      publicIp: hideIp ? undefined : result.publicIp,
                    },
                    unit,
                  ),
                  `${result.id}.txt`,
                  "text/plain",
                )
              }
              className="rounded-md border px-4 py-2 text-sm"
            >
              Export TXT
            </button>
            <button
              onClick={printReport}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Print report
            </button>
          </div>
          {shareLink && (
            <p className="mt-3 break-all text-sm">
              Share link:{" "}
              <a className="text-blue-600 underline" href={shareLink}>
                {shareLink}
              </a>
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Sharing is fragment-encoded (no server-side result store). Anyone
            with the link can read the payload in the fragment.
          </p>
        </section>
      ) : (
        <section
          className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700"
          aria-label="Empty result state"
        >
          No test result yet. Press START TEST to measure your connection.
        </section>
      )}
    </div>
  );
}
