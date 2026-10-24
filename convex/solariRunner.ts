"use node";

// solariRunner.ts — BreakMyApp deterministic execution engine (Node actions).
//
// Runs the fixed, versioned deterministic-suite@1.0 against a target URL on a
// Solari Cloud Browser (stealth), BEFORE any payment. Same URL → same seed →
// same findings, same order, same payloads. A re-run re-executes the exact
// suite with the same stored seed — which is what makes paid fix-verification
// trustworthy: the re-run is the receipt.

import { env, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { lookup } from "node:dns/promises";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  VIEWPORT_MATRIX,
  hexSeed,
  jitterFor,
  payloadFor,
  determinismHash,
  SUITE_VERSION,
  isPublicWebUrl,
} from "./deterministic";

const RUN_BUDGET_MS = 100_000; // hard wall-clock budget for the whole suite
const NAV_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 4_000;
const SETTLE_MS = 400; // bounded settle wait after every seeded action
const MAX_ELEMENTS_PER_PASS = 40;
const MAX_FINDINGS = 12;
const BUNDLE_MAX_BYTES = 300 * 1024;
const BUNDLE_MAX_FETCHES = 6;
const BROWSER_SESSION_COST_CENTS = 4; // Solari session estimate → treasury

// Deterministic tracker/analytics blocklist — suppress ambient nondeterminism.
const TRACKER_BLOCKLIST: RegExp[] = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /connect\.facebook\.net/i,
  /partner\.googleadservices/i,
  /hotjar\.com/i,
  /mixpanel\.com/i,
  /segment\.(io|com)/i,
  /amplitude\.com/i,
  /posthog\.com/i,
  /clarity\.ms/i,
  /fullstory\.com/i,
  /mc\.yandex\.ru/i,
  /quantserve\.com/i,
  /scorecardresearch\.com/i,
];

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk_live_[A-Za-z0-9_-]{10,}\b/, label: "Stripe live secret key" },
  { re: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/, label: "OpenAI project API key" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/, label: "Google API key" },
  { re: /\bxox[baprs]-[A-Za-z0-9_-]{10,}\b/, label: "Slack token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key id" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "Embedded private key" },
  {
    re: /SUPABASE_(?:SERVICE_ROLE|KEY)\s*[:=]\s*["'][^"']{16,}["']/,
    label: "Supabase service-role secret",
  },
  {
    re: /NEXT_PUBLIC_(?:AWS_SECRET|SERVICE_ROLE|PRIVATE)[A-Z0-9_]*\s*[:=]\s*["'][^"']{16,}["']/,
    label: "Exposed NEXT_PUBLIC_ secret",
  },
];

const PLACEHOLDER_VALUES = /xxxx|example\b|dummy|placeholder|process\.env|your[-_]/i;

type FindingCategory =
  | "CONSOLE_CRASH"
  | "NETWORK_500_ERROR"
  | "MOBILE_OVERFLOW"
  | "BROKEN_DEAD_CTA"
  | "EXPOSED_SECRET_OR_HEADER";

type RawFinding = {
  category: FindingCategory;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  deterministicPayload?: string;
  reproductionSteps: string;
  rawErrorLog: string;
  aiSuggestedPatch: string;
  screenshot?: Uint8Array;
};

// Module-level mutable state is FORBIDDEN in Convex actions — concurrency-safe
// by passing everything through local scopes / ctx.

// ---------------------------------------------------------------------------
// Entry points (referenced by audits.ts as internal.solariRunner.*)
// ---------------------------------------------------------------------------

export const runDeterministicSuite = internalAction({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    await executeSuite(ctx, args.auditId, { isRerun: false });
    return null;
  },
});

export const runRerun = internalAction({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit: {
      status: string;
    } | null = await ctx.runQuery(internal.runnerBridge.getAuditById, {
      auditId: args.auditId,
    });
    if (!audit) {
      await fail(ctx, args.auditId, "Re-run target not found");
      return null;
    }
    if (audit.status !== "QUEUED") {
      return null;
    }
    await executeSuite(ctx, args.auditId, { isRerun: true });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Suite execution
// ---------------------------------------------------------------------------

type SuiteCtx = {
  seed: number;
  findings: RawFinding[];
  budgetLeft: () => number;
  push: (line: string) => Promise<void>;
};

async function executeSuite(
  ctx: ActionCtx,
  auditId: Id<"audits">,
  opts: { isRerun: boolean }
): Promise<void> {
  const apiKey = env.SOLARI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    await fail(ctx, auditId, "Solari not configured (missing SOLARI_API_KEY)");
    return;
  }

  const audit: { targetUrl: string; runSeed: number; status: string } | null =
    await ctx.runQuery(internal.runnerBridge.getAuditById, { auditId });
  if (!audit) return;

  const seed = audit.runSeed;
  const target = audit.targetUrl;
  const t0 = Date.now();
  const deadline = t0 + RUN_BUDGET_MS;

  const beforeTitles = opts.isRerun
    ? await ctx.runQuery(internal.runnerBridge.getFindingTitles, { auditId })
    : [];

  await append(
    ctx,
    auditId,
    opts.isRerun
      ? [
          `${stamp()} · FIX-VERIFICATION re-run — same seed ${hexSeed(seed)}, same suite, count the errors again`,
        ]
      : [
          `${stamp()} · Spinning up Solari Browser (stealth)…`,
          `${stamp()} · Run seed: ${hexSeed(seed)} (uint32 of sha256(normalizedUrl))`,
          `${stamp()} · Suite: ${SUITE_VERSION} · viewport matrix: desktop → mobile (fixed order)`,
        ],
    "DETERMINISTIC_RUN_RUNNING"
  );

  let bs: import("@solarisdk/browser").BrowserSession | undefined;
  const findings: RawFinding[] = [];
  try {
    const { Solari } = await import("@solarisdk/browser");
    const client = new Solari({ apiKey, baseUrl: env.SOLARI_BASE_URL || "https://api.getsolari.com" });
    const bootStart = Date.now();
    bs = await client.launch({ stealth: true });
    const browserBootMs = Date.now() - bootStart;
    await ctx.runMutation(internal.audits.markRunning, { auditId, browserBootMs });
    await append(ctx, auditId, [
      `${stamp()} · Solari browser boot: ${browserBootMs}ms · ${bs.version()}`,
      `${stamp()} · Stable network mode: tracker/ads domains blocked (deterministic list)`,
    ]);

    const suite: SuiteCtx = {
      seed,
      findings,
      budgetLeft: () => deadline - Date.now(),
      push: async (line) => append(ctx, auditId, [`${stamp()} · ${line}`]),
    };

    const addFinding = (f: RawFinding) => {
      if (findings.length >= MAX_FINDINGS) return;
      findings.push(f);
    };

    // -- Pass 1: desktop (1440×900) -----------------------------------------
    await runViewportPass(ctx, suite, bs, target, addFinding, {
      viewport: VIEWPORT_MATRIX[0],
      ctaCheck: true,
    });

    // -- Pass 2: mobile (390×844) --------------------------------------------
    if (suite.budgetLeft() > 25_000) {
      await runViewportPass(ctx, suite, bs, target, addFinding, {
        viewport: VIEWPORT_MATRIX[1],
        ctaCheck: false,
      });
    } else {
      await suite.push("Budget guard: skipping mobile pass to reserve time for sandbox analysis");
    }

    // -- Sandbox analysis: bundle + header scan -----------------------------
    if (suite.budgetLeft() > 8_000) {
      await ctx.runMutation(internal.audits.appendSteps, {
        auditId,
        lines: [`${stamp()} · Sandbox analysis: fetching JS bundles + security headers…`],
        status: "SANDBOX_ANALYZING",
      });
      await sandboxScan(suite, target);
    } else {
      await suite.push("Budget exhausted — skipped sandbox scan (bot evidence preserved)");
    }

    // -- Finalize ------------------------------------------------------------
    const dedupSeen = new Set<string>();
    const deduped = findings.filter((f) => {
      const key = `${f.category}|${f.title.slice(0, 60)}|${f.rawErrorLog.slice(0, 40)}`;
      if (dedupSeen.has(key)) return false;
      dedupSeen.add(key);
      return true;
    });
    sortBySeverity(deduped);
    const canonical = deduped.map(stripBulk);
    const hash = determinismHash(canonical);
    const criticalCount = deduped.filter((f) => f.severity === "CRITICAL").length;
    const totalMs = Date.now() - t0;

    const afterTitles: string[] = deduped.map((f: { title: string }) => f.title);
    const resolvedTitles: string[] = opts.isRerun
      ? beforeTitles.filter((t) => !afterTitles.includes(t))
      : [];
    const regressedTitles = opts.isRerun
      ? afterTitles.filter((t) => !beforeTitles.includes(t))
      : [];

    await ctx.runMutation(internal.audits.completeRun, {
      auditId,
      findings: canonical.map((f) => ({
        category: f.category,
        severity: f.severity,
        title: f.title,
        deterministicPayload: f.deterministicPayload ?? undefined,
        reproductionSteps: f.reproductionSteps,
        rawErrorLog: f.rawErrorLog.slice(0, 1200),
        aiSuggestedPatch: f.aiSuggestedPatch.slice(0, 1600),
      })),
      determinismHash: hash,
      screenshotDescriptors: deduped.flatMap((f, i) =>
        f.screenshot
          ? [{ index: i, bytes: new Uint8Array(f.screenshot).slice().buffer, mime: "image/jpeg" }]
          : []
      ),
      solariComputeCostCents: BROWSER_SESSION_COST_CENTS,
      isRerun: opts.isRerun,
      resolvedTitles,
      regressedTitles,
    });

    await append(ctx, auditId, [
      `${stamp()} · Suite finished: ${deduped.length} finding(s), ${criticalCount} critical — ${totalMs}ms total`,
      `${stamp()} · determinismHash: ${hash.slice(0, 32)}…`,
      opts.isRerun
        ? `${stamp()} · Fix diff: ${resolvedTitles.length} resolved, ${regressedTitles.length} regressed`
        : `${stamp()} · Report rendered free — paywall only touches deliverables, never the run`,
    ]);
  } catch (err) {
    await fail(ctx, auditId, err instanceof Error ? err.message : String(err));
  } finally {
    if (bs) {
      try {
        await bs.close();
      } catch {
        /* session release is best-effort */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Viewport pass
// ---------------------------------------------------------------------------

type AddFinding = (f: RawFinding) => void;

async function runViewportPass(
  _ctx: ActionCtx,
  suite: SuiteCtx,
  bs: import("@solarisdk/browser").BrowserSession,
  target: string,
  addFinding: AddFinding,
  pass: { viewport: { name: string; width: number; height: number }; ctaCheck: boolean }
): Promise<void> {
  const vp = pass.viewport;
  const collectors = { pageErrors: [] as string[], consoleErrors: [] as string[], bad: [] as Array<{ status: number; url: string }> };
  const page = await bs.newPage();
  try {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.route("**/*", async (route: any) => {
      const url = String(route.request()?.url?.() ?? "");
      if (TRACKER_BLOCKLIST.some((r) => r.test(url)) || !(await isSafeTarget(url))) {
        await route.abort().catch(() => undefined);
        return;
      }
      await route.continue().catch(() => undefined);
    });
    page.on("pageerror", (e: Error) => {
      if (collectors.pageErrors.length < 60) {
        collectors.pageErrors.push(String(e?.message ?? e).slice(0, 400));
      }
    });
    page.on("console", (m: any) => {
      if (m.type?.() === "error" && collectors.consoleErrors.length < 60) {
        collectors.consoleErrors.push(String(m.text?.() ?? "").slice(0, 300));
      }
    });
    page.on("response", (r: any) => {
      const s = Number(r.status?.() ?? 0);
      if (s >= 400 && collectors.bad.length < 40) {
        collectors.bad.push({ status: s, url: String(r.url?.() ?? "") });
      }
    });

    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
      await suite.push(`${vp.name} (${vp.width}×${vp.height}): MAIN DOCUMENT DID NOT LOAD`);
      const shot = await snap(page);
      addFinding({
        category: "NETWORK_500_ERROR",
        severity: "CRITICAL",
        title: `Main document fails to load (first paint never settles)`,
        reproductionSteps: `1. Open ${target}\n2. Wait up to 20s for first paint.\n3. Observe: navigation never settles (timeout / net error).`,
        rawErrorLog: msg,
        aiSuggestedPatch:
          "Nothing can be verified behind a hanging first paint. Profile TTFB (server timing), remove render-blocking hydration stalls, and check edge/DNS/TLS returns. Re-run this suite after deploy — the run manifest hash stays valid because the suite did not change.",
        screenshot: shot,
      });
      return;
    }

    await wait(jitterFor(suite.seed, 1));
    await suite.push(`${vp.name} (${vp.width}×${vp.height}): loaded OK`);

    // Mobile overflow detection (mobile pass only).
    if (vp.name === "mobile") {
      const overflow = (await detectOverflow(page).catch(() => null)) as
        | { overflowing: boolean; scrollWidth: number; innerWidth: number; offenders: string[] }
        | null;
      if (overflow?.overflowing) {
        await suite.push(
          `${vp.name}: 1 DOM clip detected (scrollWidth ${overflow.scrollWidth} > viewport ${overflow.innerWidth})`
        );
        const shot = await snap(page);
        addFinding({
          category: "MOBILE_OVERFLOW",
          severity: "HIGH",
          title: "Horizontal overflow on mobile (390×844) — content clipped off-screen",
          reproductionSteps: `1. Open ${target}\n2. Set viewport to 390×844 (iPhone-class).\n3. Observe: document.scrollWidth (${overflow.scrollWidth}) exceeds innerWidth (${overflow.innerWidth}).\n4. Offending element(s): ${overflow.offenders.join(" · ") || "root"}`,
          rawErrorLog: `scrollWidth=${overflow.scrollWidth}; innerWidth=${overflow.innerWidth}; offenders=${overflow.offenders.join("; ")}`,
          aiSuggestedPatch: `Add to the global stylesheet:\n\n\`\`\`css\nhtml, body { max-width: 100vw; overflow-x: hidden; }\n\`\`\`\n\nThen constrain the offender(s) (${overflow.offenders[0] ?? "root container"}) — their parent grid/flex track needs minmax(0, ...) or width:100% so children can shrink.`,
          screenshot: shot,
        });
      } else {
        await suite.push(`${vp.name}: no horizontal overflow`);
      }
    }

    // Seeded chaos fuzzing — fixed payload pack, fixed DOM order.
    await suite.push(`Injecting seeded chaos payloads… (${vp.name} pass)`);
    const els = (await collectInteractive(page).catch(() => [])) as Array<{ tag: string; selector: string; label: string }>;
    let probed = 0;
    for (const el of els) {
      if (suite.budgetLeft() < 8_000 || probed >= MAX_ELEMENTS_PER_PASS) break;
      probed += 1;
      const beforeErrors = collectors.pageErrors.length;
      const payload = payloadFor(suite.seed, probed);
      try {
        if (el.tag === "input" || el.tag === "textarea") {
          await page.fill(el.selector, payload, { timeout: ACTION_TIMEOUT_MS, noWaitAfter: true });
        } else if (el.tag === "select") {
          await page.selectOption(el.selector, { index: 0 }, { timeout: ACTION_TIMEOUT_MS });
        } else {
          await page.click(el.selector, { timeout: ACTION_TIMEOUT_MS, noWaitAfter: true });
        }
      } catch {
        /* the action itself failing is common on live sites; not a finding */
      }
      await wait(SETTLE_MS);
      if (collectors.pageErrors.length > beforeErrors) {
        const msg = collectors.pageErrors[collectors.pageErrors.length - 1] ?? "unknown error";
        const isCta = vp.name === "desktop" && CTA_TEXT.test(el.label);
        const shot = await snap(page);
        addFinding({
          category: "CONSOLE_CRASH",
          severity: el.tag === "button" ? "CRITICAL" : "HIGH",
          title:
            el.tag === "button"
              ? `Unhandled exception on click of ${summarizeLabel(el)}`
              : `Unhandled exception after typing malformed payload into ${summarizeLabel(el)}`,
          deterministicPayload: el.tag === "button" ? undefined : payload,
          reproductionSteps:
            `1. Open ${target} (${vp.name}).\n` +
            (el.tag === "button"
              ? `2. Click the control "${el.label.slice(0, 32) || el.selector}".\n3. Observe: uncaught exception in console.`
              : `2. Type the deterministic payload "${payload.slice(0, 40)}" into the field "${el.label.slice(0, 32) || el.selector}".\n3. Observe: uncaught exception in console.`),
          rawErrorLog: msg,
          aiSuggestedPatch:
            "The handler above crashes on unexpected input — wrap it, null-guard the parsed state, and replay this exact deterministic payload after deploy to confirm. Example:\n\n```tsx\nconst handler = (e?) => {\n  try {\n    // existing logic\n  } catch (err) {\n    console.error(\"handled\", err);\n    setError(\"That input caused a problem\");\n  }\n};\n```",
          screenshot: shot,
        });
        if (isCta) {
          await suite.push(`CONVERSION CTA CRASHES: "${el.label.slice(0, 24)}" — Critical`);
        }
      }
    }
    await suite.push(`Chaos pass complete — ${probed} control(s) probed in fixed DOM order`);

    // 4xx/5xx sweep from network traffic during this pass.
    const fiveXX = collectors.bad.filter((b) => b.status >= 500);
    if (fiveXX.length > 0 && vp.name === "desktop") {
      const shot = await snap(page);
      addFinding({
        category: "NETWORK_500_ERROR",
        severity: "CRITICAL",
        title: `${fiveXX.length} server error(s) (5xx) during deterministic crawl`,
        reproductionSteps: `1. Open ${target}\n2. Repro with the deterministic suite (same seed) — the crawl order is fixed.\n3. Observe: ${fiveXX.slice(0, 3).map((r) => `HTTP ${r.status} → ${r.url.slice(0, 90)}`).join(" · ")}`,
        rawErrorLog: fiveXX.slice(0, 6).map((r) => `${r.status} ${r.url}`).join("\n"),
        aiSuggestedPatch:
          "These endpoints 500 during an unauthenticated crawl: add input validation + error boundaries on the failing route, and check server log correlation ids at the same URLs.",
        screenshot: shot,
      });
    }

    // Dead-CTA static detection (desktop pass only).
    if (pass.ctaCheck && suite.budgetLeft() > 8_000) {
      const dead = (await detectDeadCtas(page).catch(() => [])) as string[];
      for (const label of dead.slice(0, 2)) {
        addFinding({
          category: "BROKEN_DEAD_CTA",
          severity: "MEDIUM",
          title: `Clicking "${label}" does nothing — no handler bound`,
          reproductionSteps: `1. Open ${target}.\n2. Click the CTA labeled "${label}".\n3. Observe: no navigation, no listener, no form submission — silent no-op on a conversion path.`,
          rawErrorLog: `Static scan: button "${label}" has no onclick, no form ancestor, and is not an anchor.`,
          aiSuggestedPatch:
            "Bind a real handler (form submit or router navigation) to the CTA — or render it visibly disabled until ready. A silent no-op button on the money path reads as a broken product.",
        });
      }
    }
  } finally {
    try {
      await page.close();
    } catch {
      /* page already closed */
    }
  }
}

// ---------------------------------------------------------------------------
// Sandbox analysis (public bundle + header scan, executed from this action)
// ---------------------------------------------------------------------------

async function sandboxScan(suite: SuiteCtx, target: string): Promise<void> {
  const resp = await fetchWithTimeout(target, 10_000).catch(() => undefined);
  if (!resp) {
    await suite.push("Sandbox: homepage unreachable from audit region — bundle scan skipped");
    return;
  }
  const headers = collectHeaders(resp);
  const html = (await resp.text()).slice(0, BUNDLE_MAX_BYTES * 2);

  // Header gaps (grouped into one finding).
  const headerMisses: string[] = [];
  if (!hasHeader(headers, "content-security-policy")) {
    headerMisses.push("Content-Security-Policy (injection hardening absent)");
  }
  if (!hasHeader(headers, "strict-transport-security")) {
    headerMisses.push("Strict-Transport-Security (no HSTS downgrade protection)");
  }
  if (!hasHeader(headers, "x-content-type-options")) {
    headerMisses.push("X-Content-Type-Options (MIME sniffing enabled)");
  }
  const acao = headers["access-control-allow-origin"];
  if (acao && acao.trim() === "*") {
    headerMisses.push("Access-Control-Allow-Origin: * (any origin reads your API)");
  }
  if (headerMisses.length > 0) {
    sandboxAddFinding(suite, {
      category: "EXPOSED_SECRET_OR_HEADER",
      severity: "MEDIUM",
      title: `Missing HTTP security headers (${headerMisses.length} gap${headerMisses.length > 1 ? "s" : ""})`,
      reproductionSteps: `1. GET ${target}\n2. Inspect response headers.\n3. Missing: ${headerMisses.join("; ")}`,
      rawErrorLog: headerMisses.map((h) => `MISSING: ${h}`).join("\n"),
      aiSuggestedPatch:
        "Ship security headers at the edge. Next.js config example:\n\n```js\n// next.config.js\nasync headers() {\n  return [{ source: \"/(.*)\", headers: [\n    { key: \"Content-Security-Policy\", value: \"default-src 'self'; script-src 'self' 'unsafe-inline'\" },\n    { key: \"Strict-Transport-Security\", value: \"max-age=63072000; includeSubDomains; preload\" },\n    { key: \"X-Content-Type-Options\", value: \"nosniff\" },\n  ]}];\n}\n```",
    });
  }

  // Client-side bundles + secret scan.
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
    .map((m) => absoluteUrl(m[1], target))
    .filter((u): u is string => !!u)
    .filter((u) => !TRACKER_BLOCKLIST.some((r) => r.test(u)))
    .slice(0, BUNDLE_MAX_FETCHES);

  let text = html;
  for (const src of srcs) {
    const body = await fetchTextLite(src);
    text += `\n/* ${src} */\n` + body.slice(0, BUNDLE_MAX_BYTES);
  }

  let secretHits = 0;
  for (const p of SECRET_PATTERNS) {
    if (secretHits >= 4) break;
    const m = text.match(p.re);
    if (!m) continue;
    if (PLACEHOLDER_VALUES.test(m[0])) continue;
    secretHits += 1;
    sandboxAddFinding(suite, {
      category: "EXPOSED_SECRET_OR_HEADER",
      severity: /live|SERVICE_ROLE|SERVICE ROLE|private key/i.test(p.label) ? "CRITICAL" : "HIGH",
      title: `${p.label} shipped in client-side JavaScript`,
      reproductionSteps: `1. Open ${target} in a browser.\n2. DevTools → Network → download the JS bundle(s) the site serves to every visitor.\n3. Search for pattern ${p.re.toString()}\n4. Observe: ${m[0].slice(0, 24)}… — a burned credential with no sign-in required.`,
      rawErrorLog: `Pattern ${p.re.toString()}\nMatch found in ${srcs.length ? "fetched bundle(s)" : "inline HTML"}: ${m[0].slice(0, 40)}…\nBundles scanned: ${srcs.length}`,
      aiSuggestedPatch:
        "Rotate this credential NOW (it is burned — assume compromised), move it server-side behind an API route, and add secret-scanning to CI. Example (Next.js):\n\n```ts\n// app/api/action/route.ts\nimport Stripe from \"stripe\";\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\n// the key never reaches the browser\n```",
    });
  }
  await suite.push(
    `Sandbox scan done: ${srcs.length} bundle(s), ${secretHits} secret hit(s), ${headerMisses.length} header gap(s)`
  );
}

function sandboxAddFinding(suite: SuiteCtx, f: RawFinding): void {
  if (suite.findings.length >= MAX_FINDINGS) return;
  suite.findings.push(f);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTA_TEXT = /(buy|checkout|sign ?up|subscribe|submit|get started|continue|join|start|pay)/i;

async function snap(page: any): Promise<Uint8Array | undefined> {
  try {
    return (await page.screenshot({ type: "jpeg", quality: 60 })) as Uint8Array;
  } catch {
    return undefined;
  }
}

async function collectInteractive(page: any): Promise<unknown> {
  return await page.evaluate(() => {
    const cta = "button, input, textarea, select, [role=button]";
    const nodes = Array.from(document.querySelectorAll(cta)) as HTMLElement[];
    const out: Array<{ tag: string; selector: string; label: string }> = [];
    for (const n of nodes) {
      if (out.length >= 40) break;
      const r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const tag = (n.tagName || "").toLowerCase();
      let selector = tag;
      if (n.id) selector = "#" + n.id;
      else if (n.getAttribute && n.getAttribute("name"))
        selector = tag + '[name="' + n.getAttribute("name") + '"]';
      else {
        let cur: Element | null = n;
        const path: string[] = [];
        while (cur && cur !== document.body && path.length < 4) {
          const parent = cur.parentElement;
          if (parent) {
            const sibs = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
            const sibIdx = sibs.indexOf(cur) + 1;
            path.unshift(cur.tagName.toLowerCase() + ":nth-of-type(" + sibIdx + ")");
          }
          cur = cur.parentElement;
        }
        selector = path.join(" ") || tag;
      }
      const label =
        (tag === "input" || tag === "textarea"
          ? n.getAttribute("placeholder") || n.getAttribute("aria-label") || n.getAttribute("name") || ""
          : (n.textContent || "")) || "";
      out.push({
        tag,
        selector: String(selector).slice(0, 220),
        label: label.replace(/\s+/g, " ").trim().slice(0, 60),
      });
    }
    return out;
  });
}

async function detectOverflow(page: any): Promise<unknown> {
  return await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const windowWidth = window.innerWidth;
    if (!(scrollWidth > windowWidth)) {
      return { overflowing: false, scrollWidth, innerWidth: windowWidth, offenders: [] };
    }
    const offenders: string[] = [];
    const nodes = Array.from(document.body.querySelectorAll("*")) as HTMLElement[];
    for (let i = 0; i < nodes.length && offenders.length < 3; i++) {
      const n = nodes[i];
      const r = n.getBoundingClientRect();
      if (r.right > windowWidth + 2 && r.width > 24) {
        const t = n.tagName.toLowerCase();
        const cls =
          typeof n.className === "string" && n.className
            ? "." + n.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")
            : "";
        offenders.push(t + (n.id ? "#" + n.id : "") + cls);
      }
    }
    return { overflowing: true, scrollWidth, innerWidth: windowWidth, offenders };
  });
}

async function detectDeadCtas(page: any): Promise<unknown> {
  return await page.evaluate(() => {
    const ctaRe = /(buy|checkout|sign ?up|subscribe|submit|get started|continue|join|start|pay)/i;
    const nodes = Array.from(document.querySelectorAll("button, [role=button]")) as HTMLElement[];
    const dead: string[] = [];
    for (const n of nodes.slice(0, 30)) {
      const r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const text = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (!ctaRe.test(text)) continue;
      const names = n.getAttributeNames ? n.getAttributeNames() : [];
      const hasOn = names.some((a) => a.startsWith("on"));
      const inForm = n.closest("form") !== null;
      if (!hasOn && !inForm && dead.length < 5) dead.push(text.slice(0, 32));
    }
    return dead;
  });
}

function summarizeLabel(el: { label: string; selector: string }): string {
  return el.label ? `"${el.label.slice(0, 36)}"` : el.selector.slice(0, 40);
}

function sortBySeverity(fs: RawFinding[]): void {
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  fs.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function stripBulk(f: RawFinding) {
  return {
    category: f.category,
    severity: f.severity,
    title: f.title,
    deterministicPayload: f.deterministicPayload ?? null,
    reproductionSteps: f.reproductionSteps,
    rawErrorLog: f.rawErrorLog,
    aiSuggestedPatch: f.aiSuggestedPatch,
  };
}

function stamp(): string {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  const bounded = Math.max(0, Math.min(ms, 4000));
  if (bounded === 0) return Promise.resolve();
  return new Promise((res) => setTimeout(res, bounded));
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!(await isSafeTarget(url))) throw new Error("Audit request blocked: non-public destination");
      const response = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "User-Agent": `Mozilla/5.0 (compatible; BreakMyAppBot/1.0; ${SUITE_VERSION})`,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
    });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      await response.body?.cancel();
      url = new URL(location, url).toString();
    }
    throw new Error("Too many audit redirects");
  } finally {
    clearTimeout(t);
  }
}

async function fetchTextLite(url: string): Promise<string> {
  try {
    const r = await fetchWithTimeout(url, 6_000);
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return "";
  }
}

/** Check both the spelling and DNS destination, including redirected resources. */
async function isSafeTarget(url: string): Promise<boolean> {
  if (!isPublicWebUrl(url)) return false;
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true });
    return addresses.length > 0 && addresses.every(({ address, family }) =>
      family === 6 ? /^[23][0-9a-f]*:/i.test(address) : isPublicWebUrl(`https://${address}`));
  } catch { return false; }
}

function absoluteUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function collectHeaders(resp: Response): Record<string, string> {
  const out: Record<string, string> = {};
  resp.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  return !!headers[key] && headers[key].trim().length > 0;
}

async function append(
  ctx: ActionCtx,
  auditId: Id<"audits">,
  lines: string[],
  status?: "DETERMINISTIC_RUN_RUNNING" | "SANDBOX_ANALYZING"
): Promise<void> {
  try {
    await ctx.runMutation(internal.audits.appendSteps, {
      auditId,
      lines,
      ...(status ? { status } : {}),
    });
  } catch {
    /* audit row may be gone; keep working */
  }
}

async function fail(
  ctx: ActionCtx,
  auditId: Id<"audits">,
  message: string
): Promise<void> {
  try {
    await ctx.runMutation(internal.audits.failRun, { auditId, errorMessage: message });
  } catch {
    /* ignore */
  }
}
