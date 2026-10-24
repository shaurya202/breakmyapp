// scripts/exa-prospect.mjs — BreakMyApp Exa Autonomous Prospector
//
// Canonical usage shapes from the `build-with-exa` skill (Exa API, version 0.3.0):
//   Discovery:  POST /search  — recency + source preference phrased in the query,
//               `type: "auto"`, `contents: { highlights: true }`, small outputSchema.
//               `startPublishedDate` is used here because the 15-minute hunter enforces a
//               bounded window ("last 24h") so stale launches are never re-hunted — this is
//               a task-stated hard filter, not a "recent" boilerplate (skill: search.md).
//   Enrichment: POST /agent/runs — People + Company enrichment is a list-building/enrichment
//               workflow, which the skill routes to the Agent API. `category: "people"` /
//               `category: "company"` on /search is reserved for raw people/company
//               documents and is NOT used here (skill: search.md pitfall 6, agent.md).
//               Known rows go in `input.data`, not pasted into the query (skill: agent.md).
//
// Usage:
//   node scripts/exa-prospect.mjs discover          # find fresh launches
//   node scripts/exa-prospect.mjs enrich "<url>"    # people+company research for one target
//   node scripts/exa-prospect.mjs full [n]          # discover, then enrich first n rows (default 3)

import fs from "node:fs";
import path from "node:path";

const API = "https://api.exa.ai";

// ---- local .env loader (key can live in a project .env instead of a shell var) ----
// Robust to common Windows editor artifacts: UTF-16 LE BOM (Notepad "Unicode"),
// UTF-8 BOM, CRLF lines, `export KEY=...` prefixes, and quoted values.
function readTextViaBom(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of readTextViaBom(fs.readFileSync(envPath)).split(/\r?\n/)) {
      const cleaned = line.replace(/^\uFEFF/, "").trim();
      const m = cleaned.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !(m[1] in process.env)) {
        const value = m[2].replace(/^["']|["']$/g, "").trim();
        process.env[m[1]] = value;
        if (m[1].toUpperCase() !== m[1]) process.env[m[1].toUpperCase()] = value;
      }
    }
  }
} catch {
  /* loader is non-fatal; shell env is the primary mechanism */
}

const KEY = process.env.EXA_API_KEY;
if (!KEY || !KEY.trim()) {
  console.error(
    "EXA_API_KEY is not set.\n" +
      "Set it for the session:   setx EXA_API_KEY \"tk-less exa key from dashboard.exa.ai\"  (new shells only)\n" +
      "Or put it in this project: copy .env.example to .env and paste the key there."
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Both consumed headers are the skill-documented forms: `x-api-key` (or Bearer).
async function exa(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Exa ${endpoint} failed (${res.status}):`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

// ---------------------------- Phase 1: launch discovery (/search) ----------------------------
async function discover() {
  // Hours-ago ISO for the enforced 24h window (task-stated: the 15-min hunter must not re-hunt).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const body = {
    // Recency and source preferences live in the query — never as top-level filter boilerplate.
    query:
      "Show HN launches posted in the last day and Product Hunt launches this week for new web apps and developer tools",
    type: "auto",
    contents: { highlights: true }, // the recommended exact-ONE extraction mode
    // Task-stated bounded window that MUST be enforced (skill-sanctioned use of the filter):
    startPublishedDate: since,
    // "The search is one step of a larger task": the larger task is the audit pipeline.
    objective:
      "One step of the BreakMyApp audit pipeline: prefer posts that reveal a live, runnable product URL; rank fresh small indie launches first; pull from pages only what the schema needs.",
    // Keep/drop rules belong here, never in `query` (skill: "same words, wrong field").
    systemPrompt:
      "Include only genuine product launch posts or pages. The same product across multiple sources is one launch; prefer the official live app URL. Only accept a target_url that is a live product link (not the launch-thread home). Copy founder names/handles exactly as the page shows them; use null when the page does not name anyone, never guess.",
    // Fields that must come OUT OF THE PAGE go in outputSchema; title/url/date don't.
    outputSchema: {
      type: "object",
      properties: {
        launches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string" },
              target_url: { type: "string", format: "uri" },
              one_liner: { type: "string" },
              founder_hint: { type: ["string", "null"] },
            },
            required: ["product_name", "target_url"],
          },
        },
      },
      required: ["launches"],
    },
  };

  console.log("→ POST /search …");
  const json = await exa("/search", body);

  console.log(`\nresults: ${json.results?.length ?? 0}  |  searchTime: ${json.searchTime}ms  |  cost: $${json.costDollars?.total ?? json.costDollars}`);
  for (const r of json.results ?? []) {
    console.log(`  • ${r.title} — ${r.url}`);
  }

  const launches = json.output?.content?.launches ?? [];
  console.log(`\nstructured launches (${launches.length}):`);
  for (const l of launches) console.log(" ", JSON.stringify(l));

  if (json.output?.grounding?.length) {
    // Grounding entry shape is not pinned in the references; extract defensively.
    const first = json.output.grounding[0] ?? {};
    const keys = Object.keys(first);
    const pickStr = (o, pred) => Object.entries(o).find(([, v]) => typeof v === "string" && pred(v))?.[1];
    console.log(`\ngrounding (keys: ${keys.join(", ") || "none"}):`);
    for (const g of json.output.grounding) {
      const url = pickStr(g, (v) => v.startsWith("http"));
      const label = pickStr(g, (v) => !v.startsWith("http")) ?? "";
      console.log(`  [${label || "src"}] ${url ?? JSON.stringify(g).slice(0, 80)}`);
    }
  }
  return launches;
}

// -------------------- Phase 2: People + Company enrichment (/agent/runs) --------------------
async function enrich(row) {
  const body = {
    query:
      "Research the founder(s) and company behind this newly launched product. Find the real names and social/contact of the founders, what the company is, its competitive context, and how greenfield the product is.",
    // Always explicit. `low` = the fixed cheap band for autonomous economics.
    // No `budget` — budget.maxCostDollars is only accepted with `auto`/`ultra` and would be rejected.
    effort: "low",
    // Known rows are enriched via input.data — never pasted wholesale into the query.
    input: { data: [row] },
    // Bounded, small, flat: roots ≤5, arrays declare maxItems (skill: agent.md + structured-output patterns).
    outputSchema: {
      type: "object",
      properties: {
        people: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              contact_url: { type: "string", format: "uri" },
              contact_email: { type: "string", format: "email" },
            },
            required: ["name"],
          },
        },
        company: {
          type: "object",
          properties: {
            name: { type: "string" },
            one_liner: { type: "string" },
            competitors: { type: "array", maxItems: 5, items: { type: "string" } },
            ship_context: { type: "string" },
          },
          required: ["name", "one_liner"],
        },
      },
      required: ["company"],
    },
  };

  console.log(`\n→ POST /agent/runs for ${row.target_url ?? row.product ?? "?"} …`);
  const run = await exa("/agent/runs", body);
  console.log(`  run: ${run.id}  status: ${run.status}`);

  // Full lifecycle (skill: "do not stop at create"): poll until terminal, then check HOW it ended.
  const started = Date.now();
  let finished = run;
  while (!["completed", "failed", "cancelled"].includes(finished.status)) {
    if (Date.now() - started > 8 * 60 * 1000) {
      console.error(`  giving up after 8 min; last status=${finished.status}`);
      return null;
    }
    await sleep(4000);
    const res = await fetch(`${API}/agent/runs/${run.id}`, {
      headers: { "x-api-key": KEY },
    });
    finished = await res.json();
    if (res.ok) console.log(`  status=${finished.status}`);
    else {
      console.error("  poll failed:", res.status, JSON.stringify(finished));
      return null;
    }
  }

  if (finished.status !== "completed") {
    // Failures must surface (a `completed`-only loop would hang forever on failed runs).
    console.error(`  run ended as ${finished.status}:`, JSON.stringify(finished.error ?? finished.stopReason));
    return null;
  }

  console.log(`  stopReason: ${finished.stopReason}  cost: $${finished.costDollars?.total ?? JSON.stringify(finished.costDollars)}`);
  const s = finished.output?.structured;
  if (s) {
    console.log("  structured:", JSON.stringify(s, null, 2));
    if (s.people?.length) {
      console.log("  founders:");
      for (const p of s.people) console.log(`    • ${p.name}${p.contact_url ? ` — ${p.contact_url}` : ""}${p.contact_email ? ` — ${p.contact_email}` : ""}`);
    }
  }
  if (finished.output?.grounding?.length) {
    // Same defensive extraction as /search: entries carry {field, citations[], confidence}.
    const first = finished.output.grounding[0] ?? {};
    const keys = Object.keys(first);
    const usesCitations = Array.isArray(first.citations);
    const pickStr = (o, pred) => Object.entries(o).find(([, v]) => typeof v === "string" && pred(v))?.[1];
    console.log(`  grounding (keys: ${keys.join(", ") || "none"}) — field-level citations for the report page:`);
    for (const g of finished.output.grounding.slice(0, 6)) {
      const label = usesCitations ? (g.field ?? "src") : (pickStr(g, (v) => !v.startsWith("http")) ?? "src");
      const entry = g.citations?.[0]?.url ?? pickStr(g, (v) => v.startsWith("http")) ?? "";
      console.log(`    ${label} → ${entry}`);
    }
  }
  return finished;
}

// ------------------------------------------- CLI --------------------------------------------
const [, , cmd, arg] = process.argv;
const cmd_ = cmd ?? "discover";

if (cmd_ === "discover") {
  await discover();
} else if (cmd_ === "enrich") {
  if (!arg) {
    console.error('Provide a target: node scripts/exa-prospect.mjs enrich "https://your-launch.vercel.app"');
    process.exit(1);
  }
  const enriched = await enrich({ target_url: arg });
  process.exit(enriched ? 0 : 2);
} else if (cmd_ === "full") {
  const limit = Math.max(1, Math.min(Number(arg ?? 3), 10));
  const launches = await discover();
  for (const row of launches.slice(0, limit)) {
    await enrich(row);
  }
} else {
  console.error(`Unknown command "${cmd_}". Use discover | enrich | full.`);
  process.exit(1);
}
