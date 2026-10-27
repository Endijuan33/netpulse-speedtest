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

## 2026-10-28 — COMPLETE PREMIUM REDESIGN (4 reference pages)
- Design tokens (globals.css): #050918 / #0B1224 / #101A30 / #17243A,
  #2563FF / #00A8FF / #A855F7 / #10B981 / #F59E0B / #EF4444 /
  #F8FAFC / #94A3B8; shared classes .np-card/.np-btn-primary/.np-input;
  dark-first default theme (no stored preference -> dark) with explicit
  dark/light classes on <html>; layout max-width 1440px.
- New shared components (src/components/ui.tsx): PageHeader, Sparkline,
  MetricCard, StatusBadge, InfoCard, CopyButton, Skeleton, EmptyState,
  ErrorState, ConfirmDialog (open/title/body/confirmLabel), TimingTimeline.
  Nav rewritten as premium shell (no profile control: no accounts exist).
- Dashboard: connection overview (ISP/IP+copy/location/status/server/region),
  gauge (ticks clamped inside viewBox; gradient arc hidden at 0 so no stray
  end-cap dot), server selector (Auto/Origin — single origin server, stated
  honestly; reference endpoints are latency-only Measure buttons), metric
  cards with real-sample sparklines, merged realtime chart (real samples
  only), live test log from engine phases, test summary with idle+loaded
  latency, HTTP request loss (never ICMP), share/print/export preserved.
- Network Info: Refresh + last-updated, full grid incl. org/ASN/hostname
  fallback chains, copy buttons, OpenStreetMap embed from real provider
  coordinates + Open in Maps + approximate-location disclaimer (no map when
  no coordinates), client-derived device/browser section, network details,
  privacy section where VPN/proxy/Tor are "Not detected" = unavailable,
  never proof of absence.
- Diagnostics: tabs DNS/Timing/IP Connectivity/Trace Route/HTTP; quick
  presets populate + run; resolver table now shows resolved addresses and
  includes OpenDNS 208.67.222.222; HostTiming now returns resolvedIp,
  contentType, contentLength, redirectLocation (redirect: manual, never
  followed); recent tests in localStorage; summary with evidence-based
  recommendations + JSON export. Trace Route: raw ICMP/UDP is unavailable
  on Vercel serverless, so NO hops are simulated — the tab shows the
  application-layer path actually measured (DNS/TCP/TLS/HTTP) and says so.
- History: analytics from stored records (avg dl/ul/ping/jitter, total,
  first/last period), historical chart from stored records only, Apply/Reset
  filters (search, From/To, ISP), sorting, pagination, rows-per-page, bulk
  selection, detail panel (no location/duration/status columns — SpeedResult
  has no such fields; public IP shown, hidden when hideIp), Clear All and
  Delete Selected behind ConfirmDialog. IndexedDB: schema unchanged (v1),
  listResults now validates + dedupes via validateResults(); clearAll added.
- Fixes found by QA in this round: theme toggle left <html> classless in
  light mode (now always exactly one of dark/light); regression dark-mode
  test assumed a light starting theme and its count()-based branch flaked
  (now deterministic: addInitScript seeds light only when nothing is
  stored, so the reload-persistence assertion still holds — an
  unconditional seed broke persistence because init scripts rerun on
  reload); gauge end tick labels were clipped (clamped).
- Gates: typecheck 0 errors, lint 0 errors 0 warnings, Vitest 46/46
  (incl. 4 new history-validation tests), production build success,
  Playwright smoke 5/5, regression 8/8, SSRF bypass list 7/7 -> 403
  (localhost, 127.0.0.1, 10.0.0.5, 169.254.169.254, 192.168.1.1, ::1,
  0.0.0.0), overflow 0 px on all 4 pages at 1440/390/320 px.
- Known limitations (unchanged): raw traceroute unavailable on serverless;
  DNS-rebinding TOCTOU in SSRF guard; x-forwarded-for spoofing for rate
  limits; ip-api over plain HTTP (free tier); 200+ Mbps on a real Indonesian
  mobile link still only provable by the user's phone retest.

## Visual polish round (background + icons) — after premium redesign
- User re-sent the same 4 references: implementation still felt short on
  background and icons. Cross-checked implementation screenshots (local prod
  build, 1440 px) against the references, component by component.
- Gaps found (before): dashboard had only faint radial gradients inside the
  gauge card — no Earth, no top glow, flat navy elsewhere; Network InfoCards
  and dashboard overview had NO icons at all; metric cards had tiny inline
  icons with line-only sparklines (no gradient fill); history had only 4
  analytics cards, no Total Tests card, no trend percentages, no
  mini-sparklines, and chart/filters stacked instead of side-by-side;
  diagnostics tabs/resolver rows/summary had no icons and no copy buttons
  on resolved IPs; the Network map was a light OSM iframe that this app's
  own CSP (default-src 'self', no frame-src) blocks in enforcing browsers —
  that is why the agent-browser map showed "content blocked".
- Fixes: page-wide ambient top glow on all pages (layout .np-ambient,
  pointer-events none, static); dashboard CSS-only Earth limb + star field
  behind the gauge (no image asset, no reference screenshot used, no layout
  shift, reduced-motion safe); .np-icon-chip coloured tiles in MetricCard,
  InfoCard, overview, server selector, diagnostics timing/summary, history
  analytics; gradient-filled sparklines; live-log check icons; dark tile map
  (CARTO dark_all, no new dependency, real tiles from provider coords,
  working zoom +/-/recenter, attribution, tile-failure fallback to Open in
  Maps) with a scoped CSP addition (img-src += basemaps.cartocdn.com);
  history trends computed honestly in src/lib/trends.ts (current filtered
  period vs preceding equal-length window, same dataset; "—" when the
  previous window has no records) + Total Tests card + chart/filters in the
  reference's side-by-side layout; diagnostics tab/resolver/summary icons
  and copy buttons on resolved IPs.
- Deliberately NOT reproduced: trademarked brand logos (neutral Lucide
  glyphs instead, e.g. globe for browser, cloud/globe/shield for resolvers);
  no profile avatar (no accounts — a decorative avatar would be a dead
  control); no "nearest"/global-fleet claim; no simulated traceroute hops;
  no country-flag emoji (rendering varies; country shown as text + pin);
  dashboard overview/gauge/server columns keep the previous redesign's
  merged layout rather than the reference's separate right-hand overview
  column (same data, less churn, no feature risk).
- Gates: typecheck 0 errors, lint 0 errors 0 warnings, Vitest 51/51
  (incl. 5 new trends tests), production build success 0 warnings
  (First Load: / 235 kB, /diagnostics 111 kB, /network 116 kB,
  /history 232 kB, shared 103 kB), Playwright smoke 5/5 + regression 8/8,
  overflow 0 px on all 4 pages at 1440/390 px. CARTO tile math verified
  (Bekasi coords -> tile 3265/2119 @ z12, HTTP 200, 256x256 PNG).

## 2026-10-28 — map tile source fix (CARTO watermark) + dashboard header icons

- FAILURE (live 2026-10-28 01:20 WIB, /network, real public IP): CARTO dark_all
  tiles rendered a repeating "API KEY REQUIRED" watermark — unauthenticated
  CARTO basemaps now require a key. A tile URL returning HTTP 200 did NOT
  prove real imagery (a watermark PNG also returns 200); the previous tile
  check was misleading for exactly this reason.
- FIX: tile source replaced with OpenStreetMap standard tiles
  (tile.openstreetmap.org, keyless, no account, no cost), rendered dark via
  CSS filter on the tile layer (invert 100% + hue-rotate 180deg + brightness
  95% + contrast 90%). Attribution now "© OpenStreetMap contributors" only.
  CSP img-src scoped from basemaps.cartocdn.com to tile.openstreetmap.org.
  Marker, zoom +/-, recenter, tile-failure fallback to Open in Maps, and the
  approximate-location disclaimer are unchanged.
- PROOF (content, not status): Denver z12 tile 853/1554 fetched and
  inspected — 36,760 bytes, 256 unique colours, no dominant colour (max
  11%), land green/water blue/road beige = real urban map imagery; the
  CARTO tile for comparison was 96% flat dark grey (16 colours). All 9
  tiles of the Denver 3x3 grid fetched (25,120–36,748 bytes each) and
  rendered in a local prod-build screenshot: streets and labels visible
  (Berkeley, Highland, Five Points, City Park West, Cheesman Park),
  dark-navy filter readable, blue marker on Denver, zoom/recenter controls
  visible. Sandbox caveat, stated honestly: headless Chromium in this
  sandbox cannot reach OSM directly (egress proxy auth + Playwright
  proxy/localhost-bypass conflict, 4 attempts), so the screenshot served
  the server-side-fetched real tile bytes via route fulfilment; the
  browser->OSM hop itself is proven by the curl content analysis, and the
  parent's live re-check on a real browser/IP is the final proof.
- OSM POLICY FINDING (recorded, not hidden): OSM served its "403 Access
  blocked" tile image to requests carrying a generic Chrome UA from the
  shared sandbox egress IP (twice), while a distinctive app UA got real
  tiles (twice, same IP/tile). This is an egress-IP/UA blocklist artefact,
  not an app defect: OSM policy allows normal browser use, and production
  browsers on ordinary IPs send their real UA. At this app's tiny volume,
  OSM standard tiles are the correct keyless choice; if volume ever grows,
  revisit with a dedicated tile host or cache.
- SECOND FIX: Dashboard "Realtime Throughput" (blue TrendingUp chip) and
  "Live test log" (green ScrollText chip) now use the same .np-icon-chip
  treatment as other Dashboard headers. No log behaviour, chart data, or
  measurement code changed.
- Files: src/app/network/page.tsx, src/app/page.tsx, next.config.ts.

## 2026-10-28 — dashboard mobile gauge fix (user phone screenshot, 390 px)

- SYMPTOMS (live, Chrome Android, 01:41 WIB): page horizontally shifted
  (title cut to "k Speedtest", Mbps pill cut at right edge, metric cards
  cut), Earth disc dominating the gauge, idle gauge a flat grey arc with
  a thin white needle, centre icon / Download pill / unit toggle missing
  or cut off.
- DIAGNOSIS (local prod build, 390 px probe): document scrollWidth was
  already 390 (no document overflow in headless Chromium), but .np-earth
  was 463 px wide (34rem, max-width 130%) with its right edge at x=426 —
  clipped by the card's overflow-hidden in headless Chrome, yet able to
  shift/pan the page on Chrome Android. The grey idle arc was the
  deliberate norm=0 gradient suppression from an earlier round; the
  centre content never existed (number sat below the SVG); the toggle
  lived in the header row where it could clip.
- FIX (Dashboard/gauge only; engine, map, other pages untouched):
  (a) .np-earth now width min(34rem, 100%) — strictly inside the card;
  (b) html/body overflow-x: clip as belt-and-braces (clip, unlike
  hidden, also blocks mobile scroll-chaining panning);
  (c) Gauge centre content moved INSIDE the arc: gradient icon circle
  (download/upload arrow), big value, unit, phase pill, centred on the
  arc centre (top 70% of the viewBox), needle base covered by the icon
  circle as in the reference; SVG is width 100% / height auto inside a
  max-w-[340px] centred wrapper;
  (d) track is now ALWAYS the blue→purple gradient at 0.28 opacity
  (never flat grey); the full-strength progress arc draws only when
  norm > 0; idle needle still points exactly at tick 0 (angle -120.0);
  (e) tick font 9 -> 8 with the existing viewBox clamps;
  (f) SpeedUnitToggle moved from the header row to centred below the
  gauge; header subtitle truncated to avoid long IP/ISP wrapping
  blowout; metric cards and chart container got min-w-0.
- VERIFICATION (390 px AFTER screenshot, /tmp/np-dash-390-after.png):
  title, gauge, toggle, all 4 metric cards, and the Earth layer are all
  inside the viewport at 360 AND 390 px; scrollWidth == clientWidth at
  both; all 8 ticks 0–1000 inside the SVG; needle -120.0 at idle;
  toggle fully visible below the gauge; centre icon/value/unit/pill
  visible inside the arc; track reads blue→purple, not grey.
- REMAINING DIFFERENCES vs the reference (honest): the reference shot
  shows a COMPLETED test (bright progress arc at 286.9) while idle here
  is correctly the dim track; the reference Earth is a photographic
  planet, ours is deliberately a CSS disc/glow (never a screenshot
  background) and is now contained; on a 390 px phone the gauge is
  necessarily narrower than the desktop reference, proportions hold.
- Files: src/components/Gauge.tsx, src/app/page.tsx,
  src/app/globals.css, src/components/ui.tsx (min-w-0 on MetricCard).

## 2026-10-28 — Earth photo speedometer background (user-supplied asset)

- ASSET (verified, not taken on trust): source
  ~/workspace/user/files/1000325255_15_ezgu.png is actually JPEG bytes
  (JFIF), measured 1536x1024 RGB — the claimed dimensions check out, the
  ".png" extension does not. Content confirmed by viewing: night Earth,
  electric-blue atmosphere, Southeast Asia + city lights centred,
  Australia lower right, no text/UI.
- FILES: public/images/netpulse-earth-bg.png (PNG transcode, 1,755,485
  bytes, 1536x1024) + public/images/netpulse-earth-bg.webp (WebP q80,
  131,608 bytes — 46% smaller than the source JPEG, 92.5% smaller than
  the PNG). AVIF NOT produced: sandbox PIL 10.2.0 has no AVIF support
  (no libheif) — WebP only, as allowed. Browsers download the WebP in
  practice; the PNG is fallback-only via image-set type() with a plain
  url() fallback line for browsers without image-set support.
- APPLICATION: .np-gauge-bg on the speedometer card — background-size
  cover, position center, no-repeat, plus a navy gradient overlay
  (initially 0.25/0.05/0.3, retuned to 0.55/0.20/0.45 after the first
  screenshots showed the subtitle washed out over the bright atmosphere
  rim). Tick labels got a dark halo (stroke #050918, 0.55 opacity,
  paint-order stroke) for readability over bright clouds. The old
  CSS-only Earth disc AND starfield were REMOVED (usage + CSS) — the
  photo is the only Earth now, never stacked with the disc. Card
  overflow-hidden still clips the photo strictly inside the card.
- FIRST LOAD: unchanged — / stays 236 kB before and after (public/
  images are not in the JS bundle). Honest page-weight note: first view
  additionally downloads the 132 KB WebP (fallback browsers: 1.7 MB PNG).
- VERIFICATION: desktop 1440 + mobile 360/390/430 screenshots
  (/tmp/np-dash-1440-earth.png, /tmp/np-dash-390-earth.png): Earth +
  SE Asia lights clearly visible behind the gauge on both, all numbers /
  ticks / needle / toggle readable, scrollWidth == clientWidth and card
  inside viewport at 360/390/430 px.
- Files: public/images/netpulse-earth-bg.png,
  public/images/netpulse-earth-bg.webp, src/app/page.tsx,
  src/app/globals.css, src/components/Gauge.tsx (tick halo).

## 2026-10-28 — Latency references unreachable fix
- Root cause: CSP connect-src did not allow cloudflare.com/google.com, so
  the browser blocked the reference-latency fetches (UI: "unreachable from
  this browser"). Fix: next.config.ts connect-src += cloudflare.com,
  www.cloudflare.com, google.com, www.google.com; page.tsx probes
  lightweight redirect-free paths (cloudflare.com -> /cdn-cgi/trace,
  google.com -> /generate_204). Timing stays browser-measured, approximate.
- Files: next.config.ts, src/app/page.tsx.
