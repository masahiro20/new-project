import { hasAccess } from "@/lib/access";
import { handleRpc } from "@/lib/mcp";
import { allow, clientIp } from "@/lib/ratelimit";

// MCP endpoint (Streamable HTTP, stateless; every response is plain JSON).
// Connect from Claude with  https://<host>/api/mcp?key=<ACCESS_PASSWORD>
// (or send the key as `Authorization: Bearer <key>` / `x-access-key`).
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!hasAccess(request)) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "アクセスキーが違います。接続URLの ?key= を確認してください。" } }, 401);
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
