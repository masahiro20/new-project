import { hasAccess } from "@/lib/access";
import { origin, verify } from "@/lib/oauth";
import { handleRpc } from "@/lib/mcp";
import { allow, clientIp } from "@/lib/ratelimit";

// MCP endpoint (Streamable HTTP, stateless; every response is plain JSON).
// Connect from Claude with  https://<host>/api/mcp  — Claude signs in through
// /oauth/authorize (the user types the access key once). Scripts may instead
// pass the key as ?key=, `Authorization: Bearer <key>` or `x-access-key`.
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Signed-in Claude connectors send an OAuth bearer token; scripts may send the access key itself. */
function authorized(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && verify(auth.slice(7).trim(), "at")) return true;
  return hasAccess(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    // Tells Claude where to sign in (OAuth discovery, RFC 9728).
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "サインインが必要です（アクセスキー）。" } },
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin(request)}/.well-known/oauth-protected-resource"`, "Cache-Control": "no-store" } },
    );
  }
  if (!allow(`mcp:${clientIp(request)}`, 300, 60 * 60 * 1000)) return json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "リクエストが多すぎます。" } }, 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const messages = Array.isArray(body) ? body : [body];
  const baseUrl = new URL(request.url).origin;
  const responses = (await Promise.all(messages.map((m) => handleRpc(m, { baseUrl })))).filter((r) => r !== null);
  if (responses.length === 0) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? responses : responses[0]);
}

export async function GET() {
  // No server-initiated stream: this server only answers requests.
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
