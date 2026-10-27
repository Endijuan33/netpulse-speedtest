import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Reads and discards the body, counting bytes actually received. Never stored. */
export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req), 60)) return rateLimitResponse();
  if (!req.body) return Response.json({ error: "empty_body" }, { status: 400 });
  const start = performance.now();
  const reader = req.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_UPLOAD_BYTES) {
        return Response.json({ error: "payload_too_large" }, { status: 413 });
      }
    }
  } catch {
    return Response.json({ error: "read_failed" }, { status: 400 });
  }
  return Response.json({
    bytesReceived: bytes,
    durationMs: Math.round((performance.now() - start) * 100) / 100,
  });
}
