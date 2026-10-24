"use node";

import { randomBytes } from "node:crypto";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_INBOX_PAGES = 2;

type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sender: string;
};
type ClaimedOutreach = {
  outreachId: Id<"outreach">;
  auditId: Id<"audits">;
  email: string;
  projectName: string;
  targetUrl: string;
  criticalCount: number;
  token: string;
  messageId: string;
};

function credentials(): GmailCredentials | null {
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  const sender = env.GMAIL_SENDER_EMAIL?.trim().toLowerCase();
  if (!clientId || !clientSecret || !refreshToken || !sender ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) return null;
  return { clientId, clientSecret, refreshToken, sender };
}

async function accessToken(creds: GmailCredentials): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken, grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`gmail_oauth_${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" ||
    !("access_token" in data) || typeof data.access_token !== "string") {
    throw new Error("gmail_oauth_missing_access_token");
  }
  return data.access_token;
}

async function gmailGet(token: string, path: string): Promise<unknown> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`gmail_get_${response.status}`);
  return response.json();
}

function textHeader(value: string): string {
  return value.replace(/[\r\n\x00-\x1f\x7f]/g, " ").trim().slice(0, 160);
}

function mailBody(args: {
  from: string; to: string; projectName: string; targetUrl: string;
  criticalCount: number; reportUrl: string; unsubscribeUrl: string; messageId: string;
}): string {
  const subject = textHeader(`QA check for ${args.projectName}`);
  const body = [
    `Hi,`,
    ``,
    `I ran a public-page QA check on ${args.targetUrl} and found ${args.criticalCount} potential critical issue${args.criticalCount === 1 ? "" : "s"}.`,
    `You can review the free preview here: ${args.reportUrl}`,
    ``,
    `The report shows what the automated run observed. Please verify any finding before treating it as a confirmed defect.`,
    ``,
    `If this is useful, the report page explains the full audit and fix-verification options.`,
    ``,
    `— BreakMyApp`,
    `To stop these emails, reply "stop" or use ${args.unsubscribeUrl}`,
  ].join("\r\n");
  return [
    `From: BreakMyApp <${args.from}>`,
    `To: ${args.to}`,
    `Subject: ${subject}`,
    `Message-ID: ${args.messageId}`,
    `List-Unsubscribe: <${args.unsubscribeUrl}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``, body,
  ].join("\r\n");
}

export const sendNext = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: boolean; reason?: string; auditId?: Id<"audits"> }> => {
    if (env.OUTREACH_ENABLED !== "true") return { sent: false, reason: "outreach_disabled" };
    const creds = credentials();
    const baseUrl = env.APP_BASE_URL?.replace(/\/+$/, "");
    const siteUrl = env.CONVEX_SITE_URL?.replace(/\/+$/, "");
    if (!creds || !baseUrl || !siteUrl ||
      !baseUrl.startsWith("https://") || !siteUrl.startsWith("https://")) {
      return { sent: false, reason: "outreach_not_configured" };
    }
    const host = new URL(baseUrl).hostname;
    const nonce = randomBytes(24).toString("hex");
    const token = randomBytes(24).toString("base64url");
    const messageId = `<bma-${nonce}@${host}>`;

    // Authenticate before claiming a send slot, so an unavailable token does
    // not consume the daily allowance or strand a prospect in SENDING.
    let bearer: string;
    try { bearer = await accessToken(creds); }
    catch (error) { return { sent: false, reason: String(error) }; }

    const item: ClaimedOutreach | null = await ctx.runMutation(internal.outreachBridge.claimNext, { token, messageId });
    if (!item) return { sent: false, reason: "no_eligible_prospect_or_daily_cap" };

    const reportUrl = `${baseUrl}/audit/${item.auditId}`;
    const unsubscribeUrl = `${siteUrl}/outreach/unsubscribe?token=${encodeURIComponent(token)}`;
    const raw = Buffer.from(mailBody({
      from: creds.sender, to: item.email, projectName: item.projectName,
      targetUrl: item.targetUrl, criticalCount: item.criticalCount,
      reportUrl, unsubscribeUrl, messageId,
    }), "utf8").toString("base64url");
    try {
      const response = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(20_000),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" ||
        !("id" in result) || typeof result.id !== "string" ||
        !("threadId" in result) || typeof result.threadId !== "string") {
        throw new Error(`gmail_send_${response.status}`);
      }
      await ctx.runMutation(internal.outreachBridge.markSent, {
        outreachId: item.outreachId,
        gmailMessageId: result.id, gmailThreadId: result.threadId,
      });
      return { sent: true, auditId: item.auditId };
    } catch (error) {
      // A timeout may happen after Gmail accepted the message. Never resend
      // automatically; reconcile against Gmail's Sent folder first.
      await ctx.runMutation(internal.outreachBridge.markUnknown, {
        outreachId: item.outreachId, reason: String(error),
      });
      return { sent: false, reason: "delivery_uncertain" };
    }
  },
});

function header(message: unknown, name: string): string {
  if (!message || typeof message !== "object" || !("payload" in message)) return "";
  const payload = message.payload;
  if (!payload || typeof payload !== "object" || !("headers" in payload) || !Array.isArray(payload.headers)) return "";
  const found = payload.headers.find((h: unknown) => h && typeof h === "object" &&
    "name" in h && typeof h.name === "string" && h.name.toLowerCase() === name.toLowerCase());
  return found && typeof found === "object" && "value" in found && typeof found.value === "string" ? found.value : "";
}

function fromAddress(value: string): string {
  const bracket = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const plain = value.match(/^\s*([^<>\s]+@[^<>\s]+)\s*$/);
  return (bracket?.[1] ?? plain?.[1] ?? "").toLowerCase();
}

export const scanReplies = internalAction({
  args: {},
  handler: async (ctx) => {
    if (env.OUTREACH_ENABLED !== "true") return { scanned: 0, reason: "outreach_disabled" };
    const creds = credentials();
    if (!creds) return { scanned: 0, reason: "gmail_not_configured" };
    const bearer = await accessToken(creds);
    const startedAt = Date.now();
    const cursor = await ctx.runQuery(internal.outreachBridge.getSyncCursor, { now: startedAt });
    const after = Math.floor((cursor - 5 * 60 * 1000) / 1000);
    let pageToken = "";
    let scanned = 0;
    let drained = false;
    for (let page = 0; page < MAX_INBOX_PAGES; page++) {
      const query = new URLSearchParams({ q: `in:inbox after:${after}`, maxResults: "50" });
      if (pageToken) query.set("pageToken", pageToken);
      const list: unknown = await gmailGet(bearer, `/messages?${query}`);
      const messages = list && typeof list === "object" && "messages" in list && Array.isArray(list.messages)
        ? list.messages : [];
      for (const item of messages) {
        if (!item || typeof item !== "object" ||
          !("id" in item) || typeof item.id !== "string" ||
          !("threadId" in item) || typeof item.threadId !== "string") continue;
        const recipient = await ctx.runQuery(internal.outreachBridge.recipientForThread, {
          gmailThreadId: item.threadId,
        });
        if (!recipient) continue;
        const detail: unknown = await gmailGet(bearer, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From`);
        const from = fromAddress(header(detail, "From"));
        if (from !== recipient) continue;
        const snippet = detail && typeof detail === "object" && "snippet" in detail &&
          typeof detail.snippet === "string" ? detail.snippet : "";
        const optedOut = /\b(?:stop|unsubscribe|remove me|do not contact)\b/i.test(snippet);
        await ctx.runMutation(internal.outreachBridge.recordReply, {
          gmailMessageId: item.id, gmailThreadId: item.threadId, from, optedOut,
        });
        scanned++;
      }
      pageToken = list && typeof list === "object" && "nextPageToken" in list &&
        typeof list.nextPageToken === "string" ? list.nextPageToken : "";
      if (!pageToken) { drained = true; break; }
    }
    if (drained) await ctx.runMutation(internal.outreachBridge.advanceSyncCursor, { checkedAt: startedAt });
    return { scanned, drained };
  },
});

export const reconcileUnknown = internalAction({
  args: {},
  handler: async (ctx) => {
    const creds = credentials();
    if (!creds) return { resolved: 0 };
    const bearer = await accessToken(creds);
    const unknown = await ctx.runQuery(internal.outreachBridge.getUnknown, { now: Date.now() });
    let resolved = 0;
    for (const row of unknown) {
      const q = new URLSearchParams({ q: `in:sent rfc822msgid:${row.messageId}`, maxResults: "1" });
      const result: unknown = await gmailGet(bearer, `/messages?${q}`);
      const messages = result && typeof result === "object" && "messages" in result && Array.isArray(result.messages)
        ? result.messages : [];
      const found = messages[0];
      if (found && typeof found === "object" && "id" in found && typeof found.id === "string" &&
        "threadId" in found && typeof found.threadId === "string") {
        await ctx.runMutation(internal.outreachBridge.markSent, {
          outreachId: row.outreachId, gmailMessageId: found.id, gmailThreadId: found.threadId,
        });
        resolved++;
      }
    }
    return { resolved };
  },
});
