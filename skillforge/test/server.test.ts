import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { read } from "./helpers.js";

process.env.YURAGI_API_TOKENS = "test-token";
const { httpServer } = await import("../src/server/index.js");
let base = "";

before(async () => {
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => httpServer.close(() => r())));

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
  assert.deepEqual(tools.map((t) => t.name).sort(), ["check_script", "get_review_packets", "validate_glossary"]);
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
