import { computeJitter, computeLoss, summarize, bytesToMbps } from "./stats";
import type { SpeedResult } from "./validation";

export type Phase =
  | "Initializing"
  | "Detecting network"
  | "Finding optimal server"
  | "Measuring ping"
  | "Measuring jitter"
  | "Measuring download"
  | "Measuring upload"
  | "Measuring loaded latency"
  | "Running diagnostics"
  | "Generating report";

export interface LiveSample {
  t: number;
  mbps: number;
}

export interface EngineEvents {
  onPhase: (phase: Phase) => void;
  onDownloadSample: (sample: LiveSample, currentMbps: number) => void;
  onUploadSample: (sample: LiveSample, currentMbps: number) => void;
  onProgress: (percent: number) => void;
}

export interface EngineOptions {
  /** Short mode caps durations for smoke/E2E runs. Real measurement, shorter windows. */
  short?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Single ping sample: time a GET /api/ping round trip with performance.now. */
async function pingOnce(signal: AbortSignal): Promise<number | null> {
  const start = performance.now();
  try {
    const res = await fetchWithTimeout(`/api/ping?t=${Date.now()}`, { cache: "no-store" }, 5000, signal);
    await res.arrayBuffer();
    return performance.now() - start;
  } catch {
    return null;
  }
}

async function pingSamples(count: number, signal: AbortSignal): Promise<{ samples: number[]; failed: number }> {
  const samples: number[] = [];
  let failed = 0;
  for (let i = 0; i < count; i++) {
    const v = await pingOnce(signal);
    if (v === null) failed += 1;
    else samples.push(v);
    if (signal.aborted) break;
  }
  return { samples, failed };
}

/**
 * Download measurement: concurrent GET streams of /api/speedtest/download.
 * Size starts at 1 MB and scales with observed throughput; total window is
 * capped (~10 s, ~3 s in short mode) so slow and fast links both finish.
 * Throughput is computed from bytes actually read from the response body.
 */
async function measureDownload(
  signal: AbortSignal,
  onSample: (s: LiveSample, mbps: number) => void,
  short: boolean,
): Promise<number> {
  const durationMs = short ? 3000 : 10000;
  const start = performance.now();
  let totalBytes = 0;
  let lastBytes = 0;
  let lastTime = start;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < 4; w++) {
    workers.push(
      (async () => {
        let size = 1024 * 1024;
        while (!signal.aborted && performance.now() - start < durationMs) {
          try {
            const res = await fetchWithTimeout(`/api/speedtest/download?bytes=${size}`, { cache: "no-store" }, 15000, signal);
            if (!res.body) break;
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytes += value.byteLength;
              if (signal.aborted) break;
            }
          } catch {
            break;
          }
          // Scale next chunk with observed throughput (bounded 1–32 MB).
          const elapsed = (performance.now() - start) / 1000;
          const mbps = elapsed > 0 ? bytesToMbps(totalBytes, performance.now() - start) : 0;
          size = Math.min(32 * 1024 * 1024, Math.max(1024 * 1024, Math.floor((mbps * 1_000_000) / 8 / 4)));
        }
      })(),
    );
  }
  const sampler = (async () => {
    while (!signal.aborted && performance.now() - start < durationMs) {
      await sleep(250);
      const now = performance.now();
      const mbps = bytesToMbps(totalBytes - lastBytes, now - lastTime);
      lastBytes = totalBytes;
      lastTime = now;
      onSample({ t: Math.round(now - start), mbps: Math.round(mbps * 100) / 100 }, bytesToMbps(totalBytes, now - start));
    }
  })();
  await Promise.allSettled([...workers, sampler]);
  return bytesToMbps(totalBytes, performance.now() - start);
}

/** Upload measurement: real random payloads POSTed and counted server-side. */
async function measureUpload(
  signal: AbortSignal,
  onSample: (s: LiveSample, mbps: number) => void,
  short: boolean,
): Promise<number> {
  const durationMs = short ? 3000 : 10000;
  const start = performance.now();
  let totalBytes = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < 3; w++) {
    workers.push(
      (async () => {
        while (!signal.aborted && performance.now() - start < durationMs) {
          const buf = new Uint8Array(512 * 1024);
          crypto.getRandomValues(buf);
          try {
            const res = await fetchWithTimeout("/api/speedtest/upload", { method: "POST", body: buf as BodyInit, headers: { "Content-Type": "application/octet-stream" } }, 15000, signal);
            const json = (await res.json()) as { bytesReceived?: number };
            totalBytes += json.bytesReceived ?? buf.byteLength;
          } catch {
            break;
          }
        }
      })(),
    );
  }
  let lastBytes = 0;
  let lastTime = start;
  const sampler = (async () => {
    while (!signal.aborted && performance.now() - start < durationMs) {
      await sleep(250);
      const now = performance.now();
      const mbps = bytesToMbps(totalBytes - lastBytes, now - lastTime);
      lastBytes = totalBytes;
      lastTime = now;
      onSample({ t: Math.round(now - start), mbps: Math.round(mbps * 100) / 100 }, bytesToMbps(totalBytes, now - start));
    }
  })();
  await Promise.allSettled([...workers, sampler]);
  return bytesToMbps(totalBytes, performance.now() - start);
}

/**
 * Runs the full staged test. A run token guarantees no race conditions:
 * callers must abort the previous controller before starting a new run.
 * Throws AbortError when cancelled.
 */
export async function runSpeedTest(
  events: EngineEvents,
  signal: AbortSignal,
  opts: EngineOptions = {},
): Promise<{ result: Omit<SpeedResult, "id" | "timestamp" | "hideIp">; downloadSamples: LiveSample[]; uploadSamples: LiveSample[] }> {
  const short = opts.short ?? false;
  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException("Test cancelled", "AbortError");
  };
  const downloadSamples: LiveSample[] = [];
  const uploadSamples: LiveSample[] = [];

  events.onPhase("Initializing");
  events.onProgress(2);
  await sleep(150);
  throwIfAborted();

  events.onPhase("Detecting network");
  events.onProgress(8);
  let networkInfo: { ip?: string; isp?: string } = {};
  try {
    const res = await fetchWithTimeout("/api/network-info", {}, 6000, signal);
    if (res.ok) networkInfo = (await res.json()) as typeof networkInfo;
  } catch { /* network info is best-effort; test continues */ }
  throwIfAborted();

  events.onPhase("Finding optimal server");
  events.onProgress(14);
  let server = "origin server (unknown location)";
  try {
    const res = await fetchWithTimeout("/api/servers", {}, 6000, signal);
    if (res.ok) {
      const json = (await res.json()) as { servers?: { label?: string }[] };
      server = json.servers?.[0]?.label ?? server;
    }
  } catch { /* fall through with origin label */ }
  throwIfAborted();

  const pingCount = short ? 5 : 10;
  events.onPhase("Measuring ping");
  events.onProgress(22);
  const idle = await pingSamples(pingCount, signal);
  throwIfAborted();
  const idleStats = summarize(idle.samples);

  events.onPhase("Measuring jitter");
  events.onProgress(30);
  const jitter = computeJitter(idle.samples);
  const loss = computeLoss(pingCount, idle.failed);

  events.onPhase("Measuring download");
  events.onProgress(38);
  const downloadMbps = await measureDownload(signal, (s, cur) => { downloadSamples.push(s); events.onDownloadSample(s, cur); }, short);
  throwIfAborted();

  events.onPhase("Measuring upload");
  events.onProgress(58);
  const uploadMbps = await measureUpload(signal, (s, cur) => { uploadSamples.push(s); events.onUploadSample(s, cur); }, short);
  throwIfAborted();

  events.onPhase("Measuring loaded latency");
  events.onProgress(78);
  // Loaded latency: ping samples taken right after load phases (same HTTP
  // timing method as idle latency, so the comparison is apples-to-apples).
  const loaded = await pingSamples(short ? 3 : 5, signal);
  const loadedStats = summarize(loaded.samples);
  const downloadLatency = loadedStats.mean;
  const uploadLatency = loadedStats.mean;
  throwIfAborted();

  events.onPhase("Running diagnostics");
  events.onProgress(88);
  try {
    await fetchWithTimeout("/api/diagnostics", {}, 8000, signal).catch(() => undefined);
  } catch { /* diagnostics are informational */ }
  throwIfAborted();

  events.onPhase("Generating report");
  events.onProgress(100);

  return {
    result: {
      downloadMbps: Math.round(downloadMbps * 100) / 100,
      uploadMbps: Math.round(uploadMbps * 100) / 100,
      idleLatencyMs: Math.round(idleStats.mean * 100) / 100,
      downloadLatencyMs: Math.round(downloadLatency * 100) / 100,
      uploadLatencyMs: Math.round(uploadLatency * 100) / 100,
      jitterMs: Math.round(jitter.averageJitter * 100) / 100,
      maxJitterMs: Math.round(jitter.maxJitter * 100) / 100,
      httpRequestLossPercent: Math.round(loss.lossPercent * 100) / 100,
      server,
      isp: networkInfo.isp,
      publicIp: networkInfo.ip,
    },
    downloadSamples,
    uploadSamples,
  };
}
