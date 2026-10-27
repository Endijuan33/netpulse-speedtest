# API Reference

All responses are JSON. Speedtest APIs are same-origin only (no CORS wildcard).
Errors are sanitized: `{ error, message? }` — no stack traces. Rate limiting is
a per-IP in-memory token bucket (default 120 req/min; 60 for speedtest streams,
30 for share).

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness: `{ status: "ok", service, version, time }` |
| `GET /api/ping` | Tiny JSON for HTTP round-trip timing. `Cache-Control: no-store` |
| `GET /api/speedtest/download?bytes=N` | Streams N cryptographically random bytes (1 KB–100 MB). Chunked, `no-store` |
| `POST /api/speedtest/upload` | Reads/discards body, returns `{ bytesReceived, durationMs }`. Cap 200 MB |
| `GET /api/network-info` | Server-side IP lookup via ip-api.com, fallback ipapi.co. Private IPs → `unavailable` flags |
| `GET /api/diagnostics?host=H` | SSRF-protected. Allowlist: cloudflare.com, google.com, quad9.net, one.one.one.one, dns.google, dns.quad9.net. Other public DNS names allowed only if all resolved IPs are public. Returns per-resolver DNS times (1.1.1.1, 8.8.8.8, 9.9.9.9, system) + DNS/TCP/TLS/HTTP timings |
| `GET /api/servers` | Origin server + labelled reference endpoints (not fake speedtest servers) |
| `POST /api/share` | Zod-validated result → `{ id, urlPath }`. ID = first 24 hex chars of SHA-256(payload + random salt). Payload is NOT stored server-side |

## Measurement definitions

- **Throughput (Mbps)** = bytes × 8 / seconds / 1,000,000, from bytes actually read.
- **Ping** = `performance.now()` around a `GET /api/ping` fetch, N=10 samples (5 in short mode). Stats: min/max/mean/median.
- **Jitter** = mean of |sample[i] − sample[i−1]|, plus max. Formula in `src/lib/stats.ts` and the UI tooltip.
- **HTTP request loss** = failed ping fetches / total × 100. Labelled as such everywhere; never ICMP.
- **Loaded latency** = ping samples taken immediately after download/upload load phases, same HTTP method as idle latency.
