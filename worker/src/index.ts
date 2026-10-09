// Paid/AI API for the static site (GitHub Pages). A plain Cloudflare Worker, not Next.js:
// it only serves the four POST endpoints and reuses the same handlers as app/api/*.
// Config: worker/wrangler.jsonc. Runbook: docs/paid-launch.md.
import { handleCheckout, handleDemoPay, handleGenerate, handlePreview } from "../../lib/api/handlers";

const ROUTES: Partial<Record<string, (request: Request) => Promise<Response>>> = {
  "/api/preview": handlePreview,
  "/api/checkout": handleCheckout,
  "/api/checkout/demo": handleDemoPay,
  "/api/generate": handleGenerate,
};

/** Only the site's own origin(s) may call the API from a browser (ALLOWED_ORIGINS, comma-separated). */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

type Env = { ALLOWED_ORIGINS?: string };

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const handler = ROUTES[url.pathname.replace(/\/$/, "")];

    if (request.method === "OPTIONS") return new Response(null, { status: handler && cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
    if (!handler) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...cors, Allow: "POST, OPTIONS" } });
    // Browsers always send Origin on cross-site POSTs; refuse other sites outright.
    if (request.headers.get("Origin") && !cors["Access-Control-Allow-Origin"]) {
      return Response.json({ error: "Origin not allowed" }, { status: 403 });
    }

    const response = await handler(request);
    // Re-wrap to add CORS headers; the body (possibly a stream) passes through unchanged.
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};

export default worker;
