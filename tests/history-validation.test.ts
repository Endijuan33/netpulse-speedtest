import { describe, expect, it } from "vitest";
import { validateResults } from "@/lib/history";

const base = {
  id: "np-1",
  timestamp: "2026-10-27T10:00:00.000Z",
  downloadMbps: 100,
  uploadMbps: 20,
  idleLatencyMs: 15,
  downloadLatencyMs: 20,
  uploadLatencyMs: 22,
  jitterMs: 2,
  maxJitterMs: 5,
  httpRequestLossPercent: 0,
  server: "origin",
  isp: "Test ISP",
};

describe("validateResults (IndexedDB integrity)", () => {
  it("keeps valid records, newest first", () => {
    const out = validateResults([
      { ...base, id: "np-old", timestamp: "2026-10-26T10:00:00.000Z" },
      base,
    ]);
    expect(out.map((r) => r.id)).toEqual(["np-1", "np-old"]);
  });
  it("drops records that fail schema validation (never rendered as data)", () => {
    const out = validateResults([base, { ...base, id: "np-bad", downloadMbps: -5 }, { id: "np-broken" }]);
    expect(out.map((r) => r.id)).toEqual(["np-1"]);
  });
  it("dedupes duplicate ids, keeping the first", () => {
    const out = validateResults([base, { ...base, downloadMbps: 999 }]);
    expect(out).toHaveLength(1);
    expect(out.at(0)).toMatchObject({ downloadMbps: 100 });
  });
  it("keeps legacy-shaped records that still satisfy the schema (no silent erase)", () => {
    // A record saved before hideIp existed: schema default fills it.
    const legacy = { ...base };
    const out = validateResults([legacy]);
    expect(out).toHaveLength(1);
    expect(out.at(0)).toMatchObject({ id: "np-1", hideIp: false });
  });
});

