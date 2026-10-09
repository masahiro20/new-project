import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
  const s = boot({ PORT: String(port), HOST: "127.0.0.1", KOTOMARK_API_TOKENS: "t1", KOTOMARK_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
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
});
