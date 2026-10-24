import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SUITE_VERSION } from "./deterministic";

/**
 * http.ts — public HTTP surface.
 *
 * POST /whop/webhook : Standard Webhooks-signed Whop events. Headers arrive in
 *   every case (some CDNs rewrite keys, some preserve case) — we lowercase the
 *   full header record before verification. Body forwarded as raw bytes so the
 *   signature is verified over exactly what Whop signed.
 * GET  /health       : liveness probe for canary checks.
 */

const http = httpRouter();

http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Behavior contract: NEVER 500. Any failure inside this handler maps to
    // 401 (Standard Webhooks verify-failure semantics), verified-and-ok → 200.
    // NB: this runtime's Request has no .bytes() (Throws TypeError, seen as a
    // live 500), so read the signed body via the standard .arrayBuffer().
    try {
      const body: ArrayBuffer = await req.arrayBuffer();

      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const result = await ctx.runAction(internal.whop.handleWebhook, {
        body,
        headers,
      });

      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: result.ignored ?? "signature_verification_failed" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ received: true, detail: result.handled ?? result.ignored ?? null }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: e instanceof Error ? e.message : "webhook_unhandled_error",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", service: "breakmyapp", suite: SUITE_VERSION }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/outreach/unsubscribe",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) {
      return new Response("Invalid unsubscribe link.", { status: 400 });
    }
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><body><h1>Stop BreakMyApp emails</h1><form method="POST" action="/outreach/unsubscribe"><input type="hidden" name="token" value="${token}"><button type="submit">Unsubscribe</button></form></body></html>`, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }),
});

http.route({
  path: "/outreach/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const token = new URLSearchParams(body).get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) {
      return new Response("Invalid unsubscribe link.", { status: 400 });
    }
    const ok = await ctx.runMutation(internal.outreachBridge.unsubscribe, { token });
    return new Response(ok ? "You have been unsubscribed." : "Invalid unsubscribe link.", {
      status: ok ? 200 : 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }),
});

export default http;
