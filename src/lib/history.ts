import { speedResultSchema, type SpeedResult } from "./validation";
import type { SpeedUnit } from "./units";

/**
 * Validate + dedupe stored records (IndexedDB integrity): records that fail
 * schema validation are dropped (never rendered as invented data), and
 * duplicate ids keep only the first record with that id. The store schema itself is
 * unchanged (v1, keyPath id), so existing records migrate in place — no
 * silent erase, no schema bump required.
 */
export function validateResults(raw: unknown[]): SpeedResult[] {
  const seen = new Set<string>();
  const valid: SpeedResult[] = [];
  for (const item of raw) {
    const parsed = speedResultSchema.safeParse(item);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    valid.push(parsed.data);
  }
  return valid.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Minimal IndexedDB wrapper (no extra dependency) for test history. */
const DB_NAME = "netpulse";
const STORE = "results";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveResult(result: SpeedResult): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(result);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listResults(): Promise<SpeedResult[]> {
  const db = await openDb();
  const items = await new Promise<SpeedResult[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(validateResults(req.result as unknown[]));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function deleteResult(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getResult(id: string): Promise<SpeedResult | null> {
  const db = await openDb();
  const item = await new Promise<SpeedResult | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as SpeedResult | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item ?? null;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  results: SpeedResult[],
  unit: SpeedUnit = "Mbps",
): string {
  // CSV keeps canonical Mbps columns by default; when a display unit is
  // passed, the speed columns are converted and the header says so.
  const header =
    unit === "MBps"
      ? "id,timestamp,downloadMBps,uploadMBps,idleLatencyMs,jitterMs,httpRequestLossPercent,server,isp"
      : "id,timestamp,downloadMbps,uploadMbps,idleLatencyMs,jitterMs,httpRequestLossPercent,server,isp";
  const conv = (mbps: number) =>
    unit === "MBps" ? Math.round((mbps / 8) * 100) / 100 : mbps;
  const rows = results.map((r) =>
    [
      r.id,
      r.timestamp,
      conv(r.downloadMbps),
      conv(r.uploadMbps),
      r.idleLatencyMs,
      r.jitterMs,
      r.httpRequestLossPercent,
      r.server,
      r.isp ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function toTxt(r: SpeedResult, unit: SpeedUnit = "Mbps"): string {
  const dl =
    unit === "MBps"
      ? `${Math.round((r.downloadMbps / 8) * 100) / 100} MB/s`
      : `${r.downloadMbps} Mbps`;
  const ul =
    unit === "MBps"
      ? `${Math.round((r.uploadMbps / 8) * 100) / 100} MB/s`
      : `${r.uploadMbps} Mbps`;
  return [
    `NetPulse Test Report — ${r.id}`,
    `Timestamp: ${r.timestamp}`,
    `Download: ${dl}`,
    `Upload: ${ul}`,
    `Idle latency: ${r.idleLatencyMs} ms`,
    `Jitter: ${r.jitterMs} ms`,
    `HTTP request loss: ${r.httpRequestLossPercent}% (not ICMP packet loss)`,
    `Server: ${r.server}`,
    `ISP: ${r.isp ?? "unknown"}`,
    r.hideIp
      ? "Public IP: hidden by user"
      : `Public IP: ${r.publicIp ?? "unknown"}`,
  ].join("\n");
}
