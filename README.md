# BreakMyApp

**Zero-human QA agency.** We break your app for free, deterministically — then you pay Whop for the report. No humans in the loop anywhere.

## The machine

```
Exa prospector ──15min crons──▶ hunts fresh launches (FR-1)
                                        │
paste URL ◀──── search-first ────────── │
        │                               ▼
        ▼                    deterministic-suite@1.1 (Free)
Solari stealth Cloud Browser —— Playwright chaos, same seed,
                                        same suite, every run
                                        │
                     Whop webhooks (signed) ──▶ unlock deliverables
                    $9.99 Full Autopsy · Launch Shield $29/mo
                                        │
                              hourly Shield re-scans
                              Treasury ticker (Convex)
```

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Convex (`convex/` — schema, actions, crons, HTTP) |
| Executives | `@solarisdk/browser` (stealth Chromium) — runs as an `externalPackage`, install-at-deploy |
| Prospecting | Exa `/search` + `/agent/runs` (`convex/exaHunter.ts`) |
| Payments | Whop REST + Standard Webhooks (`convex/whop.ts`) |
| Frontend | Vite + React + Tailwind in `web/` |

## Quick start

```bash
npm install
npx convex dev          # backend live + typecheck loop
npm run web:install
npm run web:dev         # frontend (VITE_CONVEX_URL in web/.env)
```

## Env keys (Convex, set via `npx convex env set KEY value`)

| Key | Source | Missing behavior |
| --- | --- | --- |
| `SOLARI_API_KEY` | .env | runs fail with a clear message |
| `EXA_API_KEY` | .env | hunter no-ops, self-serve unaffected |
| `WHOP_API_KEY` | .env | checkout degrades to "Whop not linked yet" |
| `WHOP_WEBHOOK_SECRET` | Whop dashboard (mint `ws_…` from the Whop dashboard's Webhooks tab) | webhook returns 401, no unlock fulfilment |
| `WHOP_PLAN_ID_FULL_AUTOPSY` | Whop plan id |$9.99 Full Autopsy button disabled |
| `WHOP_PLAN_ID_SHIELD` | Whop plan id | Shield button disabled |
| `WHOP_COMPANY_ID` | Whop team id | not yet enforced |
| `APP_BASE_URL` | Where the frontend is served (e.g. `https://app.example.dev`) | run manifest links use the .dev base |
| `WORKOS_CLIENT_ID` | WorkOS dashboard (`client_01…`) | accounts are unusable; app still runs unauthenticated |
| `VITE_CONVEX_URL` | Frontend env in web/.env | set to your Convex deployment before building |
| `VITE_WORKOS_CLIENT_ID` | Frontend env in web/.env (same client_01… value, public) | sign-in/sign-up buttons hidden when unset |
| `VITE_WORKOS_REDIRECT_URI` | Frontend env in web/.env | defaults to `<origin>/callback` |

**WorkOS AuthKit (accounts).** Convex validates AuthKit access tokens (`convex/auth.config.ts`, official customJwt recipe). Setup: set `WORKOS_CLIENT_ID` on the Convex deployment (`npx convex env set WORKOS_CLIENT_ID client_01…`), set `VITE_WORKOS_CLIENT_ID` + `VITE_WORKOS_REDIRECT_URI` in `web/.env`, and in the WorkOS dashboard register the redirect URI (`http://localhost:5173/callback` locally, your production domain in prod) and add your frontend origin under Authentication → Sessions → CORS. `convex.json` carries the dev `authKit` block so a Convex-managed WorkOS team configures these automatically during `npx convex dev`. Money state is unaffected — payments remain Whop-only.

**Whop webhook URL** to paste into the dashboard: `https://<deployment>.convex.site/whop/webhook`. Events required: `payment.succeeded`, `payment.refunded`, `membership.went_valid`, `membership.went_invalid` / `expired` / `canceled`. Money-state only flips inside signature-verified webhook handling; the client can never fake an unlock.

## Determinism guarantees

- seed = uint32(sha256(normalizedUrl)) — stored on every audit row, never re-derived differently.
- suite = `deterministic-suite@1.1` — desktop 1440×900 then mobile 390×844, fixed DOM-order exploration with a versioned payload pack. Tracker blocklist `convex/solariRunner.ts` keeps ambient network noise out of runs.
- `determinismHash` = sha256(canonical findings) — stamped on every run; re-runs diff `lastRerunResolved`/`lastRerunRegressed` so the fix story is exact. **Ship-Ready** badge only issues after a 0-critical re-run — never on the first run.
- Re-runs: 72h window (1 included at $9.99, unlimited at $29/mo).
- Deliverables (screenshots, patches, payloads, repro sequences) are server-masked until `isUnlocked || payerHasShield`.

## Don'ts — 3 rules

1. **Never fake determinism:** if suite internals change, bump `SUITE_VERSION`, so old `determinismHash` values don't volunteer impossible claims.
2. **Never accept client-side payment truth** — webhook only, verified `ws_…` + standardwebhooks.
3. **Never run the $9.99 funnel on a clean report** — clean reports get a Shield CTA instead; `completeRun` maintains that invariant server-side.

## Terac human panels

Parked by spec (schema columns remain, status stays `NOT_DISPATCHED`, dispatch never happens until wired).

## Verification

Use Node.js 22.12 or newer. After `npm ci` and `npm ci --prefix web`:

```bash
npm run verify                  # backend typecheck, regression tests, frontend build
npx playwright install chromium
npm run test:e2e                 # responsive UI, invalid URL/report recovery, axe checks
```

The real Convex + Solari journey is opt-in because it creates an audit and uses a cloud browser session:

```powershell
$env:RUN_LIVE_E2E='1'; npm run test:e2e
```

On macOS/Linux: `RUN_LIVE_E2E=1 npm run test:e2e`. Set `web/.env` from `web/.env.example` first. Tests cover signed webhook fulfillment, duplicate delivery, refunds arriving before payment success, paid report masking, Shield cancellation, re-run concurrency, URL validation, and SHA-256 boundary vectors. No test charges a card. Screenshots are evidence; visual regression requires approved baselines.

GitHub Actions runs checks on pushes and pull requests. The live audit is excluded from routine CI. To host the frontend, import this repository into Vercel, set `VITE_CONVEX_URL` to the intended deployment, and use the included `vercel.json` (including SPA report-route rewrites). Set Convex backend keys independently; never put them in `VITE_*` variables.

Suite 1.1 corrects the SHA-256 constants and padding and validates outbound destinations. Existing stored seeds remain unchanged; new audits use the corrected seed derivation. Payments are enabled, with server-side masking and payment-ID deduplication. Refund revenue is reversed once; estimated processing fees remain recorded.
