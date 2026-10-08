import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./tools.js";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless).
 *
 * Privacy: request bodies are parsed in memory and dropped; only method, status and timing are logged.
 * Auth: static bearer tokens from YURAGI_API_TOKENS (comma-separated) for the prototype; replace with
 * OAuth before any external use. In production the server refuses to start without tokens.
 */
const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 25_000_000;
const tokens = (process.env.YURAGI_API_TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean);

if (!tokens.length && process.env.NODE_ENV === "production") {
  console.error("YURAGI_API_TOKENS must be set in production");
  process.exit(1);
}

function authorized(req: IncomingMessage): boolean {
  if (!tokens.length) return true; // local development only
  const h = req.headers.authorization ?? "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  return tokens.some((t) => {
    const want = Buffer.from(t);
    return want.length === given.length && timingSafeEqual(want, given);
  });
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
  res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`));
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });
    if (!authorized(req)) {
      res.setHeader("www-authenticate", 'Bearer realm="yuragi"');
      return send(res, 401, { error: "unauthorized" });
    }
    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream, no sessions to delete.
      return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }
    const body = await readJson(req);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    const status = (e as { status?: number }).status ?? (e instanceof SyntaxError ? 400 : 500);
    if (!res.headersSent) send(res, status, { jsonrpc: "2.0", error: { code: -32603, message: status === 500 ? "Internal error" : (e as Error).message }, id: null });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  httpServer.listen(PORT, () => console.log(`yuragi MCP listening on :${PORT}/mcp${tokens.length ? "" : " (no auth: dev mode)"}`));
}
