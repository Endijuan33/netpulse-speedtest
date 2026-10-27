import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req))) return rateLimitResponse();
  const start = performance.now();
  return Response.json(
    { ok: true, serverTimeMs: Math.round((performance.now() - start) * 100) / 100 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
