import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { createShareId } from "@/lib/share";
import { shareRequestSchema } from "@/lib/validation";

/**
 * Returns an unguessable share ID. The result payload is NOT persisted
 * server-side (no database in this deployment); the client encodes the
 * payload in the URL fragment of /r/[id], so only the link holder can read
 * it. This is documented honestly on the result page — never claimed as a
 * database-backed public page.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req), 30)) return rateLimitResponse();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = shareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "validation_failed", details: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const id = createShareId(parsed.data.result);
  return Response.json({ id, urlPath: `/r/${id}` });
}
