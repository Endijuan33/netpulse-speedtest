/** In-memory token-bucket rate limiter, keyed by client IP. No persistence needed. */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns true when the request is allowed, false when rate-limited.
 * Buckets are keyed by route scope + IP: the old shared bucket meant a
 * burst of download chunks could exhaust the budget for ping, upload and
 * diagnostics on the same IP, and each route's `max` was silently ignored
 * after the first route created the bucket.
 */
export function checkRateLimit(
  ip: string,
  max = 120,
  windowMs = 60_000,
  scope = "default",
): boolean {
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: max, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    bucket.tokens = Math.min(
      max,
      bucket.tokens + (elapsed / windowMs) * max,
    );
    bucket.lastRefill = now;
  }
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export function rateLimitResponse(): Response {
  return Response.json(
    { error: "rate_limited", message: "Too many requests, try again later." },
    { status: 429 },
  );
}
