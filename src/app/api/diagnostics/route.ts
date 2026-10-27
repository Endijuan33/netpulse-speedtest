import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { isAllowedDiagnosticHost, ALLOWED_DIAGNOSTIC_HOSTS } from "@/lib/ssrf";
import { measureHost, resolveWithResolvers } from "@/lib/diagnostics";
import { diagnosticsQuerySchema } from "@/lib/validation";

export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req))) return rateLimitResponse();
  const url = new URL(req.url);
  const parsed = diagnosticsQuerySchema.safeParse({ host: url.searchParams.get("host") ?? undefined });
  if (!parsed.success) return Response.json({ error: "invalid_host" }, { status: 400 });
  const host = parsed.data.host ?? "cloudflare.com";
  if (!(await isAllowedDiagnosticHost(host))) {
    return Response.json(
      { error: "host_not_allowed", message: "Host is not on the diagnostics allowlist or resolves to a private address." },
      { status: 403 },
    );
  }
  const [resolvers, timing] = await Promise.all([
    resolveWithResolvers(host),
    measureHost(host),
  ]);
  return Response.json({
    host,
    allowlist: [...ALLOWED_DIAGNOSTIC_HOSTS],
    resolvers,
    timing,
    note: "Server-side measurements. Browser-side timings may differ; do not treat either as universal.",
  });
}
