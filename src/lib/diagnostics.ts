import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

export interface ResolverResult {
  resolver: string;
  server: string;
  host: string;
  /** First resolved IPv4 address, or null when resolution failed. */
  address: string | null;
  timeMs: number | null;
  error: string | null;
}

export interface HostTiming {
  host: string;
  /** Address actually connected to (system resolver result). */
  resolvedIp: string | null;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  httpMs: number | null;
  status: number | null;
  contentType: string | null;
  contentLength: string | null;
  redirectLocation: string | null;
  error: string | null;
}

const RESOLVERS = [
  { name: "Cloudflare DNS", server: "1.1.1.1" },
  { name: "Google DNS", server: "8.8.8.8" },
  { name: "Quad9 DNS", server: "9.9.9.9" },
  { name: "OpenDNS", server: "208.67.222.222" },
];

/**
 * Race a promise against a timeout. Without this, a hung DNS resolver
 * (e.g. UDP blocked in a sandbox) hangs the whole diagnostics endpoint
 * forever — the UI sat on "Running…" for 60 s+ with no error at all.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T } | { ms: null; value: null; error: string }> {
  const start = performance.now();
  try {
    const value = await fn();
    return { ms: performance.now() - start, value };
  } catch (err) {
    return { ms: null, value: null, error: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function resolveWithResolvers(host: string): Promise<ResolverResult[]> {
  const results: ResolverResult[] = [];
  for (const r of RESOLVERS) {
    const resolver = new dns.Resolver();
    resolver.setServers([r.server]);
    const out = await timed(() =>
      withTimeout(resolver.resolve4(host), 4000, `${r.name} DNS`),
    );
    results.push({
      resolver: r.name,
      server: r.server,
      host,
      address: "error" in out ? null : (out.value[0] ?? null),
      timeMs: out.ms === null ? null : Math.round(out.ms * 100) / 100,
      error: "error" in out ? out.error : null,
    });
  }
  const sys = await timed(() => withTimeout(dns.lookup(host, { all: true }), 4000, "System DNS"));
  results.push({
    resolver: "System resolver",
    server: "system",
    host,
    address: "error" in sys ? null : (sys.value[0]?.address ?? null),
    timeMs: sys.ms === null ? null : Math.round(sys.ms * 100) / 100,
    error: "error" in sys ? sys.error : null,
  });
  return results;
}

export async function measureHost(host: string, port = 443): Promise<HostTiming> {
  const dnsOut = await timed(() => withTimeout(dns.lookup(host), 4000, "DNS lookup"));
  if (dnsOut.ms === null) {
    return { host, resolvedIp: null, dnsMs: null, tcpMs: null, tlsMs: null, httpMs: null, status: null, contentType: null, contentLength: null, redirectLocation: null, error: "error" in dnsOut ? dnsOut.error : "dns failed" };
  }
  const address = dnsOut.value.address;
  const tcpOut = await timed(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, address);
        socket.once("connect", () => { socket.end(); resolve(); });
        socket.once("error", reject);
        socket.setTimeout(5000, () => { socket.destroy(new Error("tcp timeout")); });
      }),
  );
  if (tcpOut.ms === null) {
    return { host, resolvedIp: address, dnsMs: Math.round(dnsOut.ms * 100) / 100, tcpMs: null, tlsMs: null, httpMs: null, status: null, contentType: null, contentLength: null, redirectLocation: null, error: "error" in tcpOut ? tcpOut.error : "tcp failed" };
  }
  const tlsOut = await timed(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = tls.connect(port, address, { servername: host });
        socket.once("secureConnect", () => { socket.end(); resolve(); });
        socket.once("error", reject);
        socket.setTimeout(5000, () => { socket.destroy(new Error("tls timeout")); });
      }),
  );
  const httpStart = performance.now();
  let status: number | null = null;
  let httpError: string | null = null;
  let contentType: string | null = null;
  let contentLength: string | null = null;
  let redirectLocation: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    // redirect: manual — a redirect target is reported, never followed, so
    // a redirect to a private address cannot turn this into a proxy.
    const res = await fetch(`https://${host}/`, { method: "HEAD", signal: controller.signal, redirect: "manual" });
    clearTimeout(timer);
    status = res.status;
    contentType = res.headers.get("content-type");
    contentLength = res.headers.get("content-length");
    redirectLocation = res.headers.get("location");
    await res.arrayBuffer().catch(() => undefined);
  } catch (err) {
    httpError = err instanceof Error ? err.message : "http failed";
  }
  return {
    host,
    resolvedIp: address,
    dnsMs: Math.round(dnsOut.ms * 100) / 100,
    tcpMs: Math.round(tcpOut.ms * 100) / 100,
    tlsMs: tlsOut.ms === null ? null : Math.round(tlsOut.ms * 100) / 100,
    httpMs: httpError ? null : Math.round((performance.now() - httpStart) * 100) / 100,
    status,
    contentType,
    contentLength,
    redirectLocation,
    error: httpError ?? ("error" in tlsOut ? tlsOut.error : null),
  };
}
