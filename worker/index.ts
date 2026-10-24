// Frontend host + webhook proxy on Cloudflare Workers.
//
// Static assets (web/dist) are served by the ASSETS binding with SPA fallback
// (not_found_handling: single-page-application) so client-side routes like
// /report/:id survive a refresh. Everything under /whop/webhook and /health is
// proxied verbatim to the Convex deployment's HTTPS surface so the Whop
// webhook and health checks resolve on the *.workers.dev domain too.
//
// Cross-origin requests to <deployment>.convex.cloud from this origin work
// because Convex sets permissive CORS; the proxy only adds same-origin
// convenience. Keep the webhook path byte-exact: Convex reads the raw body
// (req.arrayBuffer()) and verifies the Whop signature over it.

interface Env {
  /** Convex HTTP-actions surface, e.g. https://<deployment>.convex.site */
  CONVEX_SITE_URL: string;
  /** Static asset binding declared in wrangler.json */
  ASSETS: { fetch: typeof fetch };
}

const PROXY_PREFIXES = ["/whop/webhook", "/health"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (PROXY_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      return proxyToConvex(request, env);
    }

    // SPA fallback applies automatically for unmatched paths.
    return env.ASSETS.fetch(request);
  },
};

async function proxyToConvex(request: Request, env: Env): Promise<Response> {
  const base = env.CONVEX_SITE_URL.replace(/\/+$/, "");
  const target = `${base}${new URL(request.url).pathname}${new URL(request.url).search}`;

  // Forward method, headers (minus hop headers), and the raw body so the
  // signature verification in internal.whop.handleWebhook sees identical bytes.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "convex_proxy_unreachable", detail: message }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  // Re-read the upstream body and re-emit headers explicitly: forwarded
  // content-encoding/content-length would describe a stream we never had.
  const body = await upstream.arrayBuffer();
  const outHeaders = new Headers();
  outHeaders.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  const exposeHeaders = [
    "x-whop-signature",
    "www-authenticate",
    "retry-after",
    "cache-control",
  ];
  for (const name of exposeHeaders) {
    const value = upstream.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  return new Response(body, { status: upstream.status, headers: outHeaders });
}
