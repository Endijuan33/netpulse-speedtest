# Architecture

```
Next.js 15 App Router (React 19, TypeScript strict, Tailwind v4)
├── src/app/page.tsx            Dashboard: gauge, live chart, staged test, result + export/share
├── src/app/network/page.tsx    Network info (server lookup + browser/OS/device detection)
├── src/app/diagnostics/page.tsx DNS resolvers, TCP/TLS/HTTP timing, IPv4/IPv6 checks
├── src/app/history/page.tsx    IndexedDB history, date filter, compare, delete, CSV export
├── src/app/r/[id]/page.tsx     Fragment-decoded shared result (no server store)
├── src/app/api/*               Route handlers (see docs/api.md)
├── src/lib/speedtest.ts        Client engine: phases, AbortController, single run token
├── src/lib/stats.ts            Pure stats (throughput, ping stats, jitter, loss)
├── src/lib/diagnostics.ts      Server-side DNS/TCP/TLS/HTTP measurement
├── src/lib/ssrf.ts             Diagnostics allowlist + private-IP guard
├── src/lib/rate-limit.ts       Token-bucket limiter + client-IP extraction
├── src/lib/validation.ts       Zod schemas for results, share, queries
├── src/lib/share.ts            Unguessable share-ID derivation
└── src/lib/history.ts          IndexedDB wrapper + CSV/TXT exporters
```

Security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, X-Frame-Options) are set in `next.config.ts`. No secrets
exist in the frontend; `.env.example` contains no real values. The app is
stateless and Vercel-ready (no custom server, no database dependency).
