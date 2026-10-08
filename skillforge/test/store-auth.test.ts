import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { FileGlossaryStore, storeFromEnv } from "../src/server/store.js";
import { Limiter, QuotaError, TokenStore } from "../src/server/auth.js";
import { parseGlossary } from "../src/core/index.js";
import { findingsToLabelCsv, scoreLabels } from "../src/core/pilot.js";
import { read, runSample } from "./helpers.js";
import { parseTable } from "../src/core/index.js";

const tmp = () => mkdtempSync(join(tmpdir(), "yuragi-"));
const glossary = parseGlossary(read("samples/ja-en/glossary.json"));

test("file store: encrypted at rest, names hidden, per-owner isolation, delete", async () => {
  const dir = tmp();
  const s = new FileGlossaryStore(dir, randomBytes(32));
  await s.put("alice", "Ember Archive 本編", glossary);
  await s.put("bob", "other", { terms: [], characters: [] });
  const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".yg"));
  assert.equal(files.length, 2);
  for (const f of files) {
    const raw = readFileSync(join(dir, f));
    assert.ok(!raw.includes(Buffer.from("Mana Stone")) && !raw.includes(Buffer.from("Ember")), "plaintext must not appear on disk");
    assert.ok(!f.includes("alice") && !f.includes("Ember"));
  }
  assert.deepEqual((await s.get("alice", "Ember Archive 本編"))?.terms.length, 5);
  assert.equal(await s.get("bob", "Ember Archive 本編"), undefined);
  assert.deepEqual((await s.list("alice")).map((m) => [m.name, m.terms, m.characters]), [["Ember Archive 本編", 5, 3]]);
  assert.equal(await s.delete("alice", "Ember Archive 本編"), true);
  assert.deepEqual(await s.list("alice"), []);
  assert.equal(await s.deleteAll("bob"), 1);
});

test("file store: wrong key or moved file fails to decrypt", async () => {
  const dir = tmp();
  await new FileGlossaryStore(dir, randomBytes(32)).put("alice", "g", glossary);
  await assert.rejects(new FileGlossaryStore(dir, randomBytes(32)).get("alice", "g"));
});

test("store from env: production without a key refuses; dev generates a key file", () => {
  assert.throws(() => storeFromEnv({ NODE_ENV: "production", YURAGI_DATA_DIR: tmp() }), /YURAGI_ENCRYPTION_KEY/);
  const dir = tmp();
  storeFromEnv({ YURAGI_DATA_DIR: dir });
  assert.equal(Buffer.from(readFileSync(join(dir, "dev.key"), "utf8"), "base64").length, 32);
});

test("tokens: only hashes stored, verify, revoke, hot reload", () => {
  const file = join(tmp(), "tokens.json");
  const a = new TokenStore(file);
  assert.equal(a.open, true);
  const { token } = a.create("alice", "solo", "pilot");
  assert.ok(!readFileSync(file, "utf8").includes(token));
  const b = new TokenStore(file); // e.g. the server process
  assert.deepEqual(b.verify(token), { user: "alice", plan: "solo" });
  assert.equal(b.verify(token + "x"), undefined);
  const { token: t2 } = a.create("bob", "studio");
  assert.deepEqual(b.verify(t2), { user: "bob", plan: "studio" }, "picked up without restart");
  assert.equal(a.revoke("alice"), 1);
  assert.equal(b.verify(token), undefined);
  assert.throws(() => a.create("bad user!", "solo"));
});

test("limiter: request bucket refills over time; daily row quota resets at UTC midnight", () => {
  let now = Date.parse("2026-10-08T23:59:00Z");
  const l = new Limiter(() => now);
  const p = { user: "alice", plan: "solo" as const };
  for (let i = 0; i < 30; i++) l.hit(p);
  assert.throws(() => l.hit(p), (e: unknown) => e instanceof QuotaError && e.retryAfterSec > 0);
  now += 2_000;
  l.hit(p);
  l.consumeRows(p, 150_000);
  assert.throws(() => l.consumeRows(p, 60_000), QuotaError);
  assert.equal(l.usage(p).rowsToday, 150_000, "rejected batch is not counted");
  now += 60_000;
  l.consumeRows(p, 60_000);
  assert.equal(l.usage(p).rowsToday, 60_000);
  l.hit({ user: "dev", plan: "dev" });
});

test("pilot: label export round-trips and scores precision and recall", () => {
  const tables = [parseTable(read("samples/ja-en/script.csv"), "script.csv")];
  const result = runSample(["samples/ja-en/script.csv"], "samples/ja-en/glossary.json");
  const csv = findingsToLabelCsv(result, tables);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, result.findings.length + 1);
  // Label every term finding TP except one FP; leave the rest unlabeled.
  let fpGiven = false;
  const labeled = csv.replace(/^(F\d+,[^\n]*?,term,[^\n]*),,$/gm, (_m, head: string) => {
    const v = fpGiven ? "TP" : "FP";
    fpGiven = true;
    return `${head},${v},`;
  });
  writeFileSync(join(tmp(), "x.csv"), labeled);
  const known = "string_id,category\nch1_005,term\nch1_999,name\n";
  const r = scoreLabels(labeled, known);
  const term = r.byCategory.find((s) => s.key === "term")!;
  assert.equal(term.fp, 1);
  assert.equal(term.tp, term.tp + term.fp - 1);
  assert.ok(term.precision! > 0 && term.precision! < 1);
  assert.deepEqual(r.recall && [r.recall.known, r.recall.found], [2, 1]);
});
