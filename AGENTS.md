<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# BreakMyApp

Zero-human QA agency: deterministic Playwright audits (Solari) + Exa prospecting + Whop payments + Vite/React frontend. Backend is Convex.

## Commands

- Install: `npm install` (root) then `npm run web:install`
- Dev backend: `npx convex dev` (also typechecks Convex)
- Dev frontend: `npm run web:dev` (Vite; needs `VITE_CONVEX_URL` in `web/.env`)
- Build frontend: `npm run web:build` (`tsc && vite build`)
- Deploy backend: `npm run deploy` (`convex deploy`)
- Prospect: `npm run prospect` / `npm run prospect:full [n]`
- Smoke: `npm run smoke` (`convex run audits:listRecent '{"limit":10}'`)
- Trigger a hunt live: `npx convex run exaHunter:huntNow '{}'`
- Audit a URL directly: `npx convex run audits:startFromUrl '{"targetUrl":"https://example.com"}'`
- Set backend env: `npx convex env set KEY value` (see README env table)
- Verify: `npm run verify` (backend typecheck, Vitest regressions, frontend build); browser: `npm run test:e2e`; opt in to a live audit with `RUN_LIVE_E2E=1`.

## Architecture

- `convex/` — schema (`schema.ts`), mutations/queries, actions, crons, HTTP. `convex.config.ts` declares the env vars Convex functions read via `env` from `_generated/server` (not `process.env`).
- `convex/solariRunner.ts`, `exaHunter.ts`, `whop.ts` are `"use node"` actions and cannot export mutations/queries; their DB-touching primitives live in `runnerBridge.ts`, `hunterBridge.ts`, `whopBridge.ts`.
- `convex/deterministic.ts` is pure TS shared by backend and frontend. `web/tsconfig.json` includes `../convex/deterministic.ts`, so frontend typecheck covers it.
- `web/src/convexApi.ts` is the single frontend bridge to Convex; it re-exports the generated API from `web/src/convexRuntime.js`.
- `web/vite.config.ts` note: `_generated/api.js` resolves `convex/server` from repo-root `node_modules`; `src` imports resolve from `web/node_modules`. Both are pinned to convex@1.48.0.
- Crons: `exa-hunt` every 15 min, `shield-rescan` hourly.
- HTTP surface: `POST /whop/webhook` (raw body, lowercased headers), `GET /health`.

## Quirks and gotchas

- Webhook handler reads the body with `req.arrayBuffer()`; this runtime has no `req.bytes()` (calling it throws a live 500). Keep it that way.
- Money state only flips inside signature-verified webhook handling (`internal.whop.handleWebhook`); the client can never fake an unlock. `WHOP_WEBHOOK_SECRET` is required or webhooks return 401.
- Whop checkout is disabled for clean reports (`criticalCount === 0`); refund revokes the unlock.
- `SOLARI_BASE_URL` overrides the default `https://api.getsolari.com` endpoint.
- `@solarisdk/browser` is an `externalPackage` (`convex.json`) installed at deploy time, not a normal dependency.
- Tracker/analytics domains are blocked during runs by a fixed list in `solariRunner.ts` to suppress ambient nondeterminism.
- Determinism: `seed = uint32(sha256(normalizedUrl))` stored on every audit; suite is `deterministic-suite@1.1`. If suite internals change, bump `SUITE_VERSION` in `deterministic.ts` so old `determinismHash` values stay honest. Re-runs use the same stored seed.
- Ship-Ready badge flips only after an actual 0-critical re-run (never on the first run).
- Terac human verification is parked: schema columns exist, status stays `NOT_DISPATCHED`, and dispatch never happens until wired.
- Web frontend env: `VITE_CONVEX_URL` in `web/.env`; root `.env` is used by `scripts/exa-prospect.mjs` (Exa key). Convex backend env is separate, set via CLI.
- `convex/_generated` is gitignored-ish (`.convex/` ignored; `_generated` present locally). Regenerate with `npx convex dev`/`deploy`.
