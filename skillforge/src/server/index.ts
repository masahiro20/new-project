import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { join } from "node:path";
import { envTokensFromEnv, Limiter, PerUserSlots, QuotaError, tokenStoreFromEnv, type Principal } from "./auth.js";
import { LargeBodyGate, readJsonBody } from "./body.js";
import { envVar } from "./env.js";
import { HttpError, publicError } from "./errors.js";
import { migrateEnvUserIds } from "./migrate.js";
import { storeFromEnv } from "./store.js";
import { buildServer } from "./tools.js";
import { UsageFile } from "./usage.js";
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
const DATA_DIR = envVar("DATA_DIR") ?? ".kotomark-data";
const tokens = tokenStoreFromEnv();
const store = storeFromEnv();
/** Per-minute limits in memory; daily row usage also in DATA_DIR/usage.json (single machine, docs/deploy.md). */
const limiter = new Limiter(Date.now, new UsageFile(join(DATA_DIR, "usage.json")));
/** B-11: at most 2 request bodies over 1 MiB in flight; bodies over 8 MiB are refused (src/server/body.ts). */
const largeBodies = new LargeBodyGate();
/** B-02: one tool call at a time per user — a second concurrent call gets 429 instead of queueing behind the first. */
const toolCallSlots = new PerUserSlots();

if (tokens.open && process.env.NODE_ENV === "production") {
  console.error("No API tokens configured: create one with `kotomark token create <user>` or set KOTOMARK_API_TOKENS");
  process.exit(1);
}
/**
 * Open (no-token) mode only on a loopback bind (Atlas re-review): the Host check below stops DNS rebinding, not a
 * client on the network that simply sends `Host: localhost`. KOTOMARK_ALLOW_OPEN=1 overrides (e.g. a dev container
 * whose port is published only to the host).
 */
const LOOPBACK_BINDS = new Set(["127.0.0.1", "::1", "localhost", "[::1]"]);
export const openModeAllowed = process.env.NODE_ENV !== "production" && (LOOPBACK_BINDS.has(HOST.toLowerCase()) || envVar("ALLOW_OPEN") === "1");
if (tokens.open && !openModeAllowed && process.env.NODE_ENV !== "production") {
  console.error(`No API tokens configured and HOST=${HOST} is not a loopback address: refusing open mode. Create a token, bind to 127.0.0.1, or set KOTOMARK_ALLOW_OPEN=1.`);
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
  if (tokens.open) return openModeAllowed ? { user: "dev", plan: "dev" } : undefined;
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? tokens.verify(h.slice(7).trim()) : undefined;
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
    const { body, release } = await readJsonBody(req, largeBodies);
    res.on("close", release);
    if ((body as { method?: unknown } | null)?.method === "tools/call") {
      const leave = toolCallSlots.tryEnter(principal.user);
      if (!leave) throw new QuotaError("Another tool call for this account is still running; wait for it to finish (one at a time).", 2);
      res.on("close", leave);
    }
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
    if (res.headersSent) return void publicError(e, "http"); // logs internal errors; nothing more can be sent
    if (e instanceof QuotaError) {
      res.setHeader("retry-after", String(e.retryAfterSec));
      return send(res, 429, { jsonrpc: "2.0", error: { code: -32000, message: e.message }, id: null });
    }
    // B-10: only HttpError / UserFacingError messages reach the client; anything else is "Internal error (id …)".
    const status = e instanceof HttpError ? e.status : 500;
    if (e instanceof HttpError && e.retryAfterSec) res.setHeader("retry-after", String(e.retryAfterSec));
    if (e instanceof HttpError && status >= 413) res.setHeader("connection", "close"); // the unread body is not drained
    const { message } = publicError(e, "http");
    send(res, status, { jsonrpc: "2.0", error: { code: status === 500 ? -32603 : -32000, message }, id: null });
  }
});

/** Write pending daily usage before the process ends (Fly.io stops machines with SIGINT; docker and others with SIGTERM). */
function installShutdown() {
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    limiter.flush();
    console.log(`kotomark MCP: ${signal}, usage saved; shutting down`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // B-06: move data stored under the old positional env-<n> ids before serving any request.
  await migrateEnvUserIds({ dataDir: DATA_DIR, envTokens: envTokensFromEnv(), store, limiter });
  installShutdown();
  httpServer.listen(PORT, HOST, () => console.log(`kotomark MCP listening on ${HOST ?? ""}:${PORT}/mcp${tokens.open ? " (no tokens configured: open dev mode)" : ""}`));
}
