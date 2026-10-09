#!/usr/bin/env node
// Logic tests for calc/index.html. No dependencies: run with `node calc/tests/logic.test.js`.
// The page's main <script id="app"> is extracted and evaluated in a VM sandbox without a DOM,
// so only the pure parts (PRICES, Logic, Samples) run.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PAGE = path.join(__dirname, "..", "index.html");
const SOURCE_TOOL = path.join(__dirname, "..", "..", "signal-lab", "model-switch-calculator", "index.html");

function load(file, scriptRe) {
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(scriptRe);
  if (!m) throw new Error("app script not found in " + file);
  const sandbox = { module: { exports: {} }, console };
  vm.runInNewContext(m[1], sandbox, { filename: file });
  return sandbox.module.exports;
}
const { Logic, Samples, PRICES } = load(PAGE, /<script id="app">([\s\S]*?)<\/script>/);

let pass = 0, fail = 0;
const T = (name, fn) => {
  try { fn(); pass++; console.log("ok   " + name); }
  catch (e) { fail++; console.log("FAIL " + name + "\n     " + e.message); }
};
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg || ""} ${a} vs ${b}`);
const MAIN = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
  "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "o4-mini"]);

/* ---------------- price data ---------------- */
T("PRICES checkedOn is 2026-10-08", () => assert.equal(PRICES.checkedOn, "2026-10-08"));
T("every model has numbers or is unverified, and an https source", () => {
  for (const m of PRICES.models) {
    assert(["verified", "unverified"].includes(m.status), m.id);
    if (m.status === "verified") assert(typeof m.input === "number" && typeof m.output === "number", m.id);
    assert(/^https:\/\//.test(m.source), m.id);
  }
});
T("PRICES identical to the source tool (if the source is present)", () => {
  if (!fs.existsSync(SOURCE_TOOL)) { console.log("     (source tool not found, skipped)"); return; }
  const src = load(SOURCE_TOOL, /<script>([\s\S]*?)<\/script>/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(PRICES)), JSON.parse(JSON.stringify(src.PRICES)));
});

/* ---------------- Anthropic sample (hand-checked) ---------------- */
const lines = Samples.anthropic.split("\n").slice(1).map((l) => l.split(","));
const S = (i) => lines.reduce((s, r) => s + +r[i], 0);
const TOT = { unc: S(3), cw5: S(4), cw1: S(5), cr: S(6), out: S(7) };
const f30 = 30 / 14;
let aA;
T("Anthropic sample parses as Console CSV, 42 rows, 14 days", () => {
  const p = Logic.parseUsage(Samples.anthropic); aA = Logic.aggregate(p.rows);
  assert.equal(p.format, "anthropic-csv"); assert.equal(p.formatLabel, "Anthropic Console usage CSV");
  assert.equal(aA.rowCount, 42); assert.equal(aA.spanDays, 14);
  for (const k in TOT) near(aA.totals[k], TOT[k], "total " + k);
});
T("Anthropic sample: current cost = $383.92/mo (hand)", () => {
  const pr = { "claude-sonnet-5-5": [2, 2.5, 4, 0.1, 10], "claude-haiku-5-5": [0.1, 0.125, 0.2, 0.01, 0.5], "claude-opus-5-5": [4, 5, 8, 0.2, 20] };
  let cur = 0;
  for (const l of lines) { const q = pr[l[1]]; cur += (l[3] * q[0] + l[4] * q[1] + l[5] * q[2] + l[6] * q[3] + l[7] * q[4]) / 1e6; }
  cur *= f30;
  const r = Logic.compute(aA, PRICES, { mode: "30d", keepCache: true, manual: {}, selected: MAIN });
  near(r.current, cur, "current"); assert(r.currentComplete);
  assert.equal(r.current.toFixed(2), "383.92");
});
T("Anthropic sample: all on Claude Sonnet 5.5 = $686.07/mo (hand)", () => {
  const hand = f30 * (TOT.unc * 2 + TOT.cw5 * 2.5 + TOT.cw1 * 4 + TOT.cr * 0.1 + TOT.out * 10) / 1e6;
  const r = Logic.compute(aA, PRICES, { mode: "30d", keepCache: true, manual: {}, selected: null });
  const s = r.scenarios.find((x) => x.model.id === "claude-sonnet-5-5");
  near(s.cost, hand, "sonnet"); assert.equal(s.cost.toFixed(2), "686.07");
});
T("Anthropic sample -> GPT-6.1 Sol uses listed cache-write price", () => {
  const r = Logic.compute(aA, PRICES, { mode: "30d", keepCache: true, manual: {}, selected: null });
  near(r.scenarios.find((s) => s.model.id === "gpt-6.1-sol").cost, f30 * (TOT.unc * 2 + (TOT.cw5 + TOT.cw1) * 2.5 + TOT.cr * 0.1 + TOT.out * 10) / 1e6);
});
T("keep-cache off prices all input at input price (raw total)", () => {
  const r = Logic.compute(aA, PRICES, { mode: "raw", keepCache: false, manual: {}, selected: null });
  near(r.scenarios.find((s) => s.model.id === "claude-sonnet-5-5").cost, ((TOT.unc + TOT.cw5 + TOT.cw1 + TOT.cr) * 2 + TOT.out * 10) / 1e6);
});

/* ---------------- OpenAI sample ---------------- */
T("OpenAI sample: Admin API JSON, 7 days, current cost by hand", () => {
  const p = Logic.parseUsage(Samples.openai), a = Logic.aggregate(p.rows);
  assert.equal(p.format, "openai-api"); assert.equal(a.spanDays, 7);
  let oc = 0;
  for (const b of JSON.parse(Samples.openai).data) for (const x of b.results) {
    const q = x.model === "gpt-6.1-sol" ? [2, 0.1, 10] : [0.75, 0.075, 4.5];
    oc += ((x.input_tokens - x.input_cached_tokens) * q[0] + x.input_cached_tokens * q[1] + x.output_tokens * q[2]) / 1e6;
  }
  near(Logic.compute(a, PRICES, { mode: "30d", keepCache: true, manual: {} }).current, oc * 30 / 7);
});

/* ---------------- formats ---------------- */
T("Anthropic Admin API JSON (dated snapshot id, 1h writes)", () => {
  const aj = { data: [{ starting_at: "2026-09-01T00:00:00Z", ending_at: "2026-09-02T00:00:00Z", results: [{ uncached_input_tokens: 1000000, cache_creation: { ephemeral_5m_input_tokens: 200000, ephemeral_1h_input_tokens: 100000 }, cache_read_input_tokens: 3000000, output_tokens: 500000, model: "claude-opus-5-5-20260901" }] }, { starting_at: "2026-09-02T00:00:00Z", results: [{ uncached_input_tokens: 10, cache_creation: null, cache_read_input_tokens: 0, output_tokens: 5, model: "claude-opus-5-5" }] }], has_more: false };
  const p = Logic.parseUsage(JSON.stringify(aj)), a = Logic.aggregate(p.rows);
  assert.equal(p.format, "anthropic-api"); assert.equal(a.spanDays, 2);
  near(Logic.compute(a, PRICES, { mode: "raw", keepCache: true, manual: {} }).current, (1000010 * 4 + 200000 * 5 + 100000 * 8 + 3e6 * 0.2 + 500005 * 20) / 1e6);
});
T("Anthropic API JSON does not double count cache_creation", () => {
  const p = Logic.parseUsage(JSON.stringify({ data: [{ starting_at: "2026-09-01T00:00:00Z", results: [{ model: "claude-opus-5-5", uncached_input_tokens: 0, cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 }, cache_read_input_tokens: 0, output_tokens: 0 }] }] }));
  assert.equal(p.rows[0].cw5, 100);
});
T("OpenAI CSV: cached is a subset of input, epoch dates, snapshot match", () => {
  const p = Logic.parseUsage("start_time,end_time,project_id,num_model_requests,model,input_tokens,input_cached_tokens,output_tokens,input_audio_tokens\n1756684800,1756771200,,10,gpt-5.4-nano-2026-03-01,1000,400,50,0\n1756771200,1756857600,,10,gpt-5.4-nano,1000,0,50,0");
  assert.equal(p.format, "openai-csv"); assert.equal(p.rows[0].unc, 600); assert.equal(p.rows[0].date, "2025-09-01");
  assert.equal(Logic.matchModel(p.rows[0].model, PRICES.models).id, "gpt-5.4-nano");
});
T("generic CSV with header variants and quoted thousands", () => {
  const p = Logic.parseUsage('Date, Model ,Input Tokens,OUTPUT_TOKENS,cached input tokens\n2026-09-01,gpt-6-luna,"1,000",10,100\n2026-09-03,claude-haiku-5-5,500,5,0');
  assert.equal(p.rows[0].unc, 900);
  const q = Logic.parseUsage("date,model,input_tokens,output_tokens,cached_input_tokens\n2026-09-01,claude-haiku-5-5,500,5,200");
  assert.equal(q.rows[0].unc, 300);
});
T("TSV Anthropic console variant", () => {
  const p = Logic.parseUsage("Usage Date (UTC)\tModel\tInput Tokens\tCache Creation Input Tokens\tCache Read Input Tokens\tOutput Tokens\n2026/9/1\tclaude-sonnet-5-5\t100\t20\t300\t40");
  assert.equal(p.format, "anthropic-csv"); assert.equal(p.rows[0].unc, 100); assert.equal(p.rows[0].cw5, 20); assert.equal(p.rows[0].date, "2026-09-01");
});

/* ---------------- hand-computed edge cases ---------------- */
const one = (csv, o) => { const p = Logic.parseUsage(csv); const a = Logic.aggregate(p.rows); return [p, a, Logic.compute(a, PRICES, { manual: {}, selected: null, ...o })]; };
const csv1 = "usage_date_utc,model_version,usage_input_tokens_no_cache,usage_input_tokens_cache_write_5m,usage_input_tokens_cache_write_1h,usage_input_tokens_cache_read,usage_output_tokens\n2026-09-01,claude-opus-5-5,1000000,2000000,500000,8000000,300000\n2026-09-10,claude-opus-5-5,0,0,0,0,0";
T("Opus 5.5 cache on: 4+10+4+1.6+6 = $25.60; Haiku 5.5 = $0.68", () => {
  const [, , r] = one(csv1, { mode: "raw", keepCache: true });
  near(r.current, 25.6); near(r.scenarios.find((s) => s.model.id === "claude-opus-5-5").cost, 25.6);
  near(r.scenarios.find((s) => s.model.id === "claude-haiku-5-5").cost, 0.68);
});
T("Opus 5.5 cache off: 11.5M x $4 + $6 = $52", () => near(one(csv1, { mode: "raw", keepCache: false })[2].scenarios.find((s) => s.model.id === "claude-opus-5-5").cost, 52));
T("30-day factor over a 10-day span = x3", () => { const [, a, r] = one(csv1, { mode: "30d", keepCache: true }); assert.equal(a.spanDays, 10); near(r.factor, 3); near(r.current, 76.8); });
T("Anthropic data -> GPT-6 Astra: 10 + 2.5M x 12.5 + 8 + 15 = $64.25", () => near(one(csv1, { mode: "raw", keepCache: true })[2].scenarios.find((s) => s.model.id === "gpt-6-astra").cost, 64.25));
const oa = "start_time,model,input_tokens,input_cached_tokens,output_tokens,num_model_requests\n1788220800,gpt-5.4-mini,10000000,4000000,1000000,5";
T("GPT-5.4 mini cache on = $9.30, off = $12.00", () => {
  const [p, , r] = one(oa, { mode: "raw", keepCache: true }); assert.equal(p.format, "openai-csv");
  near(r.current, 9.3); near(one(oa, { mode: "raw", keepCache: false })[2].scenarios.find((s) => s.model.id === "gpt-5.4-mini").cost, 12);
});
T("unknown model: partial current cost, coverage 50%, scenarios include all tokens", () => {
  const [, , r] = one("date,model,input_tokens,output_tokens\n2026-09-01,mystery-llm,1000000,0\n2026-09-01,gpt-6-luna,1000000,0", { mode: "raw", keepCache: true });
  assert.deepEqual(r.unpricedModels, ["mystery-llm"]); assert.equal(r.currentComplete, false); near(r.coverage, 0.5);
  near(r.scenarios.find((s) => s.model.id === "gpt-6-luna").cost, 0.2);
});
T("bad rows are counted, not mis-read", () => {
  assert.equal(Logic.parseUsage("date,model,input_tokens,output_tokens\n2026-09-01,gpt-6-luna,1,000,10\n2026-09-02,gpt-6-luna,5,6").bad, 1);
  assert.equal(Logic.parseUsage("date,model,input_tokens,output_tokens\n2026-09-01,gpt-6-luna,abc,1\n2026-09-01,gpt-6-luna,1,1").bad, 1);
  const p = Logic.parseUsage('date,model,input_tokens,output_tokens\n2026-09-01,gpt-6-luna,"1,234,567","2,000"');
  assert.equal(p.rows[0].unc, 1234567); assert.equal(p.rows[0].out, 2000);
});
T("errors throw with English messages", () => {
  for (const bad of ["", "   ", "foo,bar\n1,2", "{bad json", '{"x":1}', '{"data":[1,2', '{"data":[]}', "date,model,input_tokens,output_tokens\n"]) {
    let msg = null;
    try { Logic.parseUsage(bad); } catch (e) { msg = e.message; }
    assert(msg, "no throw for " + JSON.stringify(bad));
    assert(!/[　-鿿]/.test(msg), "non-English message: " + msg);
  }
  assert(/output-token column/.test((() => { try { Logic.parseUsage("foo,bar\n1,2"); } catch (e) { return e.message; } })()));
});
T("model matching guards", () => {
  assert.equal(Logic.matchModel("gpt-5.5-pro", PRICES.models).id, "gpt-5.5-pro");
  assert.equal(Logic.matchModel("gpt-6-sol-mega", PRICES.models), null);
  assert.equal(Logic.matchModel("claude-sonnet-4-5", PRICES.models).id, "claude-sonnet-4-5-20250929");
});
T("unverified row is excluded until a manual price is given", () => {
  const pm = { ...PRICES, models: [...PRICES.models, { provider: "openai", id: "x-1", name: "X", input: null, output: null, cacheRead: null, cacheWrite: null, status: "unverified" }] };
  let rx = Logic.compute(aA, pm, { mode: "raw", keepCache: true, manual: {} });
  assert(rx.excluded.some((m) => m.id === "x-1"));
  rx = Logic.compute(aA, pm, { mode: "raw", keepCache: true, manual: { "x-1": { input: 1, output: 2 } } });
  assert(rx.scenarios.some((s) => s.model.id === "x-1" && s.price.kind === "manual"));
});

console.log(`\npass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
