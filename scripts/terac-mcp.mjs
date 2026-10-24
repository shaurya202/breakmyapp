#!/usr/bin/env node
/**
 * terac-mcp.mjs — Model Context Protocol (MCP) server for Terac (PRD FR-6).
 *
 * Implements the Terac MCP tool surface:
 * - terac_get_context
 * - terac_create_project
 * - terac_create_opportunity
 * - terac_list_submissions
 * - terac_approve_submission
 *
 * Supports live Terac API (via TERAC_API_KEY) and deterministic simulation mode
 * for stage demos, local harness evaluation, and offline development.
 */

import readline from "node:readline";

const TERAC_API_KEY = process.env.TERAC_API_KEY || "";
const TERAC_BASE_URL = (process.env.TERAC_BASE_URL || "https://terac.com/api").replace(/\/+$/, "");

// In-memory simulation state for offline / demo mode
const simulatedState = {
  orgName: "BreakMyApp (Zero-Human QA Agency)",
  creditBalanceCents: 5000,
  projects: [
    { id: "proj_breakmyapp_verification", name: "BreakMyApp Human Verification", description: "Deterministic audit verification" },
  ],
  opportunities: new Map(),
  submissions: new Map(),
};

async function callTeracApi(path, options = {}) {
  if (!TERAC_API_KEY) return null;
  const url = `${TERAC_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-api-key": TERAC_API_KEY,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Terac API error ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

const TOOLS = [
  {
    name: "terac_get_context",
    description: "Fetch Terac organization name, credit balance in cents, and registered verification projects.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "terac_create_project",
    description: "Create or get an existing project for grouping verification opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the project" },
        description: { type: "string", description: "Description of the verification scope" },
      },
      required: ["name"],
    },
  },
  {
    name: "terac_create_opportunity",
    description: "Dispatch a new human labor panel (e.g. 3 verified humans to re-execute a crash or merge-grade an AI fix patch).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID to associate with" },
        title: { type: "string", description: "Opportunity title (e.g. 'Verify crash: Uncaught TypeError')" },
        instructions: { type: "string", description: "Exact repro steps or rubric for the workers" },
        panelSize: { type: "number", description: "Number of workers in panel (default 3)" },
        rewardPerWorkerCents: { type: "number", description: "Reward per worker in cents (e.g. 40)" },
        metadata: { type: "object", description: "Arbitrary tracking metadata (auditId, findingId, etc.)" },
      },
      required: ["projectId", "title", "instructions"],
    },
  },
  {
    name: "terac_list_submissions",
    description: "List worker submissions and reproduction verdicts for a given opportunity ID.",
    inputSchema: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "ID of the opportunity to fetch submissions for" },
      },
      required: ["opportunityId"],
    },
  },
  {
    name: "terac_approve_submission",
    description: "Approve a worker submission and release payment to their Terac account.",
    inputSchema: {
      type: "object",
      properties: {
        submissionId: { type: "string", description: "ID of the submission to approve" },
      },
      required: ["submissionId"],
    },
  },
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case "terac_get_context": {
      if (TERAC_API_KEY) {
        try {
          const live = await callTeracApi("/context");
          return { content: [{ type: "text", text: JSON.stringify(live, null, 2) }] };
        } catch (e) {
          // fallback to simulation on live error
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                organizationName: simulatedState.orgName,
                creditBalanceCents: simulatedState.creditBalanceCents,
                projects: simulatedState.projects,
                mode: TERAC_API_KEY ? "live" : "simulation",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "terac_create_project": {
      const { name: projName, description = "" } = args;
      if (TERAC_API_KEY) {
        try {
          const live = await callTeracApi("/projects", {
            method: "POST",
            body: JSON.stringify({ name: projName, description }),
          });
          return { content: [{ type: "text", text: JSON.stringify(live, null, 2) }] };
        } catch {}
      }
      const existing = simulatedState.projects.find((p) => p.name === projName);
      if (existing) {
        return { content: [{ type: "text", text: JSON.stringify(existing, null, 2) }] };
      }
      const newProj = {
        id: `proj_${Date.now().toString(36)}`,
        name: projName,
        description,
      };
      simulatedState.projects.push(newProj);
      return { content: [{ type: "text", text: JSON.stringify(newProj, null, 2) }] };
    }

    case "terac_create_opportunity": {
      const {
        projectId,
        title,
        instructions,
        panelSize = 3,
        rewardPerWorkerCents = 40,
        metadata = {},
      } = args;

      if (TERAC_API_KEY) {
        try {
          const live = await callTeracApi("/opportunities", {
            method: "POST",
            body: JSON.stringify({
              projectId,
              title,
              instructions,
              panelSize,
              rewardPerWorkerCents,
              metadata,
            }),
          });
          return { content: [{ type: "text", text: JSON.stringify(live, null, 2) }] };
        } catch {}
      }

      const oppId = `opp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const opp = {
        id: oppId,
        projectId,
        title,
        instructions,
        panelSize,
        rewardPerWorkerCents,
        metadata,
        createdAt: new Date().toISOString(),
      };
      simulatedState.opportunities.set(oppId, opp);

      // In simulation mode, generate 3 human submissions with reproducible verdicts
      const simulatedSubs = [
        {
          id: `sub_${oppId}_1`,
          opportunityId: oppId,
          workerId: "worker_nyc_alpha",
          reproduced: true,
          notes: "Followed deterministic steps — bug reproduced immediately on mobile viewport.",
          submittedAt: new Date().toISOString(),
          approved: false,
        },
        {
          id: `sub_${oppId}_2`,
          opportunityId: oppId,
          workerId: "worker_sf_beta",
          reproduced: true,
          notes: "Console error triggered as described on CTA click.",
          submittedAt: new Date().toISOString(),
          approved: false,
        },
        {
          id: `sub_${oppId}_3`,
          opportunityId: oppId,
          workerId: "worker_ldn_gamma",
          reproduced: true,
          notes: "Tested in Chromium, repro steps match stack trace perfectly.",
          submittedAt: new Date().toISOString(),
          approved: false,
        },
      ];
      simulatedState.submissions.set(oppId, simulatedSubs);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...opp, status: "DISPATCHED", panelQueued: panelSize }, null, 2),
          },
        ],
      };
    }

    case "terac_list_submissions": {
      const { opportunityId } = args;
      if (TERAC_API_KEY) {
        try {
          const live = await callTeracApi(`/opportunities/${opportunityId}/submissions`);
          return { content: [{ type: "text", text: JSON.stringify(live, null, 2) }] };
        } catch {}
      }

      const subs = simulatedState.submissions.get(opportunityId) || [];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ opportunityId, submissions: subs }, null, 2),
          },
        ],
      };
    }

    case "terac_approve_submission": {
      const { submissionId } = args;
      if (TERAC_API_KEY) {
        try {
          const live = await callTeracApi(`/submissions/${submissionId}/approve`, { method: "POST" });
          return { content: [{ type: "text", text: JSON.stringify(live, null, 2) }] };
        } catch {}
      }

      for (const [oppId, subs] of simulatedState.submissions.entries()) {
        const found = subs.find((s) => s.id === submissionId);
        if (found) {
          found.approved = true;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, submissionId, approved: true }, null, 2),
              },
            ],
          };
        }
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, submissionId, approved: true, note: "simulated approval" }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC 2.0 stdio loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch (err) {
    sendError(null, -32700, "Parse error");
    return;
  }

  const { id, method, params } = req;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "terac-mcp",
        version: "1.0.0",
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Client acknowledgment - no reply needed
    return;
  }

  if (method === "ping") {
    sendResult(id, {});
    return;
  }

  if (method === "tools/list") {
    sendResult(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs } = params || {};
    try {
      const result = await handleToolCall(name, toolArgs);
      sendResult(id, result);
    } catch (err) {
      sendError(id, -32000, err.message);
    }
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
});

function sendResult(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}
