import dns from "node:dns/promises";
import net from "node:net";

/** Hosts that may always be probed by the diagnostics endpoint. */
export const ALLOWED_DIAGNOSTIC_HOSTS = [
  "cloudflare.com",
  "google.com",
  "quad9.net",
  "one.one.one.one",
  "dns.google",
  "dns.quad9.net",
] as const;

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT shared space
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a === 0 || a >= 224) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("2001:db8:")) return true; // documentation range
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
  const mapped = lower.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1] ?? "";
    if (tail.includes(".")) return isPrivateOrReservedIp(tail);
    const groups = tail.split(":");
    if (groups.length === 2) {
      const hi = parseInt(groups[0] ?? "0", 16);
      const lo = parseInt(groups[1] ?? "0", 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isPrivateOrReservedIp(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
      }
    }
    return true;
  }
  return false;
}

/**
 * SSRF guard: only allowlisted hosts, or a syntactically valid public DNS
 * name whose resolved addresses are all public. Rejects localhost, private,
 * loopback, link-local and IP-literal hosts outright.
 */
export async function isAllowedDiagnosticHost(host: string): Promise<boolean> {
  const normalized = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(normalized) || normalized.includes("..")) return false;
  if (net.isIP(normalized) !== 0) return false; // IP literals are never allowed
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return false;
  if ((ALLOWED_DIAGNOSTIC_HOSTS as readonly string[]).includes(normalized)) return true;
  // Non-allowlisted names: resolve and require every address to be public.
  try {
    const addrs = await dns.lookup(normalized, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateOrReservedIp(a.address));
  } catch {
    return false;
  }
}
