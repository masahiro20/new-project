import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Boots the real entry point with no tokens outside production (open dev mode).
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
    env: { PATH: process.env.PATH ?? "", KOTOMARK_DATA_DIR: mkdtempSync(join(tmpdir(), "kotomark-open-")), ...env },
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

test("open dev mode listens on loopback and refuses a non-loopback Host (DNS rebinding)", async () => {
  const port = await freePort();
  const s = boot({ PORT: String(port), NODE_ENV: "development" });
  try {
    await s.listening;
    assert.match(s.output(), /listening on 127\.0\.0\.1:/);
    const call = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
        const req = request(
          { host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host, "content-type": "application/json", accept: "application/json, text/event-stream", "content-length": Buffer.byteLength(body) } },
          (res) => (res.resume(), resolve(res.statusCode ?? 0)),
        );
        req.on("error", reject);
        req.end(body);
      });
    assert.equal(await call(`attacker.example:${port}`), 403);
    assert.notEqual(await call(`localhost:${port}`), 403);
  } finally {
    s.child.kill();
    await s.exited;
  }
});
