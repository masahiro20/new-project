import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Limiter, QuotaError, tokenStoreFromEnv, type Principal } from "./auth.js";
import { storeFromEnv } from "./store.js";
import { buildServer } from "./tools.js";
import { clearTextCaches } from "../core/text.js";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless).
 *
 * Privacy: request bodies are parsed in memory and dropped; only method, path, status, user id and
 * timing are logged — never script or glossary content. See docs/data-policy.md.
 * Auth: per-user bearer tokens (tokens.json, hashes only; create with `yuragi token create`), plus
 * legacy YURAGI_API_TOKENS. With no tokens configured the server runs open, but only outside production.
 */
const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 25_000_000;
const tokens = tokenStoreFromEnv();
const store = storeFromEnv();
const limiter = new Limiter();

if (tokens.open && process.env.NODE_ENV === "production") {
  console.error("No API tokens configured: create one with `yuragi token create <user>` or set YURAGI_API_TOKENS");
  process.exit(1);
}

function authenticate(req: IncomingMessage): Principal | undefined {
  if (tokens.open) return { user: "dev", plan: "dev" };
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? tokens.verify(h.slice(7).trim()) : undefined;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
};

export const httpServer = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? "/", "http://localhost");
  let user = "-";
  res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode} user=${user} ${Date.now() - started}ms`));
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });
    const principal = authenticate(req);
    if (!principal) {
      res.setHeader("www-authenticate", 'Bearer realm="yuragi"');
      return send(res, 401, { error: "unauthorized" });
    }
    user = principal.user;
    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream, no sessions to delete.
      return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }
    limiter.hit(principal);
    const body = await readJson(req);
    const server = buildServer({ principal, store, limiter });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
      clearTextCaches();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (e instanceof QuotaError) {
      res.setHeader("retry-after", String(e.retryAfterSec));
      return send(res, 429, { jsonrpc: "2.0", error: { code: -32000, message: e.message }, id: null });
    }
    const status = (e as { status?: number }).status ?? (e instanceof SyntaxError ? 400 : 500);
    if (!res.headersSent) send(res, status, { jsonrpc: "2.0", error: { code: -32603, message: status === 500 ? "Internal error" : (e as Error).message }, id: null });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  httpServer.listen(PORT, () => console.log(`yuragi MCP listening on :${PORT}/mcp${tokens.open ? " (no tokens configured: open dev mode)" : ""}`));
}
