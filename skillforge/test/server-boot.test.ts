import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Boots the real entry point the way the container does (NODE_ENV=production, $PORT, $HOST).
const entry = new URL("../src/server/index.ts", import.meta.url).pathname;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

function boot(env: Record<string, string>) {
  const child = spawn(process.execPath, ["--import", "tsx", entry], {
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", KOTOMARK_DATA_DIR: mkdtempSync(join(tmpdir(), "kotomark-boot-")), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
  const listening = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", () => out.includes("listening") && resolve());
    void exited.then(() => reject(new Error(`exited early: ${out}`)));
  });
  return { child, exited, listening, output: () => out };
}

test("production server listens on $PORT/$HOST and serves /healthz without auth", async () => {
  const port = await freePort();
  const s = boot({ PORT: String(port), HOST: "127.0.0.1", KOTOMARK_API_TOKENS: randomBytes(24).toString("hex"), KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  try {
    await s.listening;
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(mcp.status, 401);
    await mcp.arrayBuffer();
  } finally {
    s.child.kill();
    await s.exited;
  }
});

test("production server refuses to start without tokens or without an encryption key", async () => {
  const noTokens = boot({ PORT: String(await freePort()), KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  noTokens.listening.catch(() => {});
  assert.notEqual(await noTokens.exited, 0);
  assert.match(noTokens.output(), /No API tokens configured/);

  const noKey = boot({ PORT: String(await freePort()), KOTOMARK_API_TOKENS: "t1" });
  noKey.listening.catch(() => {});
  assert.notEqual(await noKey.exited, 0);
  assert.match(noKey.output(), /KOTOMARK_ENCRYPTION_KEY must be set/);

  const weak = boot({ PORT: String(await freePort()), KOTOMARK_API_TOKENS: "secret1", KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  weak.listening.catch(() => {});
  assert.notEqual(await weak.exited, 0);
  assert.match(weak.output(), /shorter than 24 characters/);
});

test("production server fails closed when tokens.json is emptied while it runs", async () => {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "kotomark-boot-"));
  const record = { user: "alice", plan: "solo", hash: "0".repeat(64), prefix: "yrg_000000", createdAt: "2026-01-01T00:00:00Z" };
  writeFileSync(join(dataDir, "tokens.json"), JSON.stringify([record]));
  const s = boot({ PORT: String(port), HOST: "127.0.0.1", KOTOMARK_DATA_DIR: dataDir, KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  try {
    await s.listening;
    writeFileSync(join(dataDir, "tokens.json"), "[]");
    for (const authorization of ["Bearer anything", ""]) {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });
      assert.equal(res.status, 401);
      await res.arrayBuffer();
    }
  } finally {
    s.child.kill();
    await s.exited;
  }
});

test("restart keeps today's row usage (flushed on SIGTERM) and migrates env-<n> glossaries to hashed ids on startup", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const { FileGlossaryStore } = await import("../src/server/store.js");
  const { envUserId } = await import("../src/server/auth.js");
  const { readFileSync, existsSync } = await import("node:fs");
  const dataDir = mkdtempSync(join(tmpdir(), "kotomark-boot-"));
  const keyB64 = randomBytes(32).toString("base64");
  const token = randomBytes(24).toString("hex");
  await new FileGlossaryStore(join(dataDir, "glossaries"), Buffer.from(keyB64, "base64")).put("env-1", "legacy", { terms: [{ source: "魔導石", target: "Mana Stone" }], characters: [] });
  const env = { HOST: "127.0.0.1", KOTOMARK_DATA_DIR: dataDir, KOTOMARK_API_TOKENS: token, KOTOMARK_ENCRYPTION_KEY: keyB64 };
  const call = async (port: number, name: string, args: Record<string, unknown>) => {
    const client = new Client({ name: "t", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    try {
      return await client.callTool({ name, arguments: args });
    } finally {
      await client.close();
    }
  };
  let port = await freePort();
  let s = boot({ PORT: String(port), ...env });
  try {
    await s.listening;
    assert.match(s.output(), new RegExp(`env-1 -> ${envUserId(token)}: 1 glossaries moved`));
    assert.ok(!s.output().includes(token), "the token is never logged");
    const list = await call(port, "list_glossaries", {});
    assert.deepEqual((list.structuredContent as { glossaries: { name: string }[] }).glossaries.map((g) => g.name), ["legacy"]);
    const res = await call(port, "check_script", { tables: [{ filename: "s.csv", content: "id,ja,en\n1,魔導石,Magic Stone\n2,こんにちは,Hello\n" }], glossaryName: "legacy" });
    assert.ok(!res.isError, JSON.stringify(res.content));
  } finally {
    s.child.kill("SIGTERM"); // before the 2 s debounce: the shutdown handler must write the usage
    await s.exited;
  }
  assert.ok(existsSync(join(dataDir, "usage.json")));
  assert.equal(JSON.parse(readFileSync(join(dataDir, "usage.json"), "utf8")).rows[envUserId(token)].used, 2);
  port = await freePort();
  s = boot({ PORT: String(port), ...env });
  try {
    await s.listening;
    assert.ok(!/glossaries moved/.test(s.output()), "the migration runs once");
    const usage = await call(port, "get_usage", {});
    assert.equal((usage.structuredContent as { rowsToday: number }).rowsToday, 2);
  } finally {
    s.child.kill("SIGTERM");
    await s.exited;
  }
});

test("a corrupt tokens.json gives a generic 500 with a correlation id, not the parser's message", async () => {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "kotomark-boot-"));
  const record = { user: "alice", plan: "solo", hash: "0".repeat(64), prefix: "yrg_000000", createdAt: "2026-01-01T00:00:00Z" };
  writeFileSync(join(dataDir, "tokens.json"), JSON.stringify([record]));
  const s = boot({ PORT: String(port), HOST: "127.0.0.1", KOTOMARK_DATA_DIR: dataDir, KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  try {
    await s.listening;
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(join(dataDir, "tokens.json"), '[{"user":"alice", "hash": SECRET-FRAGMENT');
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer anything" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.match(text, /Internal error \(id [0-9a-f]{12}\)/);
    assert.ok(!text.includes("SECRET") && !text.includes("JSON"));
    assert.ok(!s.output().includes("SECRET-FRAGMENT"), "the log has no file content either");
  } finally {
    s.child.kill();
    await s.exited;
  }
});
