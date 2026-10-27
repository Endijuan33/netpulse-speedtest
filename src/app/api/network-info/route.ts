import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

interface IpApiResponse {
  status?: string;
  query?: string;
  isp?: string;
  org?: string;
  as?: string;
  country?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
  lat?: number;
  lon?: number;
}

function isPublicIp(ip: string): boolean {
  return !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80:|fc00:|fd)/.test(ip);
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

/**
 * Server-side network info. The client IP is taken from x-forwarded-for
 * (first entry) and validated; only that IP is sent to the lookup provider,
 * and only fields the provider returns are surfaced. Private/loopback IPs
 * are never looked up — they return `unavailable` flags instead of invented data.
 */
export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req))) return rateLimitResponse();
  const ip = getClientIp(req);
  const base = {
    ip: ip === "unknown" ? null : ip,
    ipv6: null as string | null,
    isp: null as string | null,
    org: null as string | null,
    asn: null as string | null,
    hostname: null as string | null,
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
    `http://ip-api.com/json/${encodeURIComponent(base.ip)}?fields=status,query,isp,org,as,country,regionName,city,timezone,lat,lon`,
  )) as IpApiResponse | null;
  if (primary?.status === "success") {
    return Response.json({
      ...base,
      isp: primary.isp ?? null,
      org: primary.org ?? null,
      asn: primary.as ?? null,
      country: primary.country ?? null,
      region: primary.regionName ?? null,
      city: primary.city ?? null,
      timezone: primary.timezone ?? null,
      latitude: primary.lat ?? null,
      longitude: primary.lon ?? null,
      source: "ip-api.com",
    });
  }
  // Fallback provider (ipapi.co) — same no-invention rule.
  const fallback = (await fetchJson(`https://ipapi.co/${encodeURIComponent(base.ip)}/json/`)) as Record<string, unknown> | null;
  if (fallback && !fallback.error) {
    return Response.json({
      ...base,
      isp: typeof fallback.org === "string" ? fallback.org : null,
      org: typeof fallback.org === "string" ? fallback.org : null,
      asn: typeof fallback.asn === "string" ? fallback.asn : null,
      country: typeof fallback.country_name === "string" ? fallback.country_name : null,
      region: typeof fallback.region === "string" ? fallback.region : null,
      city: typeof fallback.city === "string" ? fallback.city : null,
      timezone: typeof fallback.timezone === "string" ? fallback.timezone : null,
      latitude: typeof fallback.latitude === "number" ? fallback.latitude : null,
      longitude: typeof fallback.longitude === "number" ? fallback.longitude : null,
      source: "ipapi.co",
    });
  }
  return Response.json({ ...base, unavailable: ["isp", "location", "asn"], source: null });
}
