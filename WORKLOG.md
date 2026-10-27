# NetPulse Worklog

All gates run in ~/workspace/netpulse, Node v24.22.1, pnpm 10.18.3.

## 2026-10-27 — initial build gates

- `pnpm install` — PASS (pnpm-lock.yaml generated; 1m29s first run).
- `pnpm typecheck` — PASS after 4 fixes (userAgentData typing, dns Resolver
  resolve4 instead of lookup, Omit hideIp in engine return type, indexed-access
  guard in SSRF helper). Final run: clean, 0 errors.
- `pnpm lint` (ESLint 9.38.0, next/core-web-vitals via FlatCompat) — PASS,
  0 errors, 0 warnings (after fixing 3 warnings: anonymous default exports,
  unused eslint-disable directive).
- `pnpm test` (Vitest 3.2.4) — PASS: 2 files, 18/18 tests
  (stats: 7, API routes + SSRF guard: 11).
- `pnpm build` (Next 15.5.7) — PASS after 2 fixes:
  (a) framer-motion 12.23.12 / motion-dom mismatch broke webpack
  (`activeAnimations` not exported) → replaced with `motion` 12.23.12
  (`motion/react` import in Gauge); (b) Next upgraded 15.5.4 → 15.5.7
  (pnpm flagged CVE-2025-66478 on 15.5.4).
  Routes: / 241 kB first load, /r/[id] 233 kB, shared 102 kB. No build warnings
  beyond the route table.
- Production smoke (`pnpm start -p 3100`, curl) — PASS:
  /api/health `{"status":"ok"}`, /api/ping ok, download 4096 bytes exact,
  upload counted 4096 bytes, /api/servers origin+2 labelled references,
  /api/diagnostics?host=localhost → 403 host_not_allowed, / renders
  "Network Speedtest".
- `pnpm audit` — BLOCKED by sandbox, not by vulnerabilities: registry audit
  endpoint returns 403 `policy_denied` ("zz_managed_internal_spaces_package_registries").
  No audit verdict is claimed. Known advisories handled manually: Next CVE
  (upgraded to 15.5.7); ESLint 9.38.0 still carries a pnpm "deprecated" tag
  (9.x line) — lint passes, upgrade to ESLint 10 deferred because
  eslint-config-next 15 does not support it.
- Playwright E2E — PASS: Chromium Headless Shell 140 (build 1187)
  downloaded (104.3 MiB); 5/5 smoke specs pass in 6.3s against the
  production server on port 3100 (dashboard loads, short-test start/cancel,
  theme toggle, mobile viewport 390×844, health endpoint). No console-error
  assertion harness was added; browser console was not captured in CI mode —
  parent live verification covers this.

## GitHub & CI (2026-10-27)

- Repo created via ghapi: `Endijuan33/netpulse-speedtest` (public, HTTP 201).
  No prior netpulse repo existed (GET returned 404).
- Push method: ghapi git-data API (blobs → tree → commit → refs/heads/main),
  because the PAT is only available through ghapi, not as a git credential.
  Empty-repo quirk: blob creation 409s until a first Contents-API commit
  seeds the repo; main ref then updated with PATCH on subsequent pushes.
- Commit on main: `0785a805159f66106c19da0ec0cd4acb391d8686`
  ("feat: NetPulse v0.1.0 …"). Branch SHA verified, tree checked: no
  node_modules, .next, .env, tsbuildinfo or test-results entries.
- GitHub Actions run 40506480573 (CI, push to main): status completed,
  conclusion **success** (typecheck, lint, Vitest, build, Playwright smoke
  step ran in CI).

## Notes

- pnpm was not preinstalled; installed globally via npm (`pnpm@10.18.3`).
  corepack is absent in this sandbox, so `pnpm` is used directly.
- No secrets were created or committed. `.env.example` contains no real values.

## 2026-10-27 — bug hunt (follow-up, see BUGS.md)

- Upload 0 Mbps root cause: `crypto.getRandomValues` on a 512 KiB buffer
  throws QuotaExceededError (>64 KiB/call) outside the fetch try/catch.
  Fixed with chunked `fillRandomBytes()` + res.ok checks + throw on total
  failure instead of silent 0. Playwright proof: Upload 17.03 Mbps local.
- Loaded latency was duplicated (one ping set into both fields). Now
  sampled concurrently during each transfer phase (local: 112.73 / 177.57 ms).
- Print no longer calls window.print() on the dashboard; dedicated
  /print/[id] tab instead (Playwright-verified, dialog itself unautomatable).
- Share 400 on local runs: null ISP from network-info failed Zod. Fixed by
  null->undefined normalization at engine + share payload.
- Diagnostics hung forever when UDP resolvers blocked: 4 s per-resolver
  timeouts + 30 s page fetch timeout. Sandbox resolvers now report timeout
  errors per row instead of hanging.
- CSP connect-src now includes ipv4/ipv6.icanhazip.com (was blocking the
  IP connectivity check). Rate-limit buckets now scoped per route. SSRF
  guard extended (CGNAT, benchmarking, TEST-NET, mapped IPv6); 9/9 bypass
  attempts -> 403. CSV escaping, share-page Zod validation, dashboard
  timer race, diagnostics IP timeouts also fixed.
- Dependency upgrades after manual advisory review: Next 15.5.7 -> 15.5.28,
  eslint-config-next -> 15.5.28, Zod 4.1.8 -> 4.6.7 (critical/high GHSA
  coverage; pnpm audit itself blocked in sandbox: ECONNRESET).
- Gates this round: typecheck 0 errors, lint 0 errors 0 warnings,
  Vitest 24/24, build success 0 warnings, Playwright regression 5/5,
  Playwright smoke 5/5, console page errors in upload test 0.

## 2026-10-27 — round 3 (user phone testing, 7 issues)
- Gauge: single source of truth in src/lib/gauge.ts (true 240° arc, pathLength=100, log 0–1000 scale, rAF smoothing); needle resets to 0 on completion/cancel.
- Download engine: 8 long-stream workers, 100 MB streams, 1 s warmup discarded, reader watchdog. Local short-test proof: Download 1402.6 Mbps.
- Dark mode: Tailwind v4 @custom-variant fix; Playwright asserts computed background change.
- Unit toggle Mbps/MB/s (persisted) across dashboard, chart, results, history, share, print, CSV/TXT. Production toast removed (silent history save).
- Gates: typecheck 0, lint 0/0, Vitest 29/29, build 0 warnings, Playwright 13/13, console page errors 0 in asserting specs.

## 2026-10-27 — remove gauge/server-region note from dashboard
- Removed the user-facing explanatory paragraph under the gauge from
  src/app/page.tsx at the user's request. No third-party comparison
  remains in user-facing dashboard text. No functional change; gates
  re-run for this change: typecheck 0, source lint 0/0, Vitest 29/29,
  production build success 0 warnings.

## 2026-10-27 — network-info organization fallback + reverse DNS
- Organization: provider org -> name parsed from the ASN string -> APNIC
  RDAP (5 s timeout). RDAP parsing never mislabels a contact person as
  the organization: it prefers the top-level "description" remark, then a
  registrant entity vCard fn, then the RDAP name, then entity remarks.
- ISP hostname: ip-api `reverse` field (now requested) -> server-side
  PTR lookup (4 s timeout) -> null ("Not detected"). The IP itself is
  never shown as a hostname. Empty provider strings normalize to null.
- New additive response fields only: orgSource, hostnameSource. No field
  removed. Tests: 42/42 Vitest (13 network-info tests incl. ASN parsing,
  empty->null, RDAP fixtures, mocked-fetch route integration).
