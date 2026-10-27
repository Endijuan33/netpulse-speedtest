# NetPulse — Advanced Network Speedtest & Diagnostics

Real network measurement, not simulation. Download/upload throughput is measured
from bytes actually transferred, ping is HTTP round-trip latency (never claimed
as ICMP), jitter is the mean absolute successive difference of latency samples,
and "packet loss" is reported honestly as HTTP request loss.

## Quick start

```bash
cp .env.example .env.local   # optional; no secrets required
pnpm install
pnpm dev                     # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit + integration |
| `pnpm test:e2e` | Playwright smoke specs |

## Documentation

See `docs/`: installation, development, production deployment (Vercel),
environment variables, API reference, architecture, testing, troubleshooting.

## Honest limitations

- Ping/jitter/loss are HTTP-based; true ICMP ping and ICMP packet loss cannot
  be measured from a browser and are never claimed.
- Sharing is fragment-encoded: there is no server-side result database in this
  deployment, so a share link without its `#fragment` cannot be recovered.
- "Nearest server" is not claimed: the server list is the origin server plus
  clearly-labelled public reference endpoints; latency to references is measured
  client-side.
- Loaded latency reuses the HTTP ping method right after load phases, so it is
  comparable to idle latency by construction — it is not a separate protocol.
- Network info depends on ip-api.com (fallback ipapi.co); private/loopback IPs
  return `unavailable` flags, never invented ISP/location data.
- Short mode (`?testMode=short`) caps test windows for smoke/E2E runs. It is
  real measurement with shorter windows, documented here and in code — not fake data.
