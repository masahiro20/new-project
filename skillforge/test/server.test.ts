import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { read } from "./helpers.js";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenStore } from "../src/server/auth.js";

const dataDir = mkdtempSync(join(tmpdir(), "kotomark-srv-"));
process.env.KOTOMARK_DATA_DIR = dataDir;
process.env.KOTOMARK_API_TOKENS = "test-token";
const tokenStore = new TokenStore(join(dataDir, "tokens.json"));
const alice = tokenStore.create("alice", "studio").token;
const bob = tokenStore.create("bob", "solo").token;
const logged: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => {
  logged.push(a.map(String).join(" "));
};
const { httpServer } = await import("../src/server/index.js");
let base = "";

before(async () => {
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => httpServer.close(() => r())));
after(() => {
  console.log = origLog;
});

const connect = async (token = "test-token") => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
};

const input = {
  tables: [{ filename: "script.csv", content: read("samples/ja-en/script.csv") }],
  glossary: { filename: "glossary.json", content: read("samples/ja-en/glossary.json") },
};

test("rejects requests without a valid token", async () => {
  const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 401);
  await assert.rejects(connect("wrong"));
});

test("lists tools and runs check_script end to end", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "check_script", "delete_glossary", "draft_glossary", "get_glossary", "get_review_packets", "get_usage", "list_glossaries", "save_glossary", "validate_glossary",
  ]);
  const res = await client.callTool({ name: "check_script", arguments: input });
  assert.ok(!res.isError);
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  assert.match(text, /script\.csv:6/);
  const sc = res.structuredContent as { counts: Record<string, number> };
  assert.ok(sc.counts.error! > 0);
  await client.close();
});

test("get_review_packets filters by subject; minSeverity hides info", async () => {
  const client = await connect();
  const res = await client.callTool({ name: "get_review_packets", arguments: { ...input, subjects: ["Tobias"] } });
  const { packets } = res.structuredContent as { packets: { subject: string }[] };
  assert.deepEqual(packets.map((p) => p.subject), ["トビアス / Tobias"]);
  const r2 = await client.callTool({ name: "check_script", arguments: { ...input, options: { minSeverity: "warning" } } });
  assert.equal((r2.structuredContent as { counts: Record<string, number> }).counts.info, 0);
  await client.close();
});

test("bad input comes back as a tool error, not a crash", async () => {
  const client = await connect();
  const res = await client.callTool({ name: "check_script", arguments: { tables: [{ filename: "x.csv", content: "a,b\n1,2\n" }] } });
  assert.ok(res.isError);
  const g = await client.callTool({ name: "validate_glossary", arguments: { content: '{"terms":[{"source":""}]}' } });
  assert.ok(g.isError);
  await client.close();
});

test("saved glossaries are per user, usable by name, and deletable", async () => {
  const a = await connect(alice);
  const b = await connect(bob);
  const saved = await a.callTool({ name: "save_glossary", arguments: { name: "ember", content: input.glossary.content } });
  assert.ok(!saved.isError);
  const byName = await a.callTool({ name: "check_script", arguments: { tables: input.tables, glossaryName: "ember" } });
  assert.match((byName.content as { text: string }[])[0]!.text, /Magic Stone/);
  const other = await b.callTool({ name: "check_script", arguments: { tables: input.tables, glossaryName: "ember" } });
  assert.ok(other.isError, "bob cannot read alice's glossary");
  const list = await a.callTool({ name: "list_glossaries", arguments: {} });
  assert.deepEqual((list.structuredContent as { glossaries: { name: string }[] }).glossaries.map((g) => g.name), ["ember"]);
  await a.callTool({ name: "delete_glossary", arguments: { name: "ember" } });
  const after = await a.callTool({ name: "list_glossaries", arguments: {} });
  assert.deepEqual((after.structuredContent as { glossaries: unknown[] }).glossaries, []);
  const usage = await a.callTool({ name: "get_usage", arguments: {} });
  assert.ok((usage.structuredContent as { rowsToday: number }).rowsToday >= 30);
  await a.close();
  await b.close();
});

test("draft_glossary proposes terms without saving anything", async () => {
  const a = await connect(alice);
  const res = await a.callTool({ name: "draft_glossary", arguments: { tables: input.tables } });
  assert.ok(!res.isError);
  assert.match((res.content as { text: string }[])[0]!.text, /魔導石 → Mana Stone/);
  const list = await a.callTool({ name: "list_glossaries", arguments: {} });
  assert.deepEqual((list.structuredContent as { glossaries: unknown[] }).glossaries, []);
  await a.close();
});

test("rate limit returns 429 with Retry-After (solo plan: 30/min)", async () => {
  let last = 0;
  let retry: string | null = null;
  for (let i = 0; i < 40 && last !== 429; i++) {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bob}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "ping" }),
    });
    last = res.status;
    retry = res.headers.get("retry-after");
    await res.arrayBuffer();
  }
  assert.equal(last, 429);
  assert.ok(Number(retry) >= 1);
});

test("access log never contains script or glossary text", () => {
  assert.ok(logged.some((l) => /POST \/mcp 200 user=alice/.test(l)), "log lines are written");
  for (const needle of ["魔導石", "Mana Stone", "Lisette", "script.csv", "ember"]) {
    assert.ok(!logged.some((l) => l.includes(needle)), `log leaked "${needle}"`);
  }
});
