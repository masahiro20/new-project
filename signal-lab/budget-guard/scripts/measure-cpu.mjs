// CPU time per route in local workerd. Usage, after `npm run build:cf`:
//   node scripts/measure-cpu.mjs [--port 8788] [--runs 15]
//
// Method: start `opennextjs-cloudflare preview` (= wrangler dev / workerd) with the V8
// inspector, and for every request run the CPU profiler on the Worker's isolate
// (Profiler.start → request → Profiler.stop, 100 µs sampling). "CPU ms" is the sampled
// time that is neither "(idle)" nor "(program)"; "(program)" (native VM work such as
// parsing/compiling) is reported separately for cold calls. This is the Worker's own
// JS CPU — wrangler's local proxy/router workers are not included — measured on this
// machine, not on Cloudflare's, and with profiler overhead. Wall time is useless:
// workerd freezes Date/performance.now while JS runs.
//
// "cold" = the first request to that route in this isolate (lazy module init, JIT);
// "warm" = median / max of --runs later requests. Data: one demo purchase + one
// connection with the offline "demo" token (PAYMENTS_MODE=demo, in-memory KV).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg("port", "8788"));
const INSPECTOR = Number(arg("inspector", "9239"));
const RUNS = Number(arg("runs", "15"));
const BASE = `http://localhost:${PORT}`;
const ORIGIN = BASE;
const CRON_SECRET = "local-dummy-cron-secret";

let send;
async function connectInspector() {
  const ws = new WebSocket(`ws://127.0.0.1:${INSPECTOR}/ws`, { headers: { origin: "http://localhost" } });
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", () => j(new Error("inspector connection failed")));
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", async (e) => {
    const raw = typeof e.data === "string" ? e.data : Buffer.from(await e.data.arrayBuffer()).toString();
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 100 });
  return ws;
}

const GAP_MS = 40;

/**
 * Split one profile into per-request CPU. Requests are sent one at a time with idle
 * gaps, so the non-idle samples form one burst per request. Starting the profiler
 * makes the next JS run look ~20 ms slower, so every profile begins with a throw-away
 * request.
 */
function bursts(profile) {
  const kind = new Map(profile.nodes.map((n) => [n.id, n.callFrame.functionName]));
  const out = [];
  let t = profile.startTime;
  let last = -Infinity;
  let cur = null;
  profile.samples.forEach((s, i) => {
    t += profile.timeDeltas[i] ?? 0;
    // Time until the next sample, capped: workerd records no idle samples while the
    // isolate waits, so the last sample of a request would otherwise absorb the gap.
    const dt = Math.min(profile.timeDeltas[i + 1] ?? 0, 1000) / 1000;
    const f = kind.get(s);
    if (f === "(idle)" || f === "(program)") return;
    if (!cur || t - last > GAP_MS * 600) out.push((cur = { ms: 0, gc: 0, fns: new Map() }));
    cur.ms += dt;
    if (process.env.DEBUG_CPU) cur.fns.set(f, (cur.fns.get(f) ?? 0) + dt);
    if (f === "(garbage collector)") cur.gc += dt;
    last = t;
  });
  return out;
}

/** Run `fns` one after another under one profile; CPU ms per call. */
async function profileCalls(fns, opts = {}) {
  // Burst splitting can be fooled by a stray sample between requests: retry a couple of times.
  for (let attempt = 1; ; attempt++) {
    try {
      return await profileCallsOnce(fns, opts);
    } catch (e) {
      if (attempt >= 3 || !String(e.message).includes("CPU bursts")) throw e;
    }
  }
}
async function profileCallsOnce(fns, { warmup = true } = {}) {
  await send("Profiler.start");
  if (warmup) {
    await call("/robots.txt"); // absorbs the profiler start-up cost
    await sleep(GAP_MS);
  }
  const results = [];
  for (const fn of fns) {
    results.push(await fn());
    await sleep(GAP_MS);
  }
  const { result } = await send("Profiler.stop");
  const b = bursts(result.profile);
  if (process.env.DEBUG_CPU) for (const x of b) console.log("burst", x.ms.toFixed(2), [...x.fns].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(" "));
  const expected = fns.length + (warmup ? 1 : 0);
  if (b.length !== expected) throw new Error(`expected ${expected} CPU bursts, got ${b.length} — raise GAP_MS`);
  return { cpu: warmup ? b.slice(1) : b, results };
}

let gcMax = 0;
let cookie = "";
let n = 1;
const call = (path, { method, body, form, headers = {} } = {}) =>
  fetch(BASE + path, {
    method: method ?? (body || form ? "POST" : "GET"),
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(method && method !== "GET" ? { origin: ORIGIN } : body || form ? { origin: ORIGIN } : {}),
      ...(cookie ? { cookie } : {}),
      // A different client IP per request, so the per-IP rate limits never kick in mid-measurement.
      ...(() => {
        const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n++ & 255}`;
        return { "x-forwarded-for": ip, "cf-connecting-ip": ip };
      })(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
  }).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));

const results = [];
function record(name, type, cold, warm) {
  const sorted = [...warm].sort((a, b) => a - b);
  results.push({ name, type, cold, median: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor((sorted.length - 1) * 0.9)], max: sorted.at(-1) });
}
async function route(name, type, fn, { warm = true } = {}) {
  const n = warm ? RUNS + 2 : 1; // cold, one warm-up, RUNS measured
  const { cpu, results: res } = await profileCalls(Array.from({ length: n }, () => fn));
  if (res[0].status >= 500) throw new Error(`${name}: HTTP ${res[0].status} ${res[0].text.slice(0, 200)}`);
  const warmCpu = warm ? cpu.slice(2) : cpu;
  for (const c of warmCpu) gcMax = Math.max(gcMax, c.gc);
  record(name, type, cpu[0].ms, warmCpu.map((c) => c.ms));
  return res[0];
}

// `preview` = populate the static-assets cache + `wrangler dev`.
const dev = spawn("npx", ["opennextjs-cloudflare", "preview", "--port", String(PORT), "--inspector-port", String(INSPECTOR), "--test-scheduled"], { stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));
try {
  for (let i = 0; i < 240 && !log.includes("Ready on"); i++) await sleep(500);
  if (!log.includes("Ready on")) throw new Error("wrangler dev did not start");
  await sleep(1500);
  await connectInspector();
  // The isolate's very first request (nothing ran before it; includes the profiler's own start-up cost).
  {
    const { cpu } = await profileCalls([() => call("/")], { warmup: false });
    record("(isolate) very first request: GET /", "prerendered", cpu[0].ms, [cpu[0].ms]);
  }

  // A static asset never reaches the Worker (served by Workers Static Assets): expect no CPU burst at all.
  {
    const asset = readdirSync(".open-next/assets/_next/static/chunks").find((f) => f.endsWith(".js"));
    await send("Profiler.start");
    for (let i = 0; i < 5; i++) {
      await call(`/_next/static/chunks/${asset}`);
      await sleep(GAP_MS);
    }
    const { result } = await send("Profiler.stop");
    const ms = bursts(result.profile).reduce((a, b) => a + b.ms, 0) / 5;
    record("GET /_next/static/… (static asset, Worker not invoked)", "asset", ms, [ms]);
  }

  // Prerendered pages (cache interception: no Next.js render).
  for (const p of ["/", "/pricing", "/legal/tokushoho", "/legal/privacy", "/legal/terms", "/access", "/app", "/app/c", "/checkout/demo", "/success", "/robots.txt", "/sitemap.xml", "/llms.txt", "/opengraph-image.png"]) {
    await route(`GET ${p}`, "prerendered", () => call(p));
  }
  await route("GET /pricing (RSC navigation)", "prerendered", () => call("/pricing", { headers: { rsc: "1" } }));

  // Purchase flow (each route's first call is its cold call).
  let checkoutUrl = "";
  await route("POST /api/checkout", "api", async () => {
    const r = await call("/api/checkout", { body: { plan: "monthly" } });
    checkoutUrl ||= JSON.parse(r.text).url;
    return r;
  });
  const id = new URL(checkoutUrl, BASE).searchParams.get("id");
  await route("GET /api/checkout/demo", "api", () => call(`/api/checkout/demo?id=${id}`));
  const card = { id, number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA" };
  // Fresh, unpaid checkouts for every measured pay call (the first one is `id`).
  const pool = [];
  for (let i = 0; i < 3 * RUNS + 1; i++) pool.push(new URL(JSON.parse((await call("/api/checkout", { body: { plan: "monthly" } })).text).url, BASE).searchParams.get("id"));
  let payN = 0;
  await route("POST /api/checkout/demo (pay)", "api", () => call("/api/checkout/demo", { body: { ...card, id: payN++ === 0 ? id : pool[payN - 2] } }));
  await route("POST /api/checkout/complete", "api", () => call("/api/checkout/complete", { body: { session_id: id } }));
  const verify = await route("POST /api/access/verify (sign-in)", "api", () => call("/api/access/verify", { form: { session_id: id } }));
  cookie = verify.headers.get("set-cookie").split(";")[0];

  // Dashboard API.
  await route("GET /api/app/state (no cookie → 401)", "api", async () => {
    const saved = cookie;
    cookie = "";
    try {
      return await call("/api/app/state");
    } finally {
      cookie = saved;
    }
  });
  let connId = "";
  let connLabel = "";
  {
    // Max 3 connections per account: measure each add on its own, deleting the extra one outside the profile.
    const add = () => {
      const label = `OpenAI ${Math.random().toString(36).slice(2, 8)}`;
      return call("/api/app/connections", { body: { provider: "openai", label, budgetUsd: "100", projectId: "proj_demo", token: "demo" } }).then((r) => ({ ...r, label }));
    };
    const samples = [];
    for (let i = 0; i < Math.min(RUNS, 8) + 1; i++) {
      const { cpu, results: [r] } = await profileCalls([add]);
      if (r.status !== 201) throw new Error(`add connection: ${r.status} ${r.text}`);
      samples.push(cpu[0].ms);
      if (connId) await call(`/api/app/connections/${JSON.parse(r.text).id}`, { method: "DELETE" });
      else [connId, connLabel] = [JSON.parse(r.text).id, r.label];
    }
    record("POST /api/app/connections (add; AES-GCM seal)", "api", samples[0], samples.slice(1));
  }
  await route("GET /api/app/state", "api", () => call("/api/app/state"));
  let challenge = "";
  await route("GET /api/app/connections/{id} (decrypt + plan + 2×HMAC)", "api", async () => {
    const r = await call(`/api/app/connections/${connId}`);
    challenge = JSON.parse(r.text).challenges["arm-live"];
    return r;
  });
  await route("POST …/{id} confirm, wrong label (HMAC verify)", "api", () => call(`/api/app/connections/${connId}`, { body: { op: "confirm", action: "arm-live", challenge, typed: "nope" } }));
  await route("POST …/{id} confirm arm-live (HMAC verify)", "api", () => call(`/api/app/connections/${connId}`, { body: { op: "confirm", action: "arm-live", challenge, typed: connLabel } }));
  await route("POST …/{id} test-stop", "api", () => call(`/api/app/connections/${connId}`, { body: { op: "test-stop" } }));
  await route("POST …/{id} check (decrypt + fetch spend)", "api", () => call(`/api/app/connections/${connId}`, { body: { op: "check" } }));
  await route("POST /api/app/connections cross-origin (403)", "api", () => call("/api/app/connections", { body: {}, headers: { origin: "https://evil.example" } }));
  await route("GET /api/checkout/demo/portal", "api", () => call("/api/checkout/demo/portal"));

  // Cron.
  await route("GET /api/cron/check (401, no secret)", "api", async () => {
    const saved = cookie;
    cookie = "";
    try {
      return await call("/api/cron/check");
    } finally {
      cookie = saved;
    }
  });
  await route("GET /api/cron/check with secret (1 conn, manual run)", "api", () => call("/api/cron/check", { headers: { authorization: `Bearer ${CRON_SECRET}` } }));

  // Cron scaling: scheduled() runs one slice (CRON_BATCH_SIZE connections) per minute
  // without Next.js. For N connections, play one hour minute by minute (`time=` picks
  // the hour) and profile every run until the hour's list is done.
  const seedAccount = async () => {
    const co = new URL(JSON.parse((await call("/api/checkout", { body: { plan: "monthly" } })).text).url, BASE).searchParams.get("id");
    await call("/api/checkout/demo", { body: { ...card, id: co } });
    await call("/api/checkout/complete", { body: { session_id: co } });
    return (await call("/api/access/verify", { form: { session_id: co } })).headers.get("set-cookie").split(";")[0];
  };
  let total = 1; // the session above keeps one connection
  const savedCookie = cookie;
  async function grow(n) {
    while (total < n) {
      cookie = await seedAccount();
      for (let c = 0; c < 3 && total < n; c++, total++) {
        const r = await call("/api/app/connections", { body: { provider: "openai", label: `Seed ${total}`, budgetUsd: "100", projectId: "proj_demo", token: "demo" } });
        if (r.status !== 201) throw new Error(`seed: ${r.status} ${r.text}`);
      }
    }
    cookie = savedCookie;
  }
  const hourBase = Date.UTC(2030, 0, 1);
  let scenario = 0;
  for (const n of [1, 10, 100]) {
    await grow(n);
    const hour = hourBase + scenario++ * 3600_000;
    const runs = [];
    for (let minute = 0; minute < 60; minute++) {
      const at = hour + minute * 60_000 + 1000;
      const before = log.length;
      const { cpu } = await profileCalls([() => call(`/cdn-cgi/handler/scheduled?cron=*+*+*+*+*&time=${at}`)]);
      await sleep(50);
      const line = log.slice(before).match(/\[cron\] \* \* \* \* \* (\{.*\})/);
      const res = line ? JSON.parse(line[1]) : null;
      runs.push({ ms: cpu[0].ms, res });
      if (res && !res.initialized && res.checked === 0 && res.remaining === 0) break;
    }
    const work = runs.filter((r) => r.res && r.res.checked > 0);
    const done = runs.reduce((a, r) => a + (r.res?.checked ?? 0) + (r.res?.skipped ?? 0), 0);
    const idle = runs.at(-1);
    record(`scheduled() slice, ${total} conns: first run of the hour (init)`, "cron", runs[0].ms, [runs[0].ms]);
    record(`scheduled() slice, ${total} conns: runs that checked (${work.length} runs, ${done} done)`, "cron", work[0]?.ms ?? 0, work.map((r) => r.ms));
    record(`scheduled() slice, ${total} conns: nothing left (idle minute)`, "cron", idle.ms, [idle.ms]);
  }
} catch (e) {
  console.error(e);
  console.error(log.slice(-3000));
  process.exitCode = 1;
} finally {
  try {
    process.kill(-dev.pid);
  } catch {}
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("route", 58)} ${pad("type", 12)} ${pad("cold", 8)} ${pad("warm med", 9)} ${pad("p90", 7)} max   (CPU ms)`);
for (const r of results) console.log(`${pad(r.name, 58)} ${pad(r.type, 12)} ${pad(r.cold.toFixed(2), 8)} ${pad(r.median.toFixed(2), 9)} ${pad(r.p90.toFixed(2), 7)} ${r.max.toFixed(2)}`);
console.log(`\nlargest GC share of one warm request: ${gcMax.toFixed(2)} ms`);
console.log(`\nJSON ${JSON.stringify(results)}`);
