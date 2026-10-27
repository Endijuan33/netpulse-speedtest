import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

export interface ResolverResult {
  resolver: string;
  server: string;
  host: string;
  timeMs: number | null;
  error: string | null;
}

export interface HostTiming {
  host: string;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  httpMs: number | null;
  status: number | null;
  error: string | null;
}

const RESOLVERS = [
  { name: "Cloudflare DNS", server: "1.1.1.1" },
  { name: "Google DNS", server: "8.8.8.8" },
  { name: "Quad9 DNS", server: "9.9.9.9" },
];

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
      resolver.resolve4(host).then((a) => a.length),
    );
    results.push({
      resolver: r.name,
      server: r.server,
      host,
      timeMs: out.ms === null ? null : Math.round(out.ms * 100) / 100,
      error: "error" in out ? out.error : null,
    });
  }
  const sys = await timed(() => dns.lookup(host, { all: true }));
  results.push({
    resolver: "System resolver",
    server: "system",
    host,
    timeMs: sys.ms === null ? null : Math.round(sys.ms * 100) / 100,
    error: "error" in sys ? sys.error : null,
  });
  return results;
}

export async function measureHost(host: string, port = 443): Promise<HostTiming> {
  const dnsOut = await timed(() => dns.lookup(host));
  if (dnsOut.ms === null) {
    return { host, dnsMs: null, tcpMs: null, tlsMs: null, httpMs: null, status: null, error: "error" in dnsOut ? dnsOut.error : "dns failed" };
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
    return { host, dnsMs: Math.round(dnsOut.ms * 100) / 100, tcpMs: null, tlsMs: null, httpMs: null, status: null, error: "error" in tcpOut ? tcpOut.error : "tcp failed" };
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
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${host}/`, { method: "HEAD", signal: controller.signal, redirect: "manual" });
    clearTimeout(timer);
    status = res.status;
    await res.arrayBuffer().catch(() => undefined);
  } catch (err) {
    httpError = err instanceof Error ? err.message : "http failed";
  }
  return {
    host,
    dnsMs: Math.round(dnsOut.ms * 100) / 100,
    tcpMs: Math.round(tcpOut.ms * 100) / 100,
    tlsMs: tlsOut.ms === null ? null : Math.round(tlsOut.ms * 100) / 100,
    httpMs: httpError ? null : Math.round((performance.now() - httpStart) * 100) / 100,
    status,
    error: httpError ?? ("error" in tlsOut ? tlsOut.error : null),
  };
}
