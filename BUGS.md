# NetPulse Bug Hunt — 2026-10-27

Scope: full source scan of `src/`, all API routes, SSRF/rate-limit/CSP
review, Playwright with console page-error capture, SSRF bypass attempts,
and a manual GitHub Advisory Database review of every direct dependency.

## Fixed

### 1. CRITICAL — Upload always 0 Mbps in browsers (root cause found)
- **Reproduction:** live Vercel test (result np-mvqp6uvm): upload phase flat at
  0.0 Mbps for ~11 s, final Upload 0 Mbps, while curl to the same endpoint
  counted bytes. Node reproduces the API-level cause:
  `crypto.getRandomValues(new Uint8Array(512 * 1024))` throws
  `QuotaExceededError: The requested length exceeds 65,536 bytes`.
- **Root cause:** `src/lib/speedtest.ts` called `getRandomValues` once on a
  512 KiB buffer — over the Web Crypto 64 KiB per-call limit — and the call
  sat *outside* the fetch try/catch, so every upload worker died instantly
  and the engine silently reported 0 Mbps.
- **Fix:** new exported `fillRandomBytes()` fills in ≤64 KiB chunks; upload
  workers now check `res.ok` and require a numeric `bytesReceived`
  (previously a 429/error JSON was counted as bytes via a `??` fallback).
  If no upload is accepted at all, the engine now throws instead of
  reporting a fabricated 0.
- **Regression tests:** Vitest (512 KiB + 64 KiB fill, no throw) and
  Playwright short test asserting Upload > 0. Local proof after fix:
  Upload 17.03 Mbps (Playwright, localhost) with download/upload loaded
  latencies distinct (112.73 ms / 177.57 ms).

### 2. CRITICAL (honesty) — Download/upload loaded latency were identical
- **Reproduction:** live result showed download latency = upload latency =
  217.36 ms — one post-load ping set was duplicated into both fields.
- **Fix:** each transfer phase now pings concurrently (1 s interval) while
  it runs; download latency = mean of during-download samples, upload
  latency = mean of during-upload samples. If a phase collects no sample, a
  short post-load ping set is used instead of 0. The "Measuring loaded
  latency" phase finalizes the two independent sets.

### 3. MAJOR — Print report hung the dashboard tab
- **Reproduction:** clicking Print in the browser agent left the tab
  unresponsive (all clicks/reloads timed out), consistent with a native
  print dialog hanging that tab.
- **Fix:** dashboard no longer calls `window.print()` on itself. Print opens
  a dedicated `/print/[id]` tab (result loaded from IndexedDB) that
  auto-prints once (guarded) and offers a manual Print button. If that
  tab's dialog hangs, only that tab is affected.
- **Verification:** Playwright asserts the print tab opens, renders the
  report heading, and the dashboard tab still responds. Limitation (honest):
  Playwright cannot drive the native print dialog itself, so dialog
  completion is not automated — only tab isolation and rendering are.

### 4. MAJOR — Share failed on local runs ("Sharing failed")
- **Root cause:** `/api/network-info` returns `isp: null` for unknown ISPs;
  that null flowed into the SpeedResult and failed Zod validation
  (`string | undefined`, never null) at `/api/share` → HTTP 400.
- **Fix:** engine normalizes API nulls to `undefined` at the source, and the
  dashboard share payload strips nulls defensively. Playwright share test
  now passes (link opens the shared result page).

### 5. MAJOR — Diagnostics hung forever ("Running…" 60 s+)
- **Root cause:** `dns.Resolver` queries to 1.1.1.1/8.8.8.8/9.9.9.9 have no
  timeout; in environments where UDP is blocked (this sandbox) they never
  settle, and `Promise.all` in the route never returned.
- **Fix:** every resolver/system/DNS lookup is raced against a 4 s timeout
  (`withTimeout` in `src/lib/diagnostics.ts`); the diagnostics page fetch
  also has a 30 s `AbortSignal.timeout`. A failed resolver now surfaces as
  a timed-out row in the table, not an eternal spinner.
- **Note:** in this sandbox the three public resolvers time out by design
  (UDP blocked) — that is environment behaviour, correctly reported as an
  error per resolver, not a code bug. On Vercel they resolve normally.

### 6. MAJOR — CSP blocked the IPv4/IPv6 connectivity check
- **Root cause:** `/diagnostics` fetches `https://ipv4.icanhazip.com/` and
  `https://ipv6.icanhazip.com/`, but `connect-src` in `next.config.ts` did
  not list them, so browsers blocked both fetches and the check always
  reported "unreachable".
- **Fix:** both hosts added to `connect-src`.

### 7. MINOR — Rate-limit buckets were shared across routes
- **Root cause:** `checkRateLimit` keyed buckets by IP only, so a burst of
  download chunks consumed the budget for ping/upload/diagnostics, and each
  route's `max` was ignored after the first route created the bucket.
- **Fix:** buckets keyed by `scope:ip`; every route passes its own scope.

### 8. MINOR — SSRF guard missed reserved ranges
- **Fix:** `isPrivateOrReservedIp` now also rejects CGNAT 100.64/10,
  benchmarking 198.18/15, TEST-NET-1/2/3, IETF 192.0.0/24, documentation
  2001:db8::/32, and IPv4-mapped IPv6 (`::ffff:127.0.0.1`,
  `::ffff:7f00:1`). `network-info`'s public-IP check now reuses the same
  function instead of its narrower regex.
- **Bypass attempts, all rejected with 403:** `localhost`, `127.0.0.1`,
  `10.0.0.5`, `0x7f.0.0.1`, `localhost.`, `0177.0.0.1`, `169.254.169.254`,
  `100.64.0.1`, URL-encoded traversal host. The diagnostics fetch uses
  `redirect: "manual"`, so redirect-to-private is not followed.

### 9. MINOR — Silent-zero measurement failures
- Download now checks `res.ok` (error JSON was previously counted as
  throughput bytes) and throws if no transfer succeeded; ping treats
  non-OK responses as failed samples instead of successful latency.

### 10. MINOR — Dashboard elapsed-timer race
- The old shared `timerRef` meant a second start's `finally()` cleared the
  new run's interval and froze Elapsed. The timer is now local to each run.

### 11. MINOR — CSV injection/escaping, share validation, diagnostics timeouts
- `toCsv` now quotes/escapes fields containing commas, quotes or newlines
  (previously only server/isp were quoted, without quote-doubling).
- Shared-result page validates the fragment payload against the Zod schema
  and shows "invalid" for malformed payloads instead of rendering them.
- Diagnostics IPv4/IPv6 checks have a 5 s timeout and check `res.ok`
  (previously they could sit on "checking…" forever).

### 12. Dependency advisories (manual review, 2026-10-27)
- `pnpm audit` could not run from the sandbox: registry audit endpoint
  returned ECONNRESET after retries (earlier run: 403 `policy_denied`).
  No audit verdict is claimed from pnpm.
- Manual GitHub Advisory Database review instead: Next.js 15.5.7 was in
  range for critical GHSA-2464-fhr4-w9xw (Image Optimization RCE,
  patched in 15.5.28) and high GHSA-p3m5-59mp-jv5r (DoS, patched in
  15.5.28); Zod 4.1.8 was below the 4.6.6 patch for high
  GHSA-mrhx-c7xc-m3w5 (memory exhaustion). **Both were upgraded, not just
  documented:** Next.js 15.5.7 → 15.5.28, eslint-config-next → 15.5.28,
  Zod 4.1.8 → 4.6.7. React 19.1.1, lucide-react, tailwindcss, motion and
  recharts showed no advisory covering the pinned versions.
- Toolchain note (NOT a code warning): ESLint 9.38.0 still carries pnpm's
  "deprecated" tag for the 9.x line because eslint-config-next 15 does not
  support ESLint 10. Lint itself passes with 0 errors and 0 warnings.

## Residual limitations (not bugs, documented honestly)
- DNS-rebinding TOCTOU: the guard resolves a non-allowlisted host and
  `measureHost` resolves it again; a hostile DNS could swap answers in
  between. Impact here is minimal (Vercel serverless has no private LAN to
  reach, and the endpoint's purpose is probing public hosts), but it is a
  known residual, not a claim of perfection.
- `getClientIp` trusts the first `x-forwarded-for` entry, which a client
  can spoof to rotate rate-limit buckets. On Vercel the edge appends the
  real client IP; a stricter trusted-proxy list would be needed to fully
  close this, and it is out of scope for a hobby deployment.
- `ip-api.com` is called over plain HTTP (its free tier); the lookup
  inherently discloses the client IP to that provider, as documented.
- Playwright cannot automate the native print dialog (see #3).

## Verification (this round)
- Typecheck: 0 errors. Lint: 0 errors, 0 warnings.
- Vitest: 24/24 (was 18/18; +6 regression tests).
- Production build: success, 0 build warnings (17 routes incl. `/print/[id]`).
- Playwright regression: 5/5 (upload > 0, print tab, share, pages,
  theme persistence, 320 px). Playwright smoke: 5/5.
- Playwright console page errors in the upload test: 0.
- SSRF bypass attempts: 9/9 rejected with 403 (listed in #8).
