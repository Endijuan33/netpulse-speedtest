import { describe, it, expect } from "vitest";
import { GET as health } from "../src/app/api/health/route";
import { GET as ping } from "../src/app/api/ping/route";
import { GET as download } from "../src/app/api/speedtest/download/route";
import { POST as upload } from "../src/app/api/speedtest/upload/route";
import { GET as diagnostics } from "../src/app/api/diagnostics/route";
import { GET as servers } from "../src/app/api/servers/route";
import { POST as share } from "../src/app/api/share/route";
import { isAllowedDiagnosticHost } from "../src/lib/ssrf";
import { isValidShareId } from "../src/lib/share";
import { speedResultSchema } from "../src/lib/validation";

const req = (url: string, init?: RequestInit) => new Request(url, init);

describe("api routes", () => {
  it("health returns ok", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe("ok");
  });
  it("ping returns ok with no-store", async () => {
    const res = await ping(req("http://localhost/api/ping"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
  it("download streams the requested byte count", async () => {
    const res = await download(req("http://localhost/api/speedtest/download?bytes=4096"));
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(4096);
  });
  it("download rejects oversized requests", async () => {
    const res = await download(req("http://localhost/api/speedtest/download?bytes=999999999"));
    expect(res.status).toBe(400);
  });
  it("upload counts bytes actually received", async () => {
    const res = await upload(req("http://localhost/api/speedtest/upload", { method: "POST", body: new Uint8Array(2048) }));
    expect(res.status).toBe(200);
    expect((await res.json() as { bytesReceived: number }).bytesReceived).toBe(2048);
  });
  it("servers returns only origin + labelled references", async () => {
    const res = await servers(req("http://localhost/api/servers"));
    const json = (await res.json()) as { servers: { type: string }[] };
    expect(json.servers.some((s) => s.type === "origin")).toBe(true);
    expect(json.servers.every((s) => ["origin", "reference"].includes(s.type))).toBe(true);
  });
  it("share returns a valid 24-hex id for a valid result", async () => {
    const result = {
      id: "np-test", timestamp: new Date().toISOString(), downloadMbps: 100, uploadMbps: 50,
      idleLatencyMs: 10, downloadLatencyMs: 12, uploadLatencyMs: 13, jitterMs: 1, maxJitterMs: 2,
      httpRequestLossPercent: 0, server: "origin", hideIp: true,
    };
    expect(speedResultSchema.safeParse(result).success).toBe(true);
    const res = await share(req("http://localhost/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result }) }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string };
    expect(isValidShareId(json.id)).toBe(true);
  });
  it("share rejects invalid payloads", async () => {
    const res = await share(req("http://localhost/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result: { id: 1 } }) }));
    expect(res.status).toBe(400);
  });
});

describe("diagnostics SSRF guard", () => {
  it("rejects localhost, private and loopback hosts", async () => {
    await expect(isAllowedDiagnosticHost("localhost")).resolves.toBe(false);
    await expect(isAllowedDiagnosticHost("127.0.0.1")).resolves.toBe(false);
    await expect(isAllowedDiagnosticHost("10.0.0.5")).resolves.toBe(false);
    await expect(isAllowedDiagnosticHost("192.168.1.1")).resolves.toBe(false);
  });
  it("allows allowlisted hosts", async () => {
    await expect(isAllowedDiagnosticHost("cloudflare.com")).resolves.toBe(true);
  });
  it("diagnostics endpoint rejects localhost with 403", async () => {
    const res = await diagnostics(req("http://localhost/api/diagnostics?host=localhost"));
    expect(res.status).toBe(403);
  });
});
