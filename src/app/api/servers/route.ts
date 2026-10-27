import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Honest server list: the origin server (derived from the request host) plus
 * clearly-labelled public reference endpoints whose latency is measured
 * client-side. No fake speedtest servers, no claimed "nearest server" — the
 * origin is simply the server handling this request.
 */
export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req))) return rateLimitResponse();
  const host = req.headers.get("host") ?? "unknown";
  return Response.json({
    servers: [
      { id: "origin", label: `Origin server (${host})`, hostname: host, provider: "NetPulse origin", type: "origin" },
      { id: "cloudflare", label: "Cloudflare (reference endpoint)", hostname: "cloudflare.com", provider: "Cloudflare", type: "reference" },
      { id: "google", label: "Google (reference endpoint)", hostname: "google.com", provider: "Google", type: "reference" },
    ],
    note: "Reference endpoints are latency references only, not speedtest servers. Nearest-server claims require measured latency, not IP location alone.",
  });
}
