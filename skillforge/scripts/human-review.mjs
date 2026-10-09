#!/usr/bin/env node
// Builds the blind human review sheet for the held-out accuracy number (docs/human-review.md).
//
//   npm run human-review -- [--eval eval/heldout-2] [--cache ~/.kotomark/review-cache] [--out out/human-review]
//                           [--size 100] [--seed 20261009] [--include-info] [--engine pinned|current]
//                           [--engine-commit <sha>] [--offline]
//
// 1. Reads eval/<set>/<project>/source.md (repository, pinned commit, download URLs, sha256, the check command) and
//    labels.csv (finding id, file:line, id hash, rule, severity, AI verdict).
// 2. Downloads the files at the pinned commit into the cache (outside the repo; sha256-checked). --offline uses what is
//    already in the cache (the tests inject a fixture cache this way).
// 3. Re-runs the engine to get each finding's message and the source/target text:
//    - pinned (default): the engine at the commit the evaluation used (README.md, "コミット `…`"), extracted with
//      `git archive` into the cache. With the same files and settings the findings come out in the same order, so the
//      labels' F#### index points at the same finding; each match is verified by file:line + rule + severity + id hash.
//    - current: today's src/. Findings later fixed away (e.g. the FPs that eval/heldout-2/fixes.md removed) no longer
//      exist, so items are matched by file:line + rule (+ id hash) and their text is taken from the parsed files; for
//      any rule with an unmatched item the engine message is left out for every item of that rule, so whether a message
//      is shown cannot hint at the AI verdict.
// 4. Draws a stratified sample (scripts/human-review-lib.mjs: all non-untranslated rows + untranslated rows split by
//    project) and writes out/human-review/review.html (self-contained, offline, AI verdicts not included) and
//    out/human-review/key.json (item → finding mapping, read by scripts/human-review-score.mjs; no verdicts either).
// The HTML shows third-party text (GPL/MIT/… translations) for local review only: never commit or publish it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parseCsvObjects, stratifiedSample } from "./human-review-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const idHash = (id) => createHash("sha1").update(String(id)).digest("hex").slice(0, 10);
// labels.csv hashes the id as the label sheet wrote it: ids starting with = + - @ carry the spreadsheet guard ' there.
const idHashes = (id) => (/^[=+\-@\t\r]/.test(String(id)) ? [idHash(id), idHash(`'${id}`)] : [idHash(id)]);
const expandHome = (p) => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

// ---------- source.md ----------

/**
 * Parses an eval source.md. `dataDir` replaces `$D` (the evaluator's scratch folder) in the bash block.
 * Returns { title, name, repo, commit, license, downloads: [{ url, file, path, sha256 }], checkFiles: [file] }.
 */
export function parseSourceMd(text, dataDir) {
  const title = (text.match(/^#\s*(?:データ出典[：:])?\s*(.+)$/m)?.[1] ?? "").trim();
  const name = title.split(/[（(]/)[0].trim() || title;
  const repo = text.match(/リポジトリ[：:]\s*(\S+)/)?.[1] ?? "";
  const license = text.match(/^-\s*ライセンス[：:]\s*(.+)$/m)?.[1]?.trim() ?? "";
  const block = text.match(/```(?:bash|sh)?\n([\s\S]*?)```/)?.[1] ?? "";
  const commit = block.match(/\bS=([0-9a-f]{7,40})\b/)?.[1] ?? text.match(/コミット[^`]*`([0-9a-f]{7,40})`/)?.[1] ?? "";
  const vars = { D: dataDir, S: commit };
  const sub = (s, v) => s.replace(/\$\{(\w+)\}|\$(\w+)/g, (m, a, b) => (v[a ?? b] ?? m));
  const downloads = [];
  let checkFiles = [];
  for (const line of block.split("\n")) {
    const loop = line.match(/for\s+(\w+)\s+in\s+([^;]+);\s*do\s+(.+?);\s*done/);
    const runs = loop ? loop[2].trim().split(/\s+/).map((v) => [loop[3], { ...vars, [loop[1]]: v }]) : [[line, vars]];
    for (const [body, v] of runs) {
      const m = body.match(/curl\s+(?:-\S+\s+)*-o\s+(\S+)\s+(?:-\S+\s+)*(https?:\/\/\S+)/);
      if (m) downloads.push({ file: sub(m[1], v), url: sub(m[2], v) });
    }
    const chk = line.match(/\bcheck\s+(.+?)\s+--/);
    if (chk) checkFiles = chk[1].trim().split(/\s+/).map((f) => sub(f, vars));
  }
  // `path` — N バイト、sha256 `hex`
  for (const m of text.matchAll(/`([^`]+)`\s*—[^\n]*?sha256\s*`([0-9a-f]{64})`/g)) {
    const d = downloads.find((x) => x.url.endsWith(`/${m[1]}`));
    if (d) { d.path = m[1]; d.sha256 = m[2]; }
  }
  if (!checkFiles.length) checkFiles = downloads.map((d) => d.file);
  return { title, name, repo, commit, license, downloads, checkFiles };
}

function fetchTo(url, file) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  const r = spawnSync("curl", ["-sSfL", "--retry", "2", "-o", tmp, url], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.error || r.status !== 0) throw new Error(`download failed: ${url}\n${r.error?.message ?? r.stderr?.toString() ?? ""}`);
  renameSync(tmp, file);
}

function ensureFiles(src, { offline, log }) {
  for (const d of src.downloads) {
    const ok = () => existsSync(d.file) && (!d.sha256 || sha256(readFileSync(d.file)) === d.sha256);
    if (ok()) continue;
    if (offline) throw new Error(`${d.file}: missing or sha256 mismatch, and --offline was given`);
    log(`  fetching ${d.url}`);
    fetchTo(d.url, d.file);
    if (!ok()) throw new Error(`${d.file}: sha256 does not match source.md (expected ${d.sha256})`);
  }
  for (const f of src.checkFiles) if (!existsSync(f)) throw new Error(`${f}: not found (listed in the check command of source.md)`);
}

// ---------- engine ----------

let tsxRegistered = false;
async function loadEngine(srcDir) {
  if (!tsxRegistered) {
    const { register } = await import("tsx/esm/api");
    register();
    tsxRegistered = true;
  }
  return import(pathToFileURL(join(srcDir, "core", "index.ts")).href);
}

/** Extracts src/ + package.json of `commit` into the cache (git archive) and returns its src/ folder. */
function pinnedEngineDir(commit, cache) {
  const dir = join(cache, `engine-${commit.slice(0, 12)}`);
  const src = join(dir, "src");
  if (existsSync(join(src, "core", "index.ts"))) return src;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Run from this package's folder: git archive then takes paths relative to it (works in a monorepo subfolder too).
  const archive = spawnSync("git", ["archive", "--format=tar", commit, "src", "package.json"], { cwd: ROOT, maxBuffer: 1 << 28 });
  if (archive.error || archive.status !== 0) throw new Error(`git archive ${commit} failed (is the commit in this clone? fetch it, or use --engine current): ${archive.error?.message ?? archive.stderr}`);
  const tar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
  if (tar.error || tar.status !== 0) throw new Error(`tar failed: ${tar.error?.message ?? tar.stderr}`);
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  return src;
}

const normFile = (f) => String(f).split("+").map((p) => basename(p)).join("+");
const loc = (file, line) => `${normFile(file)}:${line}`;

/** Runs the engine like `check … --no-glossary` (rules on), in English and Japanese, for one project's files. */
function runEngine(core, files) {
  const inputs = files.map((p) => ({ name: p, data: new Uint8Array(readFileSync(p)) }));
  const { tables } = core.loadInputs(inputs, {});
  const en = core.runChecks(tables, undefined, { rules: true, locale: "en" });
  const ja = core.runChecks(tables, undefined, { rules: true, locale: "ja" });
  if (en.findings.length !== ja.findings.length) throw new Error("engine: en/ja runs disagree in length");
  return { tables, findings: en.findings.map((f, i) => ({ ...f, messageJa: ja.findings[i].message })) };
}

/** Row lookup as in today's findingsToLabelCsv: file+line+id, then file+line, then file+id (sourceRef rows too). */
function rowIndex(tables) {
  const at = new Map(), byLine = new Map(), byId = new Map(), all = [];
  const add = (file, line, r, t) => {
    const e = { row: r, table: t };
    const k = loc(file, line);
    if (!at.has(`${k}\0${r.id}`)) at.set(`${k}\0${r.id}`, e);
    if (!byLine.has(k)) byLine.set(k, e);
    if (!byId.has(`${normFile(file)}\0${r.id}`)) byId.set(`${normFile(file)}\0${r.id}`, e);
    all.push({ key: k, hashes: idHashes(r.id), e });
  };
  for (const t of tables) for (const r of t.rows) {
    add(r.file, r.line, r, t);
    if (r.sourceRef) add(r.sourceRef.file, r.sourceRef.line, r, t);
  }
  return {
    forFinding: (f) => at.get(`${loc(f.file, f.line)}\0${f.id}`) ?? byLine.get(loc(f.file, f.line)) ?? byId.get(`${normFile(f.file)}\0${f.id}`),
    forLabel: (l) => all.find((x) => x.key === l.file_line && x.hashes.includes(l.id_hash))?.e ?? all.find((x) => x.key === l.file_line)?.e,
  };
}

/** Finds the finding a label row refers to. Returns { finding, method } (method: index | location | location-no-id | none). */
export function matchLabel(label, findings) {
  const i = Number.parseInt(String(label.finding).replace(/^F/, ""), 10) - 1;
  const same = (f, withId) => f && loc(f.file, f.line) === label.file_line && f.rule === label.rule && f.severity === label.severity && (!withId || idHashes(f.id).includes(label.id_hash));
  if (same(findings[i], true)) return { finding: findings[i], method: "index" };
  let f = findings.find((x) => same(x, true));
  if (f) return { finding: f, method: "location" };
  f = findings.find((x) => same(x, false));
  if (f) return { finding: f, method: "location-no-id" };
  return { finding: null, method: "none" };
}

// ---------- sheet ----------

export function readEvalSet(evalDir) {
  const projects = readdirSync(evalDir).filter((p) => existsSync(join(evalDir, p, "labels.csv")) && existsSync(join(evalDir, p, "source.md"))).sort();
  const labels = [];
  for (const p of projects) for (const l of parseCsvObjects(readFileSync(join(evalDir, p, "labels.csv"), "utf8"))) labels.push({ ...l, project: p });
  return { projects, labels };
}

export function engineCommitFromReadme(evalDir) {
  const f = join(evalDir, "README.md");
  if (!existsSync(f)) return undefined;
  return readFileSync(f, "utf8").match(/コミット\s*`([0-9a-f]{40})`/)?.[1];
}

/** Everything but writing: returns { html, key, report }. */
export async function buildSheet(opts) {
  const log = opts.log ?? (() => {});
  const evalDir = resolve(opts.evalDir);
  const setName = basename(evalDir);
  const cache = resolve(expandHome(opts.cache));
  const { projects, labels } = readEvalSet(evalDir);
  if (!labels.length) throw new Error(`${evalDir}: no <project>/labels.csv found`);
  const chosen = stratifiedSample(labels, { size: opts.size, seed: opts.seed, includeInfo: opts.includeInfo });
  const needed = new Set(chosen.map((l) => l.project));

  let engineSrc, engineDesc;
  if (opts.engine === "current") {
    engineSrc = join(ROOT, "src");
    engineDesc = { mode: "current", commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() || "unknown" };
  } else {
    const commit = opts.engineCommit ?? engineCommitFromReadme(evalDir);
    if (!commit) throw new Error("no engine commit: README.md has no `コミット \\`<sha>\\`` line; pass --engine-commit or --engine current");
    engineSrc = pinnedEngineDir(commit, cache);
    engineDesc = { mode: "pinned", commit };
  }
  log(`engine: ${engineDesc.mode} ${engineDesc.commit.slice(0, 12)} (${engineSrc})`);
  const core = await loadEngine(engineSrc);

  const sources = {};
  const matched = new Map(); // label → { finding, entry, method }
  const methodCounts = {};
  for (const p of projects) {
    if (!needed.has(p)) continue;
    const src = parseSourceMd(readFileSync(join(evalDir, p, "source.md"), "utf8"), join(cache, setName));
    sources[p] = src;
    log(`${p}: ${src.downloads.length} file(s) at ${src.commit.slice(0, 8)}`);
    ensureFiles(src, { offline: opts.offline, log });
    const { tables, findings } = runEngine(core, src.checkFiles);
    const rows = rowIndex(tables);
    for (const l of labels.filter((x) => x.project === p)) {
      const m = matchLabel(l, findings);
      methodCounts[m.method] = (methodCounts[m.method] ?? 0) + 1;
      matched.set(l, { ...m, entry: m.finding ? rows.forFinding(m.finding) : rows.forLabel(l) });
    }
  }
  // A rule with any unmatched chosen item shows no engine message at all (presence of a message must not leak the verdict).
  const noMessageRules = new Set(chosen.filter((l) => !matched.get(l)?.finding).map((l) => l.rule));
  const missingText = chosen.filter((l) => !matched.get(l)?.entry);
  if (missingText.length) throw new Error(`could not locate the text of ${missingText.length} item(s), e.g. ${missingText[0].project} ${missingText[0].file_line}`);

  const items = chosen.map((l, i) => {
    const m = matched.get(l);
    const { row, table } = m.entry;
    const f = m.finding;
    const showMsg = f && !noMessageRules.has(l.rule);
    return {
      item: `H${String(i + 1).padStart(3, "0")}`,
      project: l.project,
      projectName: sources[l.project].name,
      fileLine: l.file_line,
      stringId: row.id,
      context: row.context ?? "",
      rule: l.rule,
      severity: l.severity,
      side: l.side || f?.side || "target",
      messageEn: showMsg ? f.message : "",
      messageJa: showMsg ? f.messageJa : "",
      found: showMsg && f.found ? f.found : "",
      source: row.source ?? "",
      target: row.target ?? "",
      missing: row.missing ?? "",
      sourceLang: table.sourceLang,
      targetLang: table.targetLang,
    };
  });
  const sheetId = `${setName}-s${opts.seed}-n${items.length}-${createHash("sha1").update(chosen.map((l) => `${l.project}/${l.finding}`).join(",")).digest("hex").slice(0, 8)}`;
  const attribution = Object.entries(sources).map(([p, s]) => ({ project: p, title: s.title, name: s.name, repo: s.repo, commit: s.commit, license: s.license, files: s.downloads.map((d) => d.path ?? basename(d.file)) }));
  const key = {
    sheetId,
    evalSet: setName,
    evalDir,
    seed: opts.seed,
    size: items.length,
    includeInfo: !!opts.includeInfo,
    engine: engineDesc,
    matchMethods: methodCounts,
    messagesOmittedForRules: [...noMessageRules],
    createdAt: new Date().toISOString(),
    items: items.map((it, i) => ({ item: it.item, project: chosen[i].project, finding: chosen[i].finding, file_line: chosen[i].file_line, rule: chosen[i].rule, severity: chosen[i].severity, sample: chosen[i].sample, match: matched.get(chosen[i]).method })),
  };
  const html = renderHtml({ sheetId, items, attribution, engine: engineDesc });
  const byRule = {};
  for (const it of items) byRule[it.rule] = (byRule[it.rule] ?? 0) + 1;
  return { html, key, report: { sheetId, items: items.length, byRule, matchMethods: methodCounts, messagesOmittedForRules: [...noMessageRules], engine: engineDesc } };
}

// ---------- HTML ----------

const RULES = {
  "untranslated.empty": {
    ja: "訳文が空、または訳文のファイルにこのキー（文字列）が無いことを指摘します。実際の画面では、英語の原文がそのまま出るか、何も出ません。",
    en: "Flags a translation that is empty, or a key (string) missing from the translation file. On screen, the English source is shown as-is, or nothing is shown.",
  },
  "untranslated.copy": {
    ja: "訳文が原文とまったく同じ（訳し忘れの可能性）であることを指摘します。固有名詞など、そのままが正しい場合もあります。",
    en: "Flags a translation identical to the source (possibly left untranslated). Sometimes that is correct, e.g. for proper names.",
  },
  "notation.katakana": {
    ja: "同じ語のカタカナ表記がファイルの中で揺れている（例：コンピュータ／コンピューター）ことを指摘します。多数派と違う表記の行が対象です。",
    en: "Flags inconsistent katakana spelling of the same word within the file (e.g. コンピュータ vs コンピューター). The line using the minority spelling is flagged.",
  },
  "tag.mismatch": {
    ja: "原文のタグ（<a>…</a>、<b>、{i} など）が、訳文で欠けている・余分にあることを指摘します。リンクや書式が壊れる恐れがあります。",
    en: "Flags markup tags (<a>…</a>, <b>, {i} …) that are missing from, or extra in, the translation. Links or formatting may break.",
  },
  "placeholder.mismatch": {
    ja: "原文の変数・プレースホルダー（{name}、%s、%{count}、[number] など）が、訳文で欠けている・余分にあることを指摘します。実行時に値が入らない、表示が崩れる恐れがあります。",
    en: "Flags variables/placeholders ({name}, %s, %{count}, [number] …) missing from, or extra in, the translation. Values may not appear, or the text may break at run time.",
  },
};

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

export function renderHtml(data) {
  const payload = { ...data, rules: RULES };
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Kotomark 人手確認</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#62625c;--line:#dcdcd6;--accent:#2457c5;--ok:#1f7a3a;--ng:#b3261e;--na:#7a5b00;--mark:#ffe58a;--code:#f0f0ec}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39c;--line:#3a3a36;--accent:#7aa2ff;--ok:#5cc27a;--ng:#ff7b72;--na:#e0b84a;--mark:#6b5600;--code:#2a2a27}}
:root[data-theme="dark"]{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39c;--line:#3a3a36;--accent:#7aa2ff;--ok:#5cc27a;--ng:#ff7b72;--na:#e0b84a;--mark:#6b5600;--code:#2a2a27}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
header h1{font-size:17px;margin:0;flex:1 1 220px}
header label{font-size:13px;color:var(--muted)}
input[type=text],textarea,select{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 8px}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:5px 12px}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
main{max-width:920px;margin:0 auto;padding:16px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:0 0 16px}
.panel h2{font-size:16px;margin:4px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:0 0 14px}
.card.done{border-left:4px solid var(--accent)}
.meta{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 12px;word-break:break-all}
.rule{display:inline-block;font-family:ui-monospace,monospace;font-size:13px;background:var(--code);border-radius:4px;padding:0 6px}
.explain{font-size:14px;margin:6px 0}
.msg{font-size:14px;margin:6px 0;padding:4px 8px;border-left:3px solid var(--line)}
.texts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}
@media (max-width:640px){.texts{grid-template-columns:1fr}}
.tx h3{font-size:12px;color:var(--muted);margin:0 0 2px;font-weight:600}
.tx pre{margin:0;white-space:pre-wrap;word-break:break-word;font:14px/1.55 inherit;font-family:inherit;background:var(--code);border-radius:6px;padding:6px 8px;max-height:260px;overflow:auto}
.empty{color:var(--muted);font-style:italic}
mark{background:var(--mark);color:inherit}
.verdicts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.verdicts button[aria-pressed=true][data-v=correct]{background:var(--ok);border-color:var(--ok);color:#fff}
.verdicts button[aria-pressed=true][data-v=false_positive]{background:var(--ng);border-color:var(--ng);color:#fff}
.verdicts button[aria-pressed=true][data-v=cant_tell]{background:var(--na);border-color:var(--na);color:#fff}
.card textarea{width:100%;min-height:38px}
#csv{width:100%;min-height:120px;font-family:ui-monospace,monospace;font-size:12px}
.status{font-size:13px;color:var(--muted)}
.attr li{margin:4px 0;word-break:break-word}
.small{font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<header>
  <h1 data-t="title"></h1>
  <label><span data-t="reviewer"></span> <input type="text" id="reviewer" size="12" autocomplete="off"></label>
  <span id="progress" class="status" aria-live="polite"></span>
  <label><span data-t="show"></span> <select id="filter"><option value="all"></option><option value="open"></option></select></label>
  <button id="lang" type="button"></button>
</header>
<main>
  <section class="panel" id="intro"></section>
  <div id="items"></div>
  <section class="panel" id="export">
    <h2 data-t="exportH"></h2>
    <p class="small" data-t="exportP"></p>
    <div class="verdicts"><button id="copy" type="button"></button><button id="download" type="button"></button><button id="reset" type="button"></button></div>
    <p id="copyStatus" class="status" aria-live="polite"></p>
    <textarea id="csv" readonly aria-label="CSV"></textarea>
  </section>
  <section class="panel attr" id="attr"></section>
</main>
<script id="data" type="application/json">${jsonForScript(payload)}</script>
<script>
(function(){
"use strict";
var D = JSON.parse(document.getElementById("data").textContent);
var KEY = "kotomark-human-review:" + D.sheetId;
var T = {
 ja: {
  title: "Kotomark の指摘の人手確認", reviewer: "確認者 ID", show: "表示", all: "すべて", open: "未回答のみ", lang: "English",
  progress: function(a,n){return "回答 " + a + " / " + n;},
  introH: "やること（目安 60〜90 分）",
  intro: [
   "Kotomark（訳文を機械的にチェックするツール）が出した指摘を 1 件ずつ見て、指摘が正しいかを判定してください。原文（英語など）と訳文（日本語など）、ルールの説明を表示しています。",
   "<b>正しい指摘</b>：指摘された行に、指摘どおりの問題が実際にあり、ローカライズ QA の担当者として直したい（直すよう報告したい）もの。",
   "<b>誤検知</b>：指摘の内容が事実と違うもの、または事実としては正しいが直す必要がまったく無いもの（例：原文が数字・日付・記号・変数だけで、訳す内容が無い）。",
   "<b>判断できない</b>：情報が足りない、または担当者によって判断が分かれるもの（例：固有名詞を英語のまま残すのが意図的かもしれない）。迷ったら理由をコメントに。",
   "ほかの人や AI の判定は見ず、自分の判断で付けてください。辞書などで調べるのは自由です。1 件 30〜60 秒が目安です。",
   "回答はこのブラウザに自動で保存されます（別のブラウザ・端末には引き継がれません）。終わったら下の「CSV をコピー」で書き出してください。",
   "キーボード：カードの中で 1 = 正しい指摘、2 = 誤検知、3 = 判断できない。"
  ],
  rule: "ルール", what: "このルールが指摘するもの", msg: "ツールのメッセージ", source: "原文", target: "訳文",
  emptyT: "（空）", missingT: "（訳文のファイルにこのキーがありません）", context: "文脈", id: "ID", sev: {warning:"警告", error:"エラー", info:"情報"},
  side: {target:"訳文側", source:"原文側"},
  v: {correct:"正しい指摘", false_positive:"誤検知", cant_tell:"判断できない"},
  comment: "コメント（任意）",
  exportH: "書き出し", exportP: "確認者 ID を入れてから「CSV をコピー」を押し、メモ帳などに貼り付けて <名前>.csv として保存し、依頼者に渡してください。未回答の項目は含まれません。この画面と CSV に含まれる本文は各プロジェクトの著作物です。公開しないでください。",
  copy: "CSV をコピー", download: "CSV を保存", reset: "回答をすべて消す", copied: "コピーしました（{n} 件）。", copyFail: "自動コピーができませんでした。下の欄を選択してコピーしてください。",
  needId: "先に確認者 ID（名前や記号）を入れてください。", confirmReset: "このシートの回答をすべて消します。よろしいですか？", saved: "保存済み", notSaved: "このブラウザでは自動保存できません。終わる前に CSV を書き出してください。",
  attrH: "表示している本文の出典とライセンス", attrP: "本文は下記のオープンソース・プロジェクトの翻訳ファイルから、固定したコミットで取得しています。ローカルでの確認のためだけに表示しています。この HTML ファイルは再配布・公開・コミットしないでください。",
  files: "ファイル", commit: "コミット", license: "ライセンス", engine: "エンジン"
 },
 en: {
  title: "Human review of Kotomark findings", reviewer: "Reviewer ID", show: "Show", all: "All", open: "Unanswered", lang: "日本語",
  progress: function(a,n){return "Answered " + a + " / " + n;},
  introH: "What to do (about 60–90 min)",
  intro: [
   "Look at each finding reported by Kotomark (an automated checker for translations) and judge whether it is right. Each card shows the source text (e.g. English), the translation (e.g. Japanese) and what the rule looks for.",
   "<b>Correct</b>: the flagged line really has the problem described, and as a localization QA reviewer you would want it fixed (would report it).",
   "<b>False positive</b>: the finding is factually wrong, or it is true but there is nothing worth fixing (e.g. the source is only a number, date, symbol or variable, so there is nothing to translate).",
   "<b>Can't tell</b>: not enough information, or reviewers could reasonably disagree (e.g. a proper name may be left in English on purpose). Please say why in the comment.",
   "Judge on your own, without looking at other people's or the AI's labels. Looking things up (dictionaries etc.) is fine. Aim for 30–60 seconds per item.",
   "Answers are saved automatically in this browser (not shared with other browsers or devices). When done, use “Copy CSV” below.",
   "Keyboard: inside a card, 1 = correct, 2 = false positive, 3 = can't tell."
  ],
  rule: "Rule", what: "What this rule flags", msg: "Tool message", source: "Source", target: "Translation",
  emptyT: "(empty)", missingT: "(this key is missing from the translation file)", context: "Context", id: "ID", sev: {warning:"warning", error:"error", info:"info"},
  side: {target:"translation side", source:"source side"},
  v: {correct:"Correct", false_positive:"False positive", cant_tell:"Can't tell"},
  comment: "Comment (optional)",
  exportH: "Export", exportP: "Enter your reviewer ID, press “Copy CSV”, paste into a text editor, save it as <name>.csv and send it to the requester. Unanswered items are not included. The texts on this page and in the CSV belong to the projects listed below; do not publish them.",
  copy: "Copy CSV", download: "Save CSV", reset: "Clear all answers", copied: "Copied ({n} answers).", copyFail: "Could not copy automatically. Select the text below and copy it.",
  needId: "Please enter a reviewer ID (your name or a code) first.", confirmReset: "Clear every answer on this sheet?", saved: "saved", notSaved: "This browser cannot save automatically. Export the CSV before you leave.",
  attrH: "Sources and licenses of the texts shown", attrP: "The texts come from the translation files of the open-source projects below, at pinned commits. They are shown for local review only. Do not redistribute, publish or commit this HTML file.",
  files: "Files", commit: "Commit", license: "License", engine: "Engine"
 }
};
var state = {reviewer: "", lang: "ja", filter: "all", answers: {}};
var storageOk = true;
try {
  var raw = localStorage.getItem(KEY);
  if (raw) { var s = JSON.parse(raw); if (s && typeof s === "object") { state.reviewer = String(s.reviewer || ""); state.lang = s.lang === "en" ? "en" : "ja"; state.filter = s.filter === "open" ? "open" : "all"; state.answers = s.answers && typeof s.answers === "object" ? s.answers : {}; } }
} catch (e) { storageOk = false; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
  progress();
}
function t(k) { return T[state.lang][k]; }
function colon() { return state.lang === "ja" ? "：" : ": "; }
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) { if (k === "text") n.textContent = attrs[k]; else if (k === "html") n.innerHTML = attrs[k]; else n.setAttribute(k, attrs[k]); }
  (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
  return n;
}
function answered() { return D.items.filter(function (it) { var a = state.answers[it.item]; return a && a.verdict; }).length; }
function progress() {
  document.getElementById("progress").textContent = t("progress")(answered(), D.items.length) + " · " + (storageOk ? t("saved") : t("notSaved"));
}
function textBlock(label, text, lang, opts) {
  var pre = el("pre", {lang: lang || ""});
  if (!text) { pre.appendChild(el("span", {"class": "empty", text: opts.missing ? t("missingT") : t("emptyT")})); }
  else if (opts.mark) {
    var parts = text.split(opts.mark);
    parts.forEach(function (p, i) { pre.appendChild(document.createTextNode(p)); if (i < parts.length - 1) pre.appendChild(el("mark", {text: opts.mark})); });
  } else pre.textContent = text;
  return el("div", {"class": "tx"}, [el("h3", {text: label + (lang ? " (" + lang + ")" : "")}), pre]);
}
function card(it, i) {
  var a = state.answers[it.item] || {};
  var c = el("article", {"class": "card" + (a.verdict ? " done" : ""), id: it.item, tabindex: "-1", "data-item": it.item});
  var meta = el("div", {"class": "meta"}, [
   el("b", {text: "#" + (i + 1) + " · " + it.item}),
   el("span", {text: it.projectName}),
   el("span", {text: it.fileLine}),
   el("span", {text: t("id") + ": " + it.stringId}),
   it.context ? el("span", {text: t("context") + ": " + it.context}) : null
  ]);
  var rule = D.rules[it.rule];
  var ruleLine = el("div", {"class": "explain"}, [
   el("span", {"class": "rule", text: it.rule}), document.createTextNode(" " + (t("sev")[it.severity] || it.severity) + " · " + (t("side")[it.side] || it.side))
  ]);
  var expl = el("div", {"class": "explain"}, [el("b", {text: t("what") + colon()}), document.createTextNode(rule ? rule[state.lang] : it.rule)]);
  var msgText = state.lang === "ja" ? (it.messageJa || it.messageEn) : (it.messageEn || it.messageJa);
  var msg = msgText ? el("div", {"class": "msg"}, [el("b", {text: t("msg") + colon()}), document.createTextNode(msgText)]) : null;
  var texts = el("div", {"class": "texts"}, [
   textBlock(t("source"), it.source, it.sourceLang, {}),
   textBlock(t("target"), it.target, it.targetLang, {missing: it.missing === "target", mark: it.found || ""})
  ]);
  var btns = el("div", {"class": "verdicts", role: "group", "aria-label": it.item});
  ["correct", "false_positive", "cant_tell"].forEach(function (v) {
    var b = el("button", {type: "button", "data-v": v, "aria-pressed": a.verdict === v ? "true" : "false", text: t("v")[v]});
    b.addEventListener("click", function () { setVerdict(it.item, a.verdict === v ? "" : v); });
    btns.appendChild(b);
  });
  var ta = el("textarea", {"aria-label": t("comment"), placeholder: t("comment")});
  ta.value = a.comment || "";
  ta.addEventListener("input", function () { var x = state.answers[it.item] || {}; x.comment = ta.value; state.answers[it.item] = x; save(); });
  c.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "TEXTAREA") return;
    var v = {"1": "correct", "2": "false_positive", "3": "cant_tell"}[e.key];
    if (v) { e.preventDefault(); setVerdict(it.item, v); }
  });
  c.append(meta, ruleLine, expl);
  if (msg) c.append(msg);
  c.append(texts, btns, ta);
  return c;
}
function setVerdict(id, v) {
  var x = state.answers[id] || {};
  x.verdict = v; x.at = new Date().toISOString();
  state.answers[id] = x;
  save();
  var c = document.getElementById(id);
  if (!c) return;
  c.classList.toggle("done", !!v);
  c.querySelectorAll(".verdicts button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === v ? "true" : "false"); });
  if (v && state.filter === "open") { c.remove(); }
}
function render() {
  document.documentElement.lang = state.lang;
  document.title = t("title");
  document.querySelectorAll("[data-t]").forEach(function (n) { n.textContent = t(n.getAttribute("data-t")); });
  document.getElementById("lang").textContent = t("lang");
  var f = document.getElementById("filter");
  f.options[0].textContent = t("all"); f.options[1].textContent = t("open"); f.value = state.filter;
  document.getElementById("copy").textContent = t("copy");
  document.getElementById("download").textContent = t("download");
  document.getElementById("reset").textContent = t("reset");
  var intro = document.getElementById("intro");
  intro.innerHTML = "";
  intro.appendChild(el("h2", {text: t("introH")}));
  var ul = el("ul");
  t("intro").forEach(function (h) { ul.appendChild(el("li", {html: h})); });
  intro.appendChild(ul);
  var box = document.getElementById("items");
  box.innerHTML = "";
  D.items.forEach(function (it, i) {
    var a = state.answers[it.item];
    if (state.filter === "open" && a && a.verdict) return;
    box.appendChild(card(it, i));
  });
  var attr = document.getElementById("attr");
  attr.innerHTML = "";
  attr.appendChild(el("h2", {text: t("attrH")}));
  attr.appendChild(el("p", {"class": "small", text: t("attrP")}));
  var al = el("ul");
  D.attribution.forEach(function (s) {
    al.appendChild(el("li", null, [
      el("b", {text: s.title}), document.createTextNode(" — "), el("span", {text: s.repo}),
      el("div", {"class": "small", text: t("commit") + ": " + s.commit + " · " + t("license") + ": " + s.license}),
      el("div", {"class": "small", text: t("files") + ": " + s.files.join(", ")})
    ]));
  });
  attr.appendChild(al);
  attr.appendChild(el("p", {"class": "small", text: t("engine") + ": " + D.engine.mode + " " + D.engine.commit.slice(0, 12) + " · sheet " + D.sheetId}));
  document.getElementById("reviewer").value = state.reviewer;
  progress();
}
var FORMULA = /^[=+\\-@\\t\\r]/;
function cell(v) { var s = String(v == null ? "" : v); if (FORMULA.test(s)) s = "'" + s; return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function csv() {
  var lines = ["reviewer_id,item_id,verdict,comment,sheet_id"];
  D.items.forEach(function (it) {
    var a = state.answers[it.item];
    if (!a || !a.verdict) return;
    lines.push([state.reviewer, it.item, a.verdict, a.comment || "", D.sheetId].map(cell).join(","));
  });
  return lines.join("\\n") + "\\n";
}
function exportText() {
  if (!state.reviewer.trim()) { alert(t("needId")); document.getElementById("reviewer").focus(); return null; }
  var text = csv();
  document.getElementById("csv").value = text;
  return text;
}
document.getElementById("copy").addEventListener("click", function () {
  var text = exportText(); if (text == null) return;
  var st = document.getElementById("copyStatus");
  var ok = function () { st.textContent = t("copied").replace("{n}", String(answered())); };
  var fallback = function () {
    var ta = document.getElementById("csv"); ta.focus(); ta.select();
    var done = false; try { done = document.execCommand("copy"); } catch (e) {}
    if (done) ok(); else st.textContent = t("copyFail");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
});
document.getElementById("download").addEventListener("click", function () {
  var text = exportText(); if (text == null) return;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type: "text/csv"}));
  a.download = "kotomark-review-" + state.reviewer.trim().replace(/[^A-Za-z0-9_.-]+/g, "_") + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
});
document.getElementById("reset").addEventListener("click", function () {
  if (!confirm(t("confirmReset"))) return;
  state.answers = {}; save(); render();
});
document.getElementById("reviewer").addEventListener("input", function (e) { state.reviewer = e.target.value; save(); });
document.getElementById("filter").addEventListener("change", function (e) { state.filter = e.target.value; save(); render(); });
document.getElementById("lang").addEventListener("click", function () { state.lang = state.lang === "ja" ? "en" : "ja"; save(); render(); });
render();
})();
</script>
</body>
</html>
`;
}

// ---------- CLI ----------

async function main() {
  const { values } = parseArgs({
    options: {
      eval: { type: "string", default: join(ROOT, "eval", "heldout-2") },
      cache: { type: "string", default: join(homedir(), ".kotomark", "review-cache") },
      out: { type: "string", default: join(ROOT, "out", "human-review") },
      size: { type: "string", default: "100" },
      seed: { type: "string", default: "20261009" },
      "include-info": { type: "boolean", default: false },
      engine: { type: "string", default: "pinned" },
      "engine-commit": { type: "string" },
      offline: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  if (!["pinned", "current"].includes(values.engine)) throw new Error("--engine must be pinned or current");
  const out = resolve(values.out);
  const cache = resolve(expandHome(values.cache));
  if ((cache + "/").startsWith(ROOT + "/")) console.error(`warning: the cache ${cache} is inside the repository; keep third-party texts out of commits`);
  const { html, key, report } = await buildSheet({
    evalDir: values.eval, cache, size: Number(values.size), seed: Number(values.seed), includeInfo: values["include-info"],
    engine: values.engine, engineCommit: values["engine-commit"], offline: values.offline, log: (m) => console.error(m),
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "review.html"), html);
  writeFileSync(join(out, "key.json"), JSON.stringify(key, null, 2) + "\n");
  console.log(`sheet ${report.sheetId}: ${report.items} items (${Object.entries(report.byRule).map(([r, n]) => `${r} ${n}`).join(", ")})`);
  console.log(`engine ${report.engine.mode} ${report.engine.commit.slice(0, 12)}; label matches: ${Object.entries(report.matchMethods).map(([m, n]) => `${m} ${n}`).join(", ")}`);
  if (report.messagesOmittedForRules.length) console.log(`engine messages left out (some items unmatched) for: ${report.messagesOmittedForRules.join(", ")}`);
  console.log(`wrote ${join(out, "review.html")} (${(statSync(join(out, "review.html")).size / 1024).toFixed(0)} KB) and ${join(out, "key.json")}`);
  console.log("The HTML contains third-party text for local review only: do not commit or publish it.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`human-review: ${e.message}`); process.exit(1); });
}

