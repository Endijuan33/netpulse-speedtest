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

## Round 3 — 2026-10-27 (user phone testing: Ookla/Google >200 Mbps, NetPulse ~20 Mbps)

Scope: user-reported 7 issues. NOTE ON EVIDENCE: the 3 videos the user
sent are reference tests only (Ookla speedtest.net and Google speed test,
Smartfren, Jakarta server, ~215/228 Mbps download) — NOT NetPulse
recordings. Gauge issues below therefore could not be visually confirmed
from NetPulse footage; they were fixed from the user's description plus
code inspection, and the fixes are covered by unit + Playwright tests.

### R3-1. CRITICAL — Gauge needle not smooth, needle/arc mismatch
- Root causes (all verified in code): (a) needle swept 240° (-120°..+120°)
  while the background arc was a 180° semicircle; (b) needle tips at the
  extremes fell outside the 200x120 viewBox (y=139 > 120); (c) arc used
  strokeDasharray 410 while the true arc length is ~327, so fill fraction
  never matched the needle; (d) the arc was Motion-animated (0.4 s easeOut)
  while the needle jumped instantly; (e) the old adaptive max
  (ceil(value/100)*100) made the needle jump BACKWARDS as max grew mid-test.
- Fix: src/lib/gauge.ts is now the single source of truth — centre
  (100,105), radius 78, viewBox 0 0 200 150, a true 240° arc
  (M 32.5 144 A 78 78 0 1 1 167.5 144), pathLength=100 so dashoffset is
  exactly 100*(1-norm). Gauge.tsx smooths ONE displayed value with a
  single rAF exponential (tau ~140 ms); needle and arc derive from it on
  every frame. Scale is Ookla-style logarithmic over a FIXED 0–1000 Mbps
  (norm = log10(1+v)/log10(1+1000)): 20 Mbps ~44% of sweep, 200 Mbps ~77%.
  The displayed number stays the true linear speed; only position is log.
- Tests: Vitest gauge-geometry (angle==dashoffset at 0/25/50/75/100%,
  tips inside viewBox) + Playwright gauge-moves test.

### R3-2. CRITICAL — Download capped near ~20 Mbps vs Ookla/Google 200+
- Diagnosis (measured, not guessed): server-side random-byte generation
  is NOT the bottleneck (~1.8 GB/s locally). From this sandbox, one Vercel
  download stream runs at ~19 Mbps and 4 parallel streams aggregate to
  ~51 Mbps — per-stream throughput is the scarce resource. The old engine
  wasted it: sequential 1–32 MB chunks with 4 workers, a full round trip +
  fresh serverless invocation per chunk, chunk size scaled from a cumulative
  average that stayed low during warmup, and no warmup discard.
- Fix: 8 concurrent workers (documented cap), each opening ONE 100 MB
  stream (route maximum) and reading until the window ends, then cancelling
  the reader (plus a watchdog that cancels stalled readers after the
  window). First 1000 ms (500 ms short mode) is warmup and discarded from
  the result. Only 8 requests per test, so the 60/min download rate limit
  is never the constraint. Server route unchanged (per-chunk crypto bytes;
  generation is fast, and repeating a fixed buffer would weaken the
  anti-cache claim for no measured gain).
- Proof on a fast path: local production server, headless browser, short
  test: Download 1402.6 Mbps, Upload 29.8 Mbps (loopback; loaded latencies
  are inflated on loopback because 8 saturated streams share the loopback
  with the ping traffic — that is latency-under-load, not a measurement
  error). UNPROVEN (honest): whether a real Indonesian mobile link now
  reaches 200+ Mbps — sandbox measurements prove the engine no longer caps
  near 20 Mbps, but only the user's phone retest on Smartfren can confirm
  the Jakarta figure, because part of the gap is geography (see below).
- Geography caveat, now shown in the UI: the test server is the Vercel
  deployment region (iad1, US East) while Ookla/Google used a Jakarta-local
  server, so some gap vs those tests is RTT, not engine.

### R3-3. MAJOR — Dark/light mode did not visibly work
- Root cause: Tailwind v4. In v4 the `dark:` variant defaults to the
  prefers-color-scheme MEDIA query, so toggling the `.dark` class on <html>
  did nothing — label changed and persisted, screenshots stayed light.
- Fix: `@custom-variant dark (&:where(.dark, .dark *));` in globals.css.
- Test: Playwright now asserts the COMPUTED body background colour
  actually changes (not just the class/label). Note: Tailwind v4 reports
  gray-950 as oklch, not rgb — an early assertion expecting rgb(3,7,18)
  failed on the string form while the colour had in fact changed; the
  assertion was corrected to change-detection, which is the real property.

### R3-4. Needle did not reset after a test
- Root cause: dashboard gauge showed `result.downloadMbps` after a test,
  and `current` was never cleared, so the needle froze at the final value.
- Fix: gauge shows the live value only while running and 0 otherwise;
  `current` is cleared on completion and in the run finally() (cancel too).
  Result cards are untouched.

### R3-5. Production-visible internal toast removed
- Removed "Result saved to history (IndexedDB, this browser only)." —
  saving is now silent; results are still listed on /history. Grep for
  other user-facing internal strings: the history/result pages' IndexedDB
  sentences are deliberate user-facing privacy info, not debug text, and
  were kept; the share toast is deliberate privacy info and was kept.

### R3-6. Speed-unit option (Mbps / MB/s) before starting a test
- Added SpeedUnitToggle (radio group) on the dashboard next to START TEST
  and on History; persisted in localStorage (netpulse-speed-unit, default
  Mbps). It converts gauge number, live current, chart axis + tooltip,
  result cards, history list + comparison, share page, print page, and
  CSV/TXT exports (CSV header switches to downloadMBps/uploadMBps when
  MB/s is selected). Canonical stored values stay in Mbps.
- Tests: Vitest conversion (80 Mbps = 10 MB/s) + persistence parsing;
  Playwright toggle-converts-and-persists (incl. fixing two test-only
  selector bugs: sr-only radio under the sticky nav, and getByLabel
  ambiguity with the gauge aria-label).

### R3-7. Audit attempt this round
- pnpm binary in this session is a self-managing shim that fails with
  EPERM before running anything, and the sandbox registry blocked pnpm
  audit in both prior rounds (403 policy_denied, then ECONNRESET). No
  audit verdict is claimed. No new dependencies were added this round
  (gauge/units are hand-written), so the dependency surface is unchanged
  from the round-2 manual advisory review (Next 15.5.28, Zod 4.6.7).

### R3 verification
- Typecheck 0 errors. Lint 0 errors, 0 warnings. Prettier clean on
  changed files. Vitest 29/29 (was 24; +5 gauge/unit tests).
- Production build success, 0 build warnings, / first load 203 kB.
- Playwright regression 8/8 + smoke 5/5 = 13/13, console page errors 0
  in the specs that assert them (gauge, theme, unit, upload tests).
- Local short-test proof: Download 1402.6 Mbps, Upload 29.8 Mbps.

### R3 residual / unproven (not bugs, documented)
- 200+ Mbps on a real Indonesian mobile link: unproven until the user
  retests on their phone (see R3-2). The engine ceiling is removed; the
  remaining gap, if any, is geography/RTT to iad1 or the mobile link.
- Loaded latency under 8 saturated streams is high by construction
  (latency under load); loopback short test showed 1069 ms download
  loaded latency while saturated.
