# Product Requirements Document (PRD): BreakMyApp

Product Name: BreakMyApp (or ZeroDayQA)

Event: Zero-Human Company Hackathon (NYC)

Core Stack: Convex (Database & Orchestration) + Exa API (Autonomous Target Discovery) + Solari (Cloud Browsers & Compute Sandboxes) + Whop (`@whop/checkout`, Whop Payments & Webhooks — Monetization) + Terac MCP (`https://terac.com/api/mcp` — Verified Human Labor, bought autonomously by the agent)

North Star Hackathon Metric: Real, settled USD revenue in Whop Payments generated autonomously before judging begins.

**v2 Delta (this rewrite):**
1. **Payment now happens *after* the test, not during it.** Every URL gets a full, deterministic Playwright run before any money changes hands. The paywall unlocks the report's deliverables, never the run itself.
2. **Deterministic execution engine:** seeded chaos, fixed viewport matrix, fixed payload pack, versioned suite, and a `determinismHash` printed on every report so paid fix-verification re-runs are trustworthy.
3. **New pricing model:** Free deterministic Crash Check → **$9 Full Autopsy** (one-time, includes 1 fix-verification re-run) → **$29/mo Launch Shield** (Whop membership).
4. **Stripe is fully replaced by Whop:** embedded Whop checkout on the report page, Whop webhook fulfillment in Convex, Whop dashboard as the revenue source of truth for judges.
5. **Terac MCP is wired in and load-bearing:** the zero-human company buys verified human labor through Terac. Post-unlock, the agent dispatches a 3-human panel per Critical finding (human-verified reproduction stamps) and a 3-human review of every AI fix patch before delivery — "bots find crashes; verified humans confirm them." Labor cost flows into treasury math under a margin guard.

---

## 1. Executive Summary & Real-Revenue Thesis

Most hackathon projects pitch theoretical B2B SaaS tools that require weeks of enterprise onboarding before collecting a single dollar. BreakMyApp is an autonomous, zero-human QA, chaos-testing, and security teardown agency designed to generate real, verifiable Whop Payments transactions within the next 4 hours.

The core trust inversion is: **we break your app for free, before you pay a cent.** Every audit is a *deterministic* Playwright run — same seed, same suite, same viewport matrix every time — so what we show you is reproducible, and a paid re-run can prove your fix actually landed. Random fuzzing finds bugs you can't reproduce; deterministic runs produce bug reports your fix can be verified against, and the re-run is the receipt.

The pipeline runs:

**Hunt (Exa):** An autonomous loop queries Exa to discover newly launched web apps (Show HN, Product Hunt, X launches, and hackathon deployments) and extracts their live URLs and founder contacts.

**Break (Solari):** It dispatches Solari Cloud Browsers (8ms spin-up) and Solari AI Sandboxes (90ms spin-up) to execute the full deterministic Playwright audit — seeded chaos-clicks on buttons and forms, desktop/mobile viewport matrix, console `pageerror` capture, failed network request detection, mobile overflow detection, and leaked client-side API key scanning. **This entire run completes before payment.**

**Verify (Terac — Verified Human Labor):** Deterministic bots find crashes; verified humans confirm them. The moment a founder pays, the agent autonomously dispatches the Terac verification panel — 3 screened humans re-execute the exact repro steps of each Critical finding on the live site, and 3 human reviewers merge-grade every AI fix patch. The report's verdicts stop being "trust our bot" and become "3 verified strangers reproduced your checkout crash." The company pays for this labor via Terac's API/MCP — which is the hackathon thesis in one move: a zero-human company that buys humans as an API.

**Monetize (Whop + Convex):** The founder sees the complete list of findings (titles, severities, counts) and Bug #1 in full unblurred detail as proof. Only the deliverables — every stack trace, screenshot, session replay, and the ready-to-merge AI fix patches — are locked behind a $9 one-time unlock or a $29/mo Whop membership, paid via embedded 1-Click Whop checkout (Apple Pay / Google Pay / saved card).

---

## 2. Documented Market Pain Point

Software failures cost the U.S. economy $2.41 trillion annually (*Consortium for Information & Software Quality / CISQ Report*).

88% of online consumers are less likely to return to a site after a single bad user experience or broken flow (*Forrester UX Benchmarks*).

The "Vibe-Coding" & AI Shipping Vulnerability Boom: With teams shipping full-stack apps in hours using AI coding tools, thousands of production apps launch daily with exposed `NEXT_PUBLIC_` secrets, broken mobile viewports, unvalidated forms, and unhandled 500 errors because solo founders and small teams skip QA.

**The trust gap:** Security-flavored "audits" delivered by humans or LLMs are unverifiable — customers can't tell if findings are real, and "we fixed it" can't be checked deterministically. BreakMyApp's deterministic engine makes the whole exchange falsifiable: same seed, same suite, re-run and count the errors. Founders pay for a proof, not a PDF.

---

## 3. Target Customers (For Immediate Live Revenue Today)

**In-Room Buyers (150+ Hackers & Sponsors at the Venue):** Every team at this hackathon is shipping a live web app right now and terrified of their demo crashing in front of judges. The free deterministic run takes seconds and costs nothing — and if it finds crashes, the $9 Apple Pay unlock is an instant impulse buy. If it finds nothing, it's a flex ("our app is Ship-Ready clean").

**Live Internet Launches (Show HN, Product Hunt, Indie Hackers):** Founders who launched in the last 24 hours have maximum anxiety about broken flows and high willingness to pay $9–$29 when presented with *reproducible visual proof* — a bug generated by a fixed, seeded suite they can re-run themselves post-payment to watch it turn green.

---

## 4. End-to-End Autonomous System Architecture

Note the ordering: **the deterministic run completes before the paywall ever renders.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. TARGET ACQUISITION (Two Channels)                                    │
│ • Autonomous Outbound: Convex Cron runs Exa Search every 15 mins        │
│   to find fresh `Show HN`, Product Hunt, and X startup launches.        │
│ • Inbound Self-Serve: Founder pastes URL on BreakMyApp homepage.        │
│   No account. No login. No payment. The run is free — always.           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. CONVEX ORCHESTRATION (`audits:startAutonomousAudit`)                 │
│ • Creates reactive `audits` document.                                   │
│   Status: "DETERMINISTIC_RUN_RUNNING".                                  │
│ • Derives run seed: sha256(normalizedUrl) → uint32. Same URL            │
│   forever produces the same seed.                                       │
│ • Streams real-time status updates to the frontend UI at 60fps.         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
┌──────────────────────────────────┐ ┌────────────────────────────────────┐
│ 3A. SOLARI CLOUD BROWSERS (8ms)  │ │ 3B. SOLARI AI SANDBOX (90ms)       │
│ Hosts the deterministic          │ │ • Inspects JS bundles for leaked   │
│ Playwright run:                  │ │   API keys & `.env` variables.     │
│ • Seeded chaos-click engine.     │ │ • Audits CORS, CSP, & security     │
│ • Desktop & Mobile viewport      │ │   headers.                         │
│   matrix (1440×900 / 390×844).   │ │ • Generates copy-paste code patch. │
│ • Captures console `pageerror`,  │ │                                    │
│   4xx/5xx responses, DOM clips.  │ │                                    │
│ • Saves screenshot proof.        │ │                                    │
└────────────────┬─────────────────┘ └─────────────────┬──────────────────┘
                 └──────────────────┬──────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. FREE REPORT RENDERED (Run HAS COMPLETED — nothing is paid yet)       │
│ • Full findings table: every bug title + severity visible.              │
│ • Bug #1 unblurred in full detail as free proof.                        │
│ • Run manifest on-page: seed, suiteVersion, determinismHash.            │
│ • Remaining deliverables (traces, screenshots, replays, patches) shown  │
│   as blurred vault cards with the unlock CTA.                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. WHOP PAYWALL & CLOSED-LOOP MONETIZATION                              │
│ • Embedded Whop checkout (`@whop/checkout`) renders inside the report   │
│   page — Apple Pay, Google Pay, and saved cards; no redirect needed.    │
│ • Convex reads the Whop webhook at `/whop/webhook`:                     │
│   `payment.succeeded`  → flips `isUnlocked: true` atomically.           │
│   `membership.went_valid`  → activates Launch Shield re-scans.          │
│   `payment.refunded`   → revokes unlock (we don't sell empty reports).  │
│ • Because Convex is reactive, the vault unblurs within milliseconds     │
│   of the webhook — and the Global Revenue Ticker ticks in real time.    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. TERAC HUMAN VERIFICATION (paid proof-of-work, post-unlock only)      │
│ • Fired by the `payment.succeeded` path — never on the free tier.       │
│ • 3 verified humans re-run each Critical finding's exact repro steps    │
│   on the live URL; verdicts stream back as HUMAN-VERIFIED stamps.       │
│ • 3 human reviewers merge-grade every AI fix patch before delivery.     │
│ • Margin guard: Terac labor capped ≤ 30% of the $9 unlock revenue.      │
│ • Agent harness → Terac MCP; Convex actions → Terac API (`x-api-key`).  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pricing Model (Whop SKUs)

The free tier is the product demo. Payment buys depth, verification, and monitoring — never the discovery itself.

| Tier | Price | SKU Type (Whop) | What the buyer gets |
|---|---|---|---|
| **Deterministic Crash Check** | **Free** | — (no checkout) | Full pre-pay Playwright run on any URL, any time: seeded chaos suite, desktop + mobile viewport matrix, health score 0–100, complete findings list (every bug title + severity), Bug #1 fully unblurred with console log + screenshot, and the on-page run manifest (seed, `suiteVersion`, `determinismHash`). |
| **Full Autopsy** | **$9.00** one-time | One-time payment plan (per URL) | Unlocks everything from the completed run: all findings in full detail (exact DOM selectors, full stack traces, reproduction steps, raw console logs), every screenshot, session replay, and all ready-to-merge AI fix patches. Includes **1 deterministic fix-verification re-run** valid for 72 hours: fix, re-run, and if the suite comes back 0-critical, your report is stamped **Ship-Ready**. Within seconds of unlock, the agent also dispatches the **Terac panel**: 3 verified humans reproduce every Critical finding on your live URL (HUMAN-VERIFIED stamps) and 3 human reviewers merge-grade every AI fix patch before it's shown. |
| **Launch Shield** | **$29.00/mo** | Whop membership (cancel anytime) | Continuous autonomous defense: after every push, a scheduled deterministic re-scan runs on your URL from the live instance; unlimited fix-verification re-runs while the membership is active; regression alerts when a deploy re-breaks something previously fixed; and a perpetually renewed, live Ship-Ready badge (embeddable in a README or landing page) — issued only while the most recent deterministic run is clean. |

**Pricing logic.** The $9 price point is deliberate: it sits under the "tap twice on iPhone without thinking" threshold for the in-room hackathon buyer, while being high enough that a full internet launch looks serious. The Launch Shield is the only SKU with recurring revenue — it's also where Whop genuinely outperforms a one-time checkout, since memberships, renewals, dunning, and cancellation are Whop's native surface.

**Honest-funnel rule.** If the free deterministic run finds zero criticals, the $9 Full Autopsy unlock is disabled for that audit (nothing to autopsy — we don't sell empty reports), and the CTA offers Launch Shield instead: "You're clean today. Keep it that way after the demo reboot." A clean conspiracies-free report is itself the trust asset that drives the next conversion.

**Treasury math.** `netAutonomousProfit = Whop gross sales − Whop Payments fees − Terac labor − Solari compute cost`. All four flow into the live ticker; the Whop dashboard remains the authoritative, judge-verifiable revenue source of truth, and the Terac ledger is the receipt for the humans the company bought.

---

## 6. Detailed Functional Requirements

P0: Must-Have for Hackathon Demo & Live Sales

### FR-1: Dual Ingestion Engine (Self-Serve + Exa Autonomous Hunter)

**Self-Serve Input:** A zero-friction URL bar on the landing page (`https://your-app.vercel.app`) that immediately triggers the free deterministic run — no account, no login, no pre-payment, no email gate before running. Email/Whop contact capture happens only after payment.

**Exa Autonomous Prospector (`convex/exaHunter.ts` — canonical Exa API usage per the `build-with-exa` skill):**

Two-phase pipeline on `https://api.exa.ai`, authed with `x-api-key: $EXA_API_KEY`:

- **Phase 1 — Launch discovery (`POST /search`):** Scheduled Convex Action (`crons.ts`, every 15 min). The request is the skill's recommended shape — recency and source preference phrased in natural language ("Show HN launches posted in the last day and Product Hunt launches this week"), `type: "auto"`, `contents: {"highlights": true}` — plus only the fields the task justifies: `startPublishedDate` (the hunter's 24-hour dedupe bound is a stated window that must be enforced), an `objective` framing it as one step of the audit pipeline, a keep/drop `systemPrompt` (one launch per product, verify the live URL, `null` never a guessed founder name), and a compact `outputSchema` (`launches[]` → `product_name`, `target_url`, `one_liner`, `founder_hint`) so page-extracted fields are declared rather than hoped for from metadata. No `category`, no domain filters, no boilerplate `numResults`.
- **Phase 2 — People + Company enrichment (`POST /agent/runs` — the Agent API):** Finding founders and mapping companies is list-building/enrichment, which the skill explicitly routes to `/agent`; `category: "people"` / `category: "company"` on `/search` are reserved for raw people/company documents and are **not** used. Each discovered launch is passed as an `input.data` row (not pasted into the query), with explicit `effort: "low"` (the fixed cheap band for autonomous economics — no `budget`, which only pairs with `auto`/`ultra`), and a bounded `outputSchema`: `people[]` maxItems 5 (`name`, `role`, `contact_url` format uri, `contact_email` format email) plus a flat `company` object (`name`, `one_liner`, `competitors[]`, `ship_context`). The integration completes the full lifecycle: poll `GET /agent/runs/{id}` until `completed`/`failed`/`cancelled`, read `output` only after checking how the run ended, log `stopReason` and `costDollars` into treasury economics, and cache the returned `agent_run_*` id on the audit row.
- **Grounding in the product:** grounding on both surfaces is **field-level** — each entry carries `{field, citations[], confidence}` (e.g., `launches[0].founder_hint` cited to the Show HN page). Convex stores the citation URLs in `audits.grounding` and renders them beneath `exaContextSummary` on the report page, so the founder sees exactly where each extracted fact came from.
- **Observed unit economics (first live run, 2026-10-24):** discovery `/search` ≈ **$0.007 per 15-min harvest tick** (10 results, ~0.3–1.5s, 5 structured launches); Agent-Run enrichment ≈ **$0.025 per enriched launch**, `stopReason: schema_satisfied`, effort `low`. At 4 ticks/hour + ~10 enrichments/day, Exa cost lands in the ~$0.05–0.10/day range — comfortably inside the treasury's `netAutonomousProfit` calculation, priced at cents against the $9 unlock.

### FR-2: Deterministic Playwright Execution Engine (`convex/solariRunner.ts`) — runs **pre-pay, always**

Everything below executes on Solari-hosted isolated browser runtimes connected via CDP/Playwright. The suite is a fixed, versioned artifact — `deterministic-suite@1.0` — and the seed is derived from the canonical normalized URL (`seed = uint32(sha256(url))`), so:

- **Re-running the suite against an unchanged app yields identical findings, in identical order, with identical payloads.** Every run is a deterministic snapshot of the app's behavior under a fixed probe.

**Deterministic Cloud Browser Worker:**

- Connects via CDP/Playwright to a Solari Cloud Browser instance (`stealth: true`).
- **Fixed viewport matrix:** Desktop (1440×900) then Mobile (390×844), always in that order.
- **Seeded Chaos Fuzzing with a fixed payload pack:** a versioned constant array of edge-case strings (long strings, special characters, unicode, empty submissions), injected into every detected `<input>` and `<button>` in fixed DOM order. The PRNG is seeded from `runSeed`, so payload selection and click sequence are fully reproducible. Each finding records the exact `deterministicPayload` and selector index that triggered it.
- **Fixed waits & stable network mode:** bounded settle timeouts, and route-intercept blocking of third-party analytics/trackers/ads to suppress ambient nondeterminism. Non-determinism from the outside world (external latency, A/B content) is recorded, never re-rolled: the run snapshots reality; it does not retry until it likes the answer.
- Attaches listeners to `page.on("pageerror")`, `page.on("console")`, and `page.on("response")` — flagging any 4xx/5xx API responses.
- Detects horizontal overflow (`document.documentElement.scrollWidth > window.innerWidth`) on mobile.
- Captures before/after screenshots at every seeded action that produces a fault.
- Emits `determinismHash = sha256(canonicalFindingsJson)` after the run.

**Deterministic Sandbox Worker:**

- Spins up an isolated Solari Sandbox to fetch client-side JS bundles, scan for high-entropy strings or leaked keys (`sk_live_`, `SUPABASE_SERVICE_ROLE`, unguarded `NEXT_PUBLIC_` keys), check missing HTTP security headers (CORS, CSP, HSTS), and synthesize a ready-to-paste code fix per finding.

### FR-3: Pre-Pay Free Report & Locked Vault UI (Convex Frontend)

**Live Terminal Stream:** As the deterministic run executes, the user watches real-time state updates: "Spinning up Solari Browser (8ms)...", "Run seed: `0x8f3a91c2`", "Suite: deterministic-suite@1.0", "Desktop (1440×900): OK", "Mobile (390×844): 1 DOM clip detected", "Injecting seeded chaos payloads...", "3 Critical Issues Found". Because the suite is deterministic, the step log is meaningful to skeptics — it reads like a protocol, not a magic trick.

**The Free Layer (rendered only after the run completes):**

- **Full findings table:** every discovered issue is listed with its title and severity badge. The founder sees *what* was found before paying a cent.
- **Bug #1 in full detail (unblurred):** severity badge, exact DOM selector, repro steps with the exact seeded payload, raw console error, and screenshot.
- **Run manifest:** seed, `suiteVersion`, and `determinismHash` displayed on-page. This is the anti-fraud seal: a paid re-run against the same commit re-executes the same suite, and a matching hash proves the methodology never changed.

**The Blurred Vault (deliverables only):** findings #2..N as blurred cards — redacted stack traces, blurred screenshots, locked "Copy AI Fix Patch" buttons, and locked session replays. Each card carries its unlock CTA (Full Autopsy or Launch Shield, depending on audit state). **No card is ever presented before the deterministic run has completed.**

### FR-4: Whop Live Payments, Embedded Checkout & Webhook Fulfilment (`convex/whop.ts` & `convex/http.ts`)

**Checkout (embedded, no redirect):**

- Convex action `whop:createCheckoutSession` calls the Whop REST API server-side to create a checkout session for the correct plan ($9 Full Autopsy one-time plan, or $29/mo Launch Shield membership plan), carrying `auditId` (and target URL) in metadata.
- The report page renders Whop's embedded checkout component (`@whop/checkout` React embed) for true in-page 1-click unlock with Apple Pay / Google Pay / saved cards. Whop-hosted plan checkout links (`whop.com/checkout/...`) are the fallback for Exa-hunted outbound DMs and email.

**Tier→Plan wiring:** `$9.00 — Full Autopsy` (one-time plan, per URL) and `$29.00/mo — Launch Shield` (membership plan). Both are real, live Whop SKUs created in the Whop dashboard during Hour 1.5 of the build.

**Webhook fulfilment (the closed loop):**

- Whop posts signed events to Convex's HTTP endpoint at `/whop/webhook`.
- Signature verification: validate the `Whop-Signature` header (HMAC-SHA256 with the Whop signing secret, timing-safe comparison) — mandatory, since fulfilment flips money-gating state.
- `payment.succeeded` → read `auditId` metadata, atomically flip `isUnlocked: true` on the audit document, write the Whop payment amount into `company_treasury`, and clear `initialUnlockPending`.
- `membership.went_valid` → mark the founder's Launch Shield active in `shield_memberships`, schedule hourly re-scan crons for the enrolled URL.
- `membership.went_invalid` / `membership.expired` → deactivate the Shield, park the Ship-Ready badge.
- `payment.refunded` → revoke `isUnlocked` on that audit (self-policing: the unlock is only sold when it demonstrably contains findings).
- Increment the Global Live Revenue Ticker on every settled payment.

### FR-5: Ship-Ready Verification Re-Run (Paid Deliverable, Post-Fix)

- The $9 Full Autopsy includes one deterministic verification re-run (valid 72h); Launch Shield includes unlimited re-runs while active. Users trigger via "Verify my fix" on the report page.
- The re-run executes `deterministic-suite@1.0` with the **same stored `runSeed`**. Whichever suite comes back green issues the **Ship-Ready badge** — a live badge linking to the re-run's manifest, impossible to forge because it only flips to true in Convex after an actual passing run.
- A diff view ("What changed between runs") shows resolved vs. regressed findings — the Launch Shield's regression alerts are the same diff, fired automatically after deploys.

### FR-6: Terac Human Verification Panels — "Bots find crashes; verified humans confirm them"

The engine's one-liner: *the deterministic suite proves the bug is reproducible; Terac proves the bug is real and the patch is mergeable.*

**The agent is the operator (zero humans in our loop).** BreakMyApp has no human staff. When a founder unlocks the Full Autopsy, the agent itself dispatches verification work to Terac's verified-human-labor API — the same surface exposed by the Terac MCP server at `https://terac.com/api/mcp` (tools incl. `terac_get_context`, `terac_create_project`, `terac_create_opportunity`, `terac_approve_submission`). Two auth surfaces, one org: the OpenCode agent harness uses the Terac MCP for autonomous ops; Convex actions call Terac's API server-side with `x-api-key`. Secret hygiene: `TERAC_API_KEY` (prefix `tk_`, minted at Terac org Settings → API Keys) lives in the Convex env / OpenCode @{env:...} substitution — never in code or committed config.

**Panel dispatch flow (Convex actions):**

1. `terac:assertContext` — on first unlock, `terac_get_context` fetches org name, credit balance, projects.
2. `terac:createVerificationProject` — create-or-find the "BreakMyApp Human Verification" project; cache the project id on the audit row.
3. `terac:createFindingPanel` — per audit, two opportunities:
   - **Repro Panel (per Critical finding):** 3 verified humans get the live URL + the finding's exact deterministic repro steps (the stored seeded payload + selector) + the run screenshot. Task (2 min): "Open this URL, follow the steps, did the app misbehave as described?" Verdict: yes/no + one required free-text note.
   - **Patch Review Panel (per finding):** 3 human reviewers merge-grade each `aiSuggestedPatch` on a merge/no-merge rubric with one required note ("does this fix break anything else?").
4. `terac:collectVerdicts` — a Convex cron polls submission status every 60s (no webhook assumption; polling keeps the integration simple), 100 req/min/key rate limit respected with exponential backoff.
5. `terac:closeOut` — `terac_approve_submission` on each result to release panel payment, then aggregate.

**Verdict aggregation & stamping:** ≥2/3 reproductions ⇒ `TERAC_VERIFIED ×3/3`-style stamp on the finding; otherwise `TERAC_CONTESTED`. A contested critical triggers an automatic offer: refund the $9 via Whop immediately (trust > revenue) and the treasury records it. Patch panels attach their merge-grade to the finding before the "Copy AI Fix Patch" button ever unlocks delivery.

**Margin guard (the autonomy policy):** Before dispatch, the agent queries Terac's pricing for the batch; it only launches if projected labor ≤ 30% of the $9 unlock revenue — otherwise it caps the panel to the top-3 Criticals. The **free tier never dispatches Terac** (the free run is pure deterministic bot evidence). If Terac credits run dry, the report degrades gracefully to DETERMINISTIC-ONLY stamps — never a paywall failure for an already-paying customer.

---

## 7. Convex Database Schema (`convex/schema.ts`)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. Master table for every autonomous or self-serve site audit
  audits: defineTable({
    targetUrl: v.string(),
    projectName: v.string(),
    source: v.union(
      v.literal("EXA_AUTONOMOUS_HUNT"),
      v.literal("SELF_SERVE_URL")
    ),
    founderHandleOrEmail: v.optional(v.string()),
    exaContextSummary: v.optional(v.string()),
    exaAgentRunId: v.optional(v.string()), // `agent_run_*` — enables /agent follow-ups via previousRunId
    grounding: v.optional(v.array(v.string())), // source URLs for the report page
    status: v.union(
      v.literal("QUEUED"),
      v.literal("EXA_ENRICHING"),
      v.literal("DETERMINISTIC_RUN_RUNNING"),
      v.literal("SANDBOX_ANALYZING"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    liveStepLog: v.array(v.string()), // Streams real-time run progress to UI

    // Determinism core
    runSeed: v.number(),              // uint32 from sha256(normalizedUrl) — fixed pre-pay
    suiteVersion: v.string(),         // e.g., "deterministic-suite@1.0"
    determinismHash: v.optional(v.string()), // sha256 of canonical findings JSON
    solariBrowserBootMs: v.optional(v.number()), // e.g., 8ms
    solariSandboxBootMs: v.optional(v.number()), // e.g., 90ms

    totalBugsFound: v.number(),
    criticalCount: v.number(),
    healthScore: v.number(),          // 0 to 100

    // Whop paywall state
    isUnlocked: v.boolean(),          // Flips true on `payment.succeeded`
    payerHasShield: v.boolean(),      // Flips true on `membership.went_valid`
    verificationRunsRemaining: v.number(), // 1 included with $9 Full Autopsy
    shipReadyBadgeIssued: v.boolean(),

    whopCheckoutUrl: v.optional(v.string()),
    whopSessionId: v.optional(v.string()),
    unlockPriceCents: v.number(),     // 900 ($9.00) — Launch Shield is on the membership

    // Terac human verification panel (post-unlock, per FR-6)
    teracPanelStatus: v.union(
      v.literal("NOT_DISPATCHED"),   // Free tier / not yet unlocked
      v.literal("DISPATCHED"),
      v.literal("CONFIRMED"),
      v.literal("CONTESTED")
    ),
    teracProjectId: v.optional(v.string()),
    teracOpportunityIds: v.optional(v.array(v.string())),
  })
    .index("by_url", ["targetUrl"])
    .index("by_status", ["status"])
    .index("by_unlock", ["isUnlocked"]),

  // 2. Individual bugs, security leaks, and UI breaks found by the deterministic run
  findings: defineTable({
    auditId: v.id("audits"),
    isFreePreview: v.boolean(),       // True for Bug #1 so the founder sees proof pre-pay
    category: v.union(
      v.literal("CONSOLE_CRASH"),
      v.literal("NETWORK_500_ERROR"),
      v.literal("MOBILE_OVERFLOW"),
      v.literal("BROKEN_DEAD_CTA"),
      v.literal("EXPOSED_SECRET_OR_HEADER")
    ),
    severity: v.union(
      v.literal("CRITICAL"),
      v.literal("HIGH"),
      v.literal("MEDIUM")
    ),
    title: v.string(),                // e.g., "Unhandled TypeError on Checkout Button Click"
    deterministicPayload: v.optional(v.string()), // Exact seeded payload that triggered this
    reproductionSteps: v.string(),
    rawErrorLog: v.string(),
    aiSuggestedPatch: v.string(),     // Ready-to-merge code fix
    screenshotStorageId: v.optional(v.id("_storage")),

    // Terac human verification stamps (per FR-6)
    teracVerdict: v.optional(
      v.union(
        v.literal("PENDING"),
        v.literal("TERAC_VERIFIED"),
        v.literal("TERAC_CONTESTED")
      )
    ),
    teracReproducedCount: v.optional(v.number()), // e.g., 2 of a 3-person panel
    patchReviewStatus: v.optional(
      v.union(v.literal("PENDING"), v.literal("HUMAN_MERGE_GRADED"))
    ),
  }).index("by_audit", ["auditId"]),

  // 3. Launch Shield membership state (mirrors Whop `membership.*` events)
  shield_memberships: defineTable({
    whopMembershipId: v.string(),
    founderHandleOrEmail: v.optional(v.string()),
    enrolledUrl: v.string(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("LAPSED"),
      v.literal("CANCELED")
    ),
    lastShieldScanAt: v.optional(v.number()),
  }).index("by_status", ["status"]).index("by_url", ["enrolledUrl"]),

  // 5. Terac human verification panel results (labor bought autonomously, FR-6)
  terac_verifications: defineTable({
    auditId: v.id("audits"),
    findingId: v.id("findings"),
    opportunityId: v.string(), // Terac opportunity created by the agent
    taskKind: v.union(
      v.literal("FINDING_REPRO"),
      v.literal("PATCH_MERGE_GRADE")
    ),
    status: v.union(
      v.literal("DISPATCHED"),
      v.literal("CONFIRMED"),
      v.literal("CONTESTED"),
      v.literal("EXPIRED")
    ),
    panelSize: v.number(),
    reproducedCount: v.number(),
    laborCostCents: v.number(),
    humanNotes: v.optional(v.array(v.string())),
  })
    .index("by_finding", ["findingId"])
    .index("by_audit", ["auditId"])
    .index("by_status", ["status"]),

  // 6. Global Autonomous Company Treasury & Telemetry (Live Leaderboard)
  company_treasury: defineTable({
    totalAuditsExecuted: v.number(),
    totalBugsCaught: v.number(),
    totalWhopRevenueCents: v.number(),    // Real settled Whop Payments USD
    totalWhopFeesCents: v.number(),
    totalTeracLaborCents: v.number(),     // Human labor the company bought
    totalShipReadyBadgesIssued: v.number(),
    totalSolariComputeCostCents: v.number(),
    netAutonomousProfitCents: v.number(),
  }),
});
```

---

## 8. Real-Revenue Go-To-Market (GTM) Playbook During the Hackathon

To walk onto the stage with real customers and real Whop payouts, execute this exact timeline during the final 2.5 hours of build time:

**Hour 1.5 — Turn on Whop live payments (the $9 Apple Pay impulse tier):**
Create the BreakMyApp Whop with two live plans: `$9.00 — Full Autopsy` (one-time) and `$29.00/mo — Launch Shield` (monthly membership). Configure Apple Pay and Google Pay on Whop Payments. Grab the plan IDs, wire them into `convex/whop.ts`, register the `/whop/webhook` endpoint in the Whop dashboard with its signing secret, and run one $9 sandbox payment end-to-end to verify the reactive unblur before going live.

**Hour 1.5 — Wire up Terac (5 minutes):**
Create the BreakMyApp Terac organization and mint a `tk_` API key under Settings → API Keys. Connect the Terac MCP in OpenCode (`opencode mcp add terac --global --url https://terac.com/api/mcp`, then sign in via `/mcps`) so the agent harness can drive verification autonomously, and put the same key into the Convex env as `TERAC_API_KEY` for the in-app panel actions. Fund the org with panel credits and dry-run one 3-human repro panel on a volunteer URL before stepping on stage — see the demo timing note in the live script for how verdicts are queued so they land on cue.

**Hour 2.0 — Pre-Audit 15 Hackathon Projects & 15 Show HN Launches (all free, pre-pay):**
Use the Exa + Solari pipeline to automatically audit 30 live URLs `deterministic` runs and generate their shareable report links (`breakmyapp.xyz/audit/<id>`). Every one of these runs completes and renders its free tier before any human is asked for money.

**Hour 2.5 — Drop the "Pre-Demo Crash Check" in the Hackathon Discord/Slack:**
Post in the event channel and walk to neighboring tables:

> "We built an autonomous QA agent running on Exa + Solari Cloud Browsers that tries to break your hackathon demo before the judges do — free. Paste your live URL: it runs a deterministic Playwright suite (desktop + mobile + seeded chaos fuzz) in seconds and shows you every crash it finds before you pay for anything. If we find crashes and you want the fix, it's $9 through Whop."

The free-first promise is the pitch: nobody in the room is being asked to pay for an unproven service. They watch their app get broken, watched a list of every bug surface, and then choose.

**Live Stage Demo (2 Minutes):**

- **0:00 – 0:25 (The Real Revenue Proof):** Open the live Convex Treasury Header alongside the Whop dashboard showing real, settled $9 and $29 payments collected during the hackathon — Whop is the judge-verifiable source of truth; the ticker mirrors it.
- **0:25 – 1:10 (Autonomous Hunt + Deterministic Execution):** Trigger the Exa Prospector live on stage (or paste a volunteer judge's URL). Watch Convex stream the Solari 8ms Cloud Browser boot (8ms), the 90ms Sandbox, the seed derivation, and the deterministic suite tearing through desktop, mobile, and seeded chaos payloads in real time — catching a real mobile overflow and console error.
- **1:10 – 1:35 (Instant Whop Unlock):** Show the free layer first — the full findings table with every bug title, Bug #1 unblurred, and the run manifest with the `determinismHash`. Click "Unlock Full Autopsy," pay $9 live with Apple Pay inside the embedded Whop checkout, and watch the Convex UI instantly unblur the stack traces, reveal the AI fix patch, and tick the autonomous company's net profit counter up.
- **1:35 – 1:55 (The Zero-Human Company Buys Humans, Live):** The agent dispatches the Terac verification panel through the MCP/API — 3 real verified humans are paid to re-run the critical finding's exact repro steps on the volunteer's URL, and their HUMAN-VERIFIED stamps stream into the report as submissions land. (Queue the panel at 0:25 during the hunt so verdicts arrive on cue.) One line for the judges: our only "employee" is nobody — the company bought its QA humans through an API.
- **1:55 – 2:00 (Ship-Ready close):** "Verify my fix": apply the patch, run the included deterministic re-run with the same seed, and watch the report flip to a green **Ship-Ready** stamp — the paid product in one gesture: *we broke it for free, bots proved it, humans confirmed it, and the fix made the re-run green.*
