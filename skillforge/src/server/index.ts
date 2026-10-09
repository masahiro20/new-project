import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Limiter, QuotaError, tokenStoreFromEnv, type Principal } from "./auth.js";
import { envVar } from "./env.js";
import { storeFromEnv } from "./store.js";
import { buildServer } from "./tools.js";
import { clearTextCaches } from "../core/text.js";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless).
 *
 * Privacy: request bodies are parsed in memory and dropped; only method, path, status, user id and
 * timing are logged — never script or glossary content. See docs/data-policy.md.
 * Auth: per-user bearer tokens (tokens.json, hashes only; create with `kotomark token create`), plus
 * legacy KOTOMARK_API_TOKENS. With no tokens configured the server runs open, but only outside production.
 */
const PORT = Number(process.env.PORT ?? 8787);
/** Bind address: HOST if set; all interfaces in production (container behind the host's proxy); loopback otherwise. */
export const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
/** Open (no-token) mode answers only requests addressed to this machine by a loopback name (DNS rebinding). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const loopbackHost = (host: string | undefined) => LOOPBACK_HOSTS.has((host ?? "").toLowerCase().replace(/:\d+$/, ""));
const MAX_BODY = 25_000_000;
const tokens = tokenStoreFromEnv();
const store = storeFromEnv();
const limiter = new Limiter();

if (tokens.open && process.env.NODE_ENV === "production") {
  console.error("No API tokens configured: create one with `kotomark token create <user>` or set KOTOMARK_API_TOKENS");
  process.exit(1);
}
/** B-13: environment tokens are shared secrets typed by hand; refuse guessable ones in production. */
export const MIN_ENV_TOKEN_LENGTH = 24;
if (process.env.NODE_ENV === "production") {
  const weak = (envVar("API_TOKENS") ?? "").split(",").map((t) => t.trim()).filter((t) => t && t.length < MIN_ENV_TOKEN_LENGTH);
  if (weak.length) {
    console.error(`KOTOMARK_API_TOKENS has ${weak.length} token(s) shorter than ${MIN_ENV_TOKEN_LENGTH} characters; use random values (e.g. openssl rand -hex 32) or \`kotomark token create\`.`);
    process.exit(1);
  }
}

function authenticate(req: IncomingMessage): Principal | undefined {
  // Open dev mode never applies in production, even if every token disappears at runtime (tokens.json emptied).
  if (tokens.open) return process.env.NODE_ENV === "production" ? undefined : { user: "dev", plan: "dev" };
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
  // Health checks (no auth, no body read) are not logged: the host polls them every few seconds.
  if (url.pathname === "/healthz") return send(res, 200, { ok: true });
  res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode} user=${user} ${Date.now() - started}ms`));
  try {
    if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });
    if (tokens.open && !loopbackHost(req.headers.host)) return send(res, 403, { error: "open dev mode accepts only localhost requests" });
    const principal = authenticate(req);
    if (!principal) {
      res.setHeader("www-authenticate", 'Bearer realm="kotomark"');
      return send(res, 401, { error: "unauthorized" });
    }
    user = principal.user;
    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream, no sessions to delete.
      return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }
    limiter.hit(principal);
    const body = await readJson(req);
    // One HTTP request carries one JSON-RPC message: a batch (removed in MCP 2025-06-18) would run up to
    // 100 tool calls for a single rate-limit token, and in parallel.
    if (Array.isArray(body)) return send(res, 400, { jsonrpc: "2.0", error: { code: -32600, message: "Batch requests are not supported" }, id: null });
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
  httpServer.listen(PORT, HOST, () => console.log(`kotomark MCP listening on ${HOST ?? ""}:${PORT}/mcp${tokens.open ? " (no tokens configured: open dev mode)" : ""}`));
}
