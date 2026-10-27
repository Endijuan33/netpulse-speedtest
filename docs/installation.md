# Installation, Development, Deployment, Testing, Troubleshooting

## Requirements

Node.js 24 (Active LTS), pnpm 10. No other services required.

## Installation

```bash
corepack enable; corepack prepare pnpm@10.18.3 --activate   # if pnpm is missing
pnpm install
```

## Development

```bash
pnpm dev        # http://localhost:3000
```

## Production

```bash
pnpm build && pnpm start
```

Vercel: import the repository, framework preset Next.js, no build-command
overrides needed. Set no environment variables (all optional; see `.env.example`).

## Environment variables

All optional. `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` tune the limiter.
`IP_API_BASE_URL` / `IPAPI_BASE_URL` are reserved overrides (defaults used
today). No API keys are required or stored.

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e   # requires Playwright browsers: npx playwright install chromium
```

## Troubleshooting

- **Build OOM in a constrained VM**: set `NODE_OPTIONS=--max-old-space-size=1024` and build with no other heavy processes.
- **Network info shows "Not detected"**: expected on private/loopback IPs or when both lookup providers fail — data is never invented.
- **Diagnostics 403**: the host is not allowlisted or resolves to a private IP. Use cloudflare.com / google.com / quad9.net.
- **Share link without fragment shows "not available"**: the payload lives in the fragment; resend the full link.
- **Playwright fails in sandbox**: browsers are large; CI runs the smoke spec. Record the exact error instead of claiming success.
