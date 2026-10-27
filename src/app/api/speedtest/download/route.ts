import { randomBytes } from "crypto";
import { downloadQuerySchema } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Streams cryptographically random bytes with chunked transfer encoding.
 * Nothing is read from disk; bytes are generated per chunk so the payload
 * cannot be served from a cache. Same-origin only: no CORS headers are set.
 */
export async function GET(req: Request) {
  if (!checkRateLimit(getClientIp(req), 60)) return rateLimitResponse();
  const url = new URL(req.url);
  const parsed = downloadQuerySchema.safeParse({ bytes: url.searchParams.get("bytes") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "invalid_bytes" }, { status: 400 });
  }
  const total = parsed.data.bytes ?? 1024 * 1024;
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const chunk = randomBytes(Math.min(64 * 1024, total - sent));
      sent += chunk.byteLength;
      controller.enqueue(new Uint8Array(chunk));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store, no-cache",
      "Content-Length": String(total),
    },
  });
}
