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
const { Logic, Samples, PRICES, Share } = load(PAGE, /<script id="app">([\s\S]*?)<\/script>/);

let pass = 0, fail = 0;
const T = (name, fn) => {
  try { fn(); pass++; console.log("ok   " + name); }
  catch (e) { fail++; console.log("FAIL " + name + "\n     " + e.message); }
};
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg || ""} ${a} vs ${b}`);
const MAIN = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
  "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "o4-mini"]);

/* ---------------- price data ---------------- */
T("PRICES checkedOn is 2026-10-09", () => assert.equal(PRICES.checkedOn, "2026-10-09"));
T("every model has numbers or is unverified, and an https source", () => {
  for (const m of PRICES.models) {
    assert(["verified", "unverified"].includes(m.status), m.id);
    if (m.status === "verified") assert(typeof m.input === "number" && typeof m.output === "number", m.id);
    assert(/^https:\/\//.test(m.source), m.id);
  }
});
// v2 adds Google rows and a newer check date, so only the Anthropic/OpenAI prices must still match the source tool.
T("Anthropic/OpenAI prices identical to the source tool (if the source is present)", () => {
  if (!fs.existsSync(SOURCE_TOOL)) { console.log("     (source tool not found, skipped)"); return; }
  const src = load(SOURCE_TOOL, /<script>([\s\S]*?)<\/script>/);
  const pick = (ms) => ms.filter((m) => m.provider !== "google").map(({ provider, id, name, input, output, cacheRead, cacheWrite, status }) => ({ provider, id, name, input, output, cacheRead, cacheWrite, status }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pick(PRICES.models))), JSON.parse(JSON.stringify(pick(src.PRICES.models))));
});
T("Google rows: verified Gemini models with official source and no cache-write price", () => {
  const g = PRICES.models.filter((m) => m.provider === "google");
  assert(g.length >= 3, "gemini rows");
  for (const m of g) {
    assert.equal(m.source, "https://ai.google.dev/gemini-api/docs/pricing", m.id);
    assert.equal(m.cacheWrite, null, m.id);
    if (m.status === "verified") assert(m.input > 0 && m.output > 0 && m.cacheRead > 0, m.id);
  }
  const ids = new Set(PRICES.models.map((m) => m.id));
  assert.equal(ids.size, PRICES.models.length, "duplicate ids");
  for (const id of ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-2.5-pro"]) assert(ids.has(id), id);
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

/* ---------------- Google Gemini (hand-computed) ---------------- */
// csv1 (Anthropic data, raw): unc 1M, cw5 2M, cw1 0.5M, cr 8M, out 0.3M.
// Gemini has no cache-write price, so both cache-write classes are billed at input price.
T("Anthropic data -> Gemini 3.8 Flash: 1x0.75 + 2.5x0.75 + 8x0.075 + 0.3x3.75 = $4.35", () => {
  const r = one(csv1, { mode: "raw", keepCache: true })[2];
  near(r.scenarios.find((s) => s.model.id === "gemini-3.8-flash").cost, 0.75 + 1.875 + 0.6 + 1.125);
  near(r.scenarios.find((s) => s.model.id === "gemini-3.8-flash").cost, 4.35);
});
T("Anthropic data -> Gemini 3.1 Pro Preview (<=200K tier): 2 + 5 + 1.6 + 3.6 = $12.20; cache off = $26.60", () => {
  near(one(csv1, { mode: "raw", keepCache: true })[2].scenarios.find((s) => s.model.id === "gemini-3.1-pro-preview").cost, 12.2);
  near(one(csv1, { mode: "raw", keepCache: false })[2].scenarios.find((s) => s.model.id === "gemini-3.1-pro-preview").cost, 11.5 * 2 + 0.3 * 12);
});
T("Gemini usage via generic CSV: provider google, models/ prefix and current cost", () => {
  const csv = "date,model,input_tokens,output_tokens,cached_input_tokens\n2026-09-01,models/gemini-2.5-flash,4000000,500000,1000000\n2026-09-02,gemini-3.5-flash-lite,2000000,100000,0";
  const p = Logic.parseUsage(csv);
  assert.equal(p.rows[0].provider, "google"); assert.equal(p.rows[0].unc, 3000000);
  assert.equal(Logic.matchModel(p.rows[0].model, PRICES.models).id, "gemini-2.5-flash");
  const r = Logic.compute(Logic.aggregate(p.rows), PRICES, { mode: "raw", keepCache: true, manual: {}, selected: null });
  // 2.5 Flash: 3M x 0.30 + 1M x 0.03 + 0.5M x 2.50 = 0.9 + 0.03 + 1.25 = 2.18; 3.5 Flash-Lite: 2M x 0.30 + 0.1M x 2.50 = 0.85
  near(r.current, 3.03); assert(r.currentComplete);
});

/* ---------------- share links ---------------- */
const shareOf = (agg, extra) => Share.build({ agg, models: PRICES.models, selected: new Set(["gemini-3.8-flash", "claude-opus-5-5"]), mode: "30d", keepCache: true, manual: {}, ...extra });
const plain = (x) => JSON.parse(JSON.stringify(x)); // values from the VM realm -> this realm
const enc = (obj) => "#s=" + Share.toB64url(Share.utf8Bytes(JSON.stringify(obj)));
T("share: round trip restores totals, mix, days, settings and the same costs", () => {
  const pl = shareOf(aA, { mode: "raw", keepCache: false, selected: new Set(["gemini-3.8-flash", "gpt-6-luna"]) });
  const h = "#" + Share.encode(pl);
  assert(/^#s=[A-Za-z0-9_-]+$/.test(h));
  const d = Share.decode(h, PRICES.models);
  assert(d.ok, d.error); assert.equal(d.ignored, 0);
  assert.equal(d.state.mode, "raw"); assert.equal(d.state.keepCache, false); assert.equal(d.state.days, 14);
  assert.deepEqual([...d.state.compare].sort(), ["gemini-3.8-flash", "gpt-6-luna"]);
  const agg2 = Share.toAgg(d.state, PRICES.models);
  for (const k in TOT) near(agg2.totals[k], TOT[k], "total " + k);
  for (const mode of ["30d", "raw"]) for (const keepCache of [true, false]) {
    const o = { mode, keepCache, manual: {}, selected: null };
    const a = Logic.compute(aA, PRICES, o), b = Logic.compute(agg2, PRICES, o);
    near(b.current, a.current, "current");
    a.scenarios.forEach((s) => near(b.scenarios.find((x) => x.model.id === s.model.id).cost, s.cost, s.model.id));
  }
});
T("share: payload holds no raw data, unknown model names go to 'other'", () => {
  const p = Logic.parseUsage("date,model,input_tokens,output_tokens\n2026-09-01,secret-internal-llm,1000,10\n2026-09-03,gpt-6-luna,500,5");
  const pl = shareOf(Logic.aggregate(p.rows), { manual: { "gpt-6-luna": { input: 0.2, output: null }, "nope": { input: 1 } } });
  const json = JSON.stringify(pl);
  assert(!/secret|2026-09/.test(json), json);
  assert.deepEqual(Object.keys(pl.models), ["gpt-6-luna"]); assert.equal(pl.other.unc, 1000);
  assert.deepEqual(pl.manual, { "gpt-6-luna": { input: 0.2 } });
  const d = Share.decode("#" + Share.encode(pl), PRICES.models);
  assert(d.ok); assert.equal(d.state.days, 3);
  const r = Logic.compute(Share.toAgg(d.state, PRICES.models), PRICES, { mode: "raw", keepCache: true, manual: {}, selected: null });
  assert.equal(r.currentComplete, false); near(r.coverage, 505 / 1515);
});
T("share: base64url handles non-ASCII and every padding length", () => {
  for (const str of ["", "a", "ab", "abc", "abcd", "日本語 ✓ <b>", "\u{1F600}"]) assert.equal(Share.utf8String(Share.fromB64url(Share.toB64url(Share.utf8Bytes(str)))), str);
});
T("share: malformed hashes are rejected without throwing", () => {
  const bad = ["", "#", "#s=", "#tool", "#s=@@@@", "#s=a", "#s=%3Cscript%3E", "#s=" + "A".repeat(9000),
    "#s=" + Share.toB64url([0xff, 0xfe, 0xfd]), enc("just a string"), enc([1, 2, 3]), enc(null), enc({ v: 2, totals: { unc: 1 } }),
    enc({ v: 1 }), enc({ v: 1, totals: { unc: -5, out: "1e6" } }), "#s=" + Share.toB64url(Share.utf8Bytes("{\"v\":1,"))];
  for (const h of bad) {
    let d; assert.doesNotThrow(() => { d = Share.decode(h, PRICES.models); }, h.slice(0, 40));
    assert.equal(d.ok, false, "accepted: " + h.slice(0, 60)); assert(typeof d.error === "string" && d.error.length);
  }
});
T("share: hostile values are clamped / ignored", () => {
  const d = Share.decode(enc({ v: 1, period: "<img src=x onerror=alert(1)>", keepCache: "no", days: 1e9,
    // JSON.parse so "__proto__" is a real own key, as it would be in a hostile link
    models: JSON.parse('{"<img src=x onerror=alert(1)>":{"unc":5,"out":5},"__proto__":{"unc":7},"claude-opus-5-5":{"unc":1e300,"cw5":-1,"cr":null,"out":"9","cw1":"NaN"}}'),
    compare: ["claude-opus-5-5", "<script>alert(1)</script>", 42, { x: 1 }], manual: { "gpt-6-luna": { input: -1, output: 1e99, cacheRead: "0.1" }, "<b>x</b>": { input: 1 } } }), PRICES.models);
  assert(d.ok, d.error);
  const s = d.state;
  assert.equal(s.mode, "30d"); assert.equal(s.keepCache, true); assert.equal(s.days, Share.LIMITS.days);
  assert.deepEqual(s.models.map((m) => m.id), ["claude-opus-5-5"]);
  assert.deepEqual(s.models[0].tok, { unc: Share.LIMITS.tokens, cw5: 0, cw1: 0, cr: 0, out: 0 });
  assert.deepEqual(s.other, { unc: 12, cw5: 0, cw1: 0, cr: 0, out: 5 });
  assert.deepEqual([...s.compare], ["claude-opus-5-5"]);
  assert.deepEqual(s.manual, { "gpt-6-luna": { output: Share.LIMITS.price } });
  assert.equal(d.ignored, 6); // 2 model ids + 3 compare entries + 1 manual id
  const pp = Share.decode(enc({ v: 1, totals: { unc: 1 }, manual: JSON.parse('{"__proto__":{"polluted":1}}') }), PRICES.models);
  assert(pp.ok); assert.equal(pp.state.manual.polluted, undefined); assert.equal(({}).polluted, undefined);
  const agg = Share.toAgg(s, PRICES.models);
  assert(agg.byModel.every((b) => !/[<>]/.test(b.model)));
  const r = Logic.compute(agg, PRICES, { mode: s.mode, keepCache: s.keepCache, manual: s.manual, selected: s.compare });
  assert(r.scenarios.every((x) => isFinite(x.cost)));
});
T("share: totals-only payload and default compare", () => {
  const d = Share.decode(enc({ v: 1, totals: { unc: 1e6, out: 1e6 } }), PRICES.models);
  assert(d.ok); assert.equal(d.state.compare, null); assert.equal(d.state.days, null);
  const r = Logic.compute(Share.toAgg(d.state, PRICES.models), PRICES, { mode: "30d", keepCache: true, manual: {}, selected: null });
  near(r.scenarios.find((s) => s.model.id === "gemini-3.8-flash").cost, 0.75 + 3.75);
});

/* ---------------- QA regression (2026-10-09) ---------------- */
T("negative and decimal-comma values are skipped, not mis-read", () => {
  assert.equal(Logic.parseUsage("date,model,input_tokens,output_tokens\n2026-09-01,gpt-6-luna,-5,1\n2026-09-01,gpt-6-luna,1,1").bad, 1);
  assert.equal(Logic.parseUsage('date,model,input_tokens,output_tokens\n2026-09-01,gpt-6-luna,"1,5",1\n2026-09-01,gpt-6-luna,1,1').bad, 1);
  assert.equal(Logic.parseUsage("date;model;input_tokens;output_tokens\n2026-09-01;gpt-6-luna;1.000;1\n2026-09-01;gpt-6-luna;1;1").bad, 1);
});
T("JSON with non-numeric or negative counts: row skipped, no NaN", () => {
  const p = Logic.parseUsage(JSON.stringify({ data: [{ starting_at: "2026-09-01T00:00:00Z", results: [
    { model: "claude-opus-5-5", uncached_input_tokens: "abc", cache_read_input_tokens: 0, output_tokens: 1 },
    { model: "claude-opus-5-5", uncached_input_tokens: -5, cache_read_input_tokens: 0, output_tokens: 1 },
    { model: "claude-opus-5-5", uncached_input_tokens: 10, cache_read_input_tokens: 0, output_tokens: 1 }] }] }));
  assert.equal(p.bad, 2); assert.equal(p.rows.length, 1);
});
T("Bedrock id with date and version suffix matches", () => {
  assert.equal(Logic.matchModel("us.anthropic.claude-opus-5-5-20260901-v1:0", PRICES.models).id, "claude-opus-5-5");
  assert.equal(Logic.matchModel("anthropic.claude-haiku-4-5-20251001-v1:0", PRICES.models).id, "claude-haiku-4-5-20251001");
});
T("zone-less text date keeps its calendar day", () => assert.equal(Logic.toDay("09/01/2026"), "2026-09-01"));

/* ---------------- cheapest: ties and zero usage ---------------- */
T("cheapest: every model at the minimum (to the cent) is marked; OpenAI sample ties Haiku 5.5 and GPT-6 Luna", () => {
  const a = Logic.aggregate(Logic.parseUsage(Samples.openai).rows);
  const r = Logic.compute(a, PRICES, { mode: "30d", keepCache: true, manual: {}, selected: new Set(["claude-haiku-5-5", "gpt-6-luna", "gpt-5.4-mini"]) });
  const ids = r.cheapestAll.map((x) => x.model.id).sort();
  assert.deepEqual(plain(ids), ["claude-haiku-5-5", "gpt-6-luna"]);
  assert(r.scenarios.filter((x) => x.isCheapest).length === 2);
  assert.equal(r.cheapest, r.cheapestAll[0]);
  const min = Math.round(r.scenarios[0].cost * 100);
  r.scenarios.forEach((x) => assert.equal(x.isCheapest, Math.round(x.cost * 100) === min, x.model.id));
});
T("cheapest: single winner on the Anthropic sample with default models (GPT-6 Luna $35.39)", () => {
  const r = Logic.compute(aA, PRICES, { mode: "30d", keepCache: true, manual: {}, selected: new Set([...MAIN, "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"]) });
  assert.equal(r.cheapestAll.length, 1); assert.equal(r.cheapest.model.id, "gpt-6-luna"); assert.equal(r.cheapest.cost.toFixed(2), "35.39");
});
T("cheapest: none when total usage is 0", () => {
  const z = { unc: 0, cw5: 0, cw1: 0, cr: 0, out: 0 };
  const agg = { totals: { ...z }, byModel: [{ model: "gpt-6-luna", provider: "openai", tok: { ...z } }], minDate: null, maxDate: null, spanDays: null, activeDays: 0, rowCount: 1 };
  const r = Logic.compute(agg, PRICES, { mode: "raw", keepCache: true, manual: {}, selected: null });
  assert(r.scenarios.length > 0); assert.equal(r.cheapest, null); assert.equal(r.cheapestAll.length, 0);
  assert(r.scenarios.every((x) => x.isCheapest === false));
});

console.log(`\npass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
