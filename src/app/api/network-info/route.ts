import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { isPrivateOrReservedIp } from "@/lib/ssrf";
import {
  emptyToNull,
  lookupPtrHostname,
  parseOrgFromAs,
  resolveOrganization,
} from "@/lib/network-info";

interface IpApiResponse {
  status?: string;
  query?: string;
  isp?: string;
  org?: string;
  as?: string;
  reverse?: string;
  country?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
  lat?: number;
  lon?: number;
}

function isPublicIp(ip: string): boolean {
  // Shared with the diagnostics SSRF guard: covers CGNAT, link-local,
  // benchmarking, TEST-NET and IPv4-mapped IPv6 ranges the old regex missed.
  return !isPrivateOrReservedIp(ip);
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ProviderFields {
  isp: string | null;
  org: string | null;
  asn: string | null;
  reverse: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Apply the honest fallback chain to provider fields: organization falls
 * back provider -> ASN-string name -> APNIC RDAP, hostname falls back
 * provider reverse -> server-side PTR lookup. Empty provider strings are
 * normalized to null first, so the UI never receives an ambiguous "".
 * Only the fallback sources that are actually needed are queried.
 */
async function enrich(ip: string, fields: ProviderFields) {
  const providerOrg = emptyToNull(fields.org);
  const asn = emptyToNull(fields.asn);
  const providerHostname = emptyToNull(fields.reverse);
  // ASN parsing needs no network call; RDAP is only queried when neither
  // the provider org nor an ASN name is available.
  const asnName = providerOrg ? null : parseOrgFromAs(asn);
  const needRdap = !providerOrg && !asnName;
  const [rdapData, ptrHostname] = await Promise.all([
    needRdap ? fetchJson(`https://rdap.apnic.net/ip/${encodeURIComponent(ip)}`, 5000) : Promise.resolve(null),
    providerHostname ? Promise.resolve(null) : lookupPtrHostname(ip),
  ]);
  // resolveOrganization handles provider -> ASN -> RDAP in order.
  const { org, orgSource } = resolveOrganization({
    providerOrg,
    asValue: asn,
    rdapData,
  });
  const hostname = providerHostname ?? ptrHostname;
  return {
    isp: emptyToNull(fields.isp),
    org,
    orgSource,
    asn,
    hostname,
    hostnameSource: providerHostname ? ("provider" as const) : hostname ? ("reverse-dns" as const) : null,
    country: emptyToNull(fields.country),
    region: emptyToNull(fields.region),
    city: emptyToNull(fields.city),
    timezone: emptyToNull(fields.timezone),
    latitude: fields.latitude,
    longitude: fields.longitude,
  };
}

/**
 * Server-side network info. The client IP is taken from x-forwarded-for
 * (first entry) and validated; only that IP is sent to the lookup provider,
 * and only fields the provider returns are surfaced. Private/loopback IPs
 * are never looked up — they return `unavailable` flags instead of invented data.
 */
export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req), 120, 60_000, "network-info")) return rateLimitResponse();
  const ip = getClientIp(req);
  const base = {
    ip: ip === "unknown" ? null : ip,
    ipv6: null as string | null,
    isp: null as string | null,
    org: null as string | null,
    orgSource: null as string | null,
    asn: null as string | null,
    hostname: null as string | null,
    hostnameSource: null as string | null,
    country: null as string | null,
    region: null as string | null,
    city: null as string | null,
    timezone: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
    source: null as string | null,
    unavailable: [] as string[],
  };
  if (!base.ip || !isPublicIp(base.ip)) {
    return Response.json({ ...base, unavailable: ["isp", "location", "asn"] });
  }
  const primary = (await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(base.ip)}?fields=status,query,isp,org,as,reverse,country,regionName,city,timezone,lat,lon`,
  )) as IpApiResponse | null;
  if (primary?.status === "success") {
    const enriched = await enrich(base.ip, {
      isp: primary.isp ?? null,
      org: primary.org ?? null,
      asn: primary.as ?? null,
      reverse: primary.reverse ?? null,
      country: primary.country ?? null,
      region: primary.regionName ?? null,
      city: primary.city ?? null,
      timezone: primary.timezone ?? null,
      latitude: typeof primary.lat === "number" ? primary.lat : null,
      longitude: typeof primary.lon === "number" ? primary.lon : null,
    });
    return Response.json({ ...base, ...enriched, source: "ip-api.com" });
  }
  // Fallback provider (ipapi.co) — same no-invention rule.
  const fallback = (await fetchJson(`https://ipapi.co/${encodeURIComponent(base.ip)}/json/`)) as Record<string, unknown> | null;
  if (fallback && !fallback.error) {
    const enriched = await enrich(base.ip, {
      isp: typeof fallback.org === "string" ? fallback.org : null,
      org: typeof fallback.org === "string" ? fallback.org : null,
      asn: typeof fallback.asn === "string" ? fallback.asn : null,
      reverse: null,
      country: typeof fallback.country_name === "string" ? fallback.country_name : null,
      region: typeof fallback.region === "string" ? fallback.region : null,
      city: typeof fallback.city === "string" ? fallback.city : null,
      timezone: typeof fallback.timezone === "string" ? fallback.timezone : null,
      latitude: typeof fallback.latitude === "number" ? fallback.latitude : null,
      longitude: typeof fallback.longitude === "number" ? fallback.longitude : null,
    });
    return Response.json({ ...base, ...enriched, source: "ipapi.co" });
  }
  return Response.json({ ...base, unavailable: ["isp", "location", "asn"], source: null });
}
