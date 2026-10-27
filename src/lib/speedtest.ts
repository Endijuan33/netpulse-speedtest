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

/**
 * Fill a buffer with cryptographically random bytes, in chunks.
 * Web Crypto's getRandomValues() throws QuotaExceededError for any single
 * call over 65,536 bytes — a single 512 KiB call (the old upload code) threw
 * on every attempt, outside the fetch try/catch, so every upload worker died
 * instantly and the test silently reported 0 Mbps. Chunking fixes it.
 */
export function fillRandomBytes(buf: Uint8Array): void {
  const CHUNK = 65536;
  for (let offset = 0; offset < buf.byteLength; offset += CHUNK) {
    crypto.getRandomValues(
      buf.subarray(offset, Math.min(buf.byteLength, offset + CHUNK)),
    );
  }
}

/** Ping loop that runs for the duration of a transfer phase: true loaded latency. */
async function collectLoadedSamples(
  signal: AbortSignal,
  durationMs: number,
  samples: number[],
): Promise<void> {
  const start = performance.now();
  while (!signal.aborted && performance.now() - start < durationMs) {
    const v = await pingOnce(signal);
    if (v !== null) samples.push(v);
    if (signal.aborted) break;
    await sleep(1000);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Response> {
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
    const res = await fetchWithTimeout(
      `/api/ping?t=${Date.now()}`,
      { cache: "no-store" },
      5000,
      signal,
    );
    if (!res.ok) return null;
    await res.arrayBuffer();
    return performance.now() - start;
  } catch {
    return null;
  }
}

async function pingSamples(
  count: number,
  signal: AbortSignal,
): Promise<{ samples: number[]; failed: number }> {
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
 * Download measurement — long streams, not small chunks (round 3 fix).
 *
 * Why the old engine capped near ~20 Mbps on the user's phone (Ookla/Google
 * on the same phone: 200+ Mbps): it fetched sequential 1–32 MB chunks with
 * 4 workers, so every chunk paid a full round trip to the Vercel region
 * (iad1, US East) plus a fresh serverless invocation, and the chunk size was
 * scaled from a cumulative average that stayed low while the link warmed
 * up. Measured from this sandbox: a single Vercel download stream runs at
 * ~19 Mbps, 4 parallel streams aggregate to ~51 Mbps — i.e. per-stream
 * throughput is the scarce resource, and chunked requests waste it on
 * round trips. Server-side random-byte generation is NOT the bottleneck
 * (measured ~1.8 GB/s locally), so it was left as per-chunk crypto bytes.
 *
 * New design: 8 concurrent workers (documented cap), each opening ONE
 * 100 MB stream (the route's validated maximum) and reading until the
 * window ends, then cancelling the reader. Only 8 requests per test, so
 * the download rate limit (60/min) is never the constraint and round-trip
 * overhead is paid once. The first 1000 ms (500 ms in short mode) is a
 * warmup: bytes arriving then are discarded from the result, so TCP
 * slow-start and function cold start do not drag the average down.
 * Throughput = counted bytes / (duration - warmup), from bytes actually
 * read from the response bodies. A chunk straddling the warmup boundary is
 * counted wholly on the side its read completed — a documented, sub-chunk
 * approximation, not a fudge of the total.
 *
 * Honest geography caveat (also shown in the UI): the test server is the
 * Vercel deployment region (iad1, US East) while Ookla/Google used a
 * Jakarta-local server for this user, so some gap vs Ookla is RTT, not
 * engine — but the engine no longer adds its own ~20 Mbps ceiling on top.
 */
async function measureDownload(
  signal: AbortSignal,
  onSample: (s: LiveSample, mbps: number) => void,
  short: boolean,
): Promise<{ mbps: number; loadedSamples: number[] }> {
  const durationMs = short ? 3000 : 10000;
  const warmupMs = short ? 500 : 1000;
  const start = performance.now();
  const warmupEnd = start + warmupMs;
  let countedBytes = 0;
  let lastBytes = 0;
  let lastTime = start;
  let failures = 0;
  let successes = 0;
  const loadedSamples: number[] = [];
  const loaded = collectLoadedSamples(signal, durationMs, loadedSamples);
  const readers: { cancel: () => Promise<void> }[] = [];
  // Watchdog: a stalled stream must not hang the test past the window —
  // cancel every reader shortly after the window ends.
  const watchdog = (async () => {
    await sleep(durationMs + 1000);
    await Promise.allSettled(
      readers.map((r) => r.cancel().catch(() => undefined)),
    );
  })();
  const workers: Promise<void>[] = [];
  for (let w = 0; w < 8; w++) {
    workers.push(
      (async () => {
        try {
          const res = await fetchWithTimeout(
            `/api/speedtest/download?bytes=${100 * 1024 * 1024}`,
            { cache: "no-store" },
            15000,
            signal,
          );
          if (!res.ok || !res.body) {
            failures += 1;
            return;
          }
          successes += 1;
          const reader = res.body.getReader();
          readers.push(reader);
          try {
            for (;;) {
              if (signal.aborted || performance.now() - start >= durationMs)
                break;
              const { done, value } = await reader.read();
              if (done) break;
              // Warmup bytes are read (they warm the connection) but never counted.
              if (performance.now() >= warmupEnd)
                countedBytes += value.byteLength;
              if (signal.aborted) break;
            }
          } finally {
            try {
              await reader.cancel();
            } catch {
              /* reader already closed */
            }
          }
        } catch {
          failures += 1;
        }
      })(),
    );
  }
  const sampler = (async () => {
    while (!signal.aborted && performance.now() - start < durationMs) {
      await sleep(250);
      const now = performance.now();
      const mbps = bytesToMbps(countedBytes - lastBytes, now - lastTime);
      lastBytes = countedBytes;
      lastTime = now;
      const elapsed = Math.max(1, now - warmupEnd);
      onSample(
        { t: Math.round(now - start), mbps: Math.round(mbps * 100) / 100 },
        bytesToMbps(countedBytes, elapsed),
      );
    }
  })();
  await Promise.allSettled([...workers, sampler, loaded, watchdog]);
  if (
    countedBytes === 0 &&
    failures > 0 &&
    successes === 0 &&
    !signal.aborted
  ) {
    throw new Error("Download failed: no data was received.");
  }
  return {
    mbps: bytesToMbps(countedBytes, durationMs - warmupMs),
    loadedSamples,
  };
}

/** Upload measurement: real random payloads POSTed and counted server-side. */
async function measureUpload(
  signal: AbortSignal,
  onSample: (s: LiveSample, mbps: number) => void,
  short: boolean,
): Promise<{ mbps: number; loadedSamples: number[] }> {
  const durationMs = short ? 3000 : 10000;
  const start = performance.now();
  let totalBytes = 0;
  let failures = 0;
  let successes = 0;
  const loadedSamples: number[] = [];
  const loaded = collectLoadedSamples(signal, durationMs, loadedSamples);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < 3; w++) {
    workers.push(
      (async () => {
        while (!signal.aborted && performance.now() - start < durationMs) {
          const buf = new Uint8Array(512 * 1024);
          try {
            fillRandomBytes(buf);
            const res = await fetchWithTimeout(
              "/api/speedtest/upload",
              {
                method: "POST",
                body: buf as BodyInit,
                headers: { "Content-Type": "application/octet-stream" },
              },
              15000,
              signal,
            );
            if (!res.ok) {
              failures += 1;
              break;
            }
            const json = (await res.json()) as { bytesReceived?: number };
            if (typeof json.bytesReceived !== "number") {
              failures += 1;
              break;
            }
            totalBytes += json.bytesReceived;
            successes += 1;
          } catch {
            failures += 1;
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
      onSample(
        { t: Math.round(now - start), mbps: Math.round(mbps * 100) / 100 },
        bytesToMbps(totalBytes, now - start),
      );
    }
  })();
  await Promise.allSettled([...workers, sampler, loaded]);
  if (totalBytes === 0 && failures > 0 && successes === 0 && !signal.aborted) {
    throw new Error("Upload failed: no data was accepted by the server.");
  }
  return {
    mbps: bytesToMbps(totalBytes, performance.now() - start),
    loadedSamples,
  };
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
): Promise<{
  result: Omit<SpeedResult, "id" | "timestamp" | "hideIp">;
  downloadSamples: LiveSample[];
  uploadSamples: LiveSample[];
}> {
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
    if (res.ok) {
      const raw = (await res.json()) as {
        ip?: string | null;
        isp?: string | null;
      };
      // Normalize nulls to undefined: the API returns null for unknown
      // fields, but SpeedResult's Zod schema rejects null — a null ISP used
      // to make /api/share fail validation ("Sharing failed") on local runs.
      networkInfo = { ip: raw.ip ?? undefined, isp: raw.isp ?? undefined };
    }
  } catch {
    /* network info is best-effort; test continues */
  }
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
  } catch {
    /* fall through with origin label */
  }
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
  const download = await measureDownload(
    signal,
    (s, cur) => {
      downloadSamples.push(s);
      events.onDownloadSample(s, cur);
    },
    short,
  );
  throwIfAborted();

  events.onPhase("Measuring upload");
  events.onProgress(58);
  const upload = await measureUpload(
    signal,
    (s, cur) => {
      uploadSamples.push(s);
      events.onUploadSample(s, cur);
    },
    short,
  );
  throwIfAborted();

  events.onPhase("Measuring loaded latency");
  events.onProgress(78);
  // Loaded latency is NOT re-measured here and duplicated: the samples above
  // were collected by pinging concurrently with each transfer phase (same
  // HTTP timing method as idle latency, so the comparison is apples-to-
  // apples). This phase finalizes those two independent sample sets. If a
  // phase somehow collected no sample (e.g. every ping failed), fall back to
  // a short post-load ping set rather than reporting a fabricated 0.
  const downloadLatency =
    download.loadedSamples.length > 0
      ? summarize(download.loadedSamples).mean
      : summarize((await pingSamples(3, signal)).samples).mean;
  const uploadLatency =
    upload.loadedSamples.length > 0
      ? summarize(upload.loadedSamples).mean
      : summarize((await pingSamples(3, signal)).samples).mean;
  throwIfAborted();

  events.onPhase("Running diagnostics");
  events.onProgress(88);
  try {
    await fetchWithTimeout("/api/diagnostics", {}, 8000, signal).catch(
      () => undefined,
    );
  } catch {
    /* diagnostics are informational */
  }
  throwIfAborted();

  events.onPhase("Generating report");
  events.onProgress(100);

  return {
    result: {
      downloadMbps: Math.round(download.mbps * 100) / 100,
      uploadMbps: Math.round(upload.mbps * 100) / 100,
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
