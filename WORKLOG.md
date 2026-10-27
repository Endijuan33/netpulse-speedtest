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
