#!/usr/bin/env node
// Scores reviewer CSVs from the human review sheet (docs/human-review.md) against the AI labels.
//
//   npm run human-review:score -- reviews/alice.csv reviews/bob.csv [--key out/human-review/key.json] [--eval <dir>]
//
// Prints a Markdown report: per-reviewer precision, agreement with the AI labels (raw and Cohen's kappa), agreement
// between reviewers (if ≥ 2), and a corrected precision estimate for the held-out sample, reweighted by rule, with a
// 95% Wilson interval. Precision = correct / (correct + false_positive); "can't tell" is left out (and also shown
// counted as false positive). The math lives in scripts/human-review-lib.mjs (tested in test/human-review.test.ts).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { AI_TO_VERDICT, cohenKappa, normVerdict, parseCsvObjects, stratifiedPrecision, wilson } from "./human-review-lib.mjs";
import { readEvalSet } from "./human-review.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Reviewer CSV text → Map(reviewer → Map(item → { verdict, comment, sheet })). Later rows win; blank verdicts skipped. */
export function parseReviews(text, fallbackReviewer = "reviewer") {
  const out = new Map();
  for (const r of parseCsvObjects(text)) {
    const verdict = normVerdict(r.verdict);
    const item = (r.item_id ?? "").trim();
    if (!item || !verdict) continue;
    const who = (r.reviewer_id ?? "").trim() || fallbackReviewer;
    if (!out.has(who)) out.set(who, new Map());
    out.get(who).set(item, { verdict, comment: r.comment ?? "", sheet: (r.sheet_id ?? "").trim() });
  }
  return out;
}

/**
 * Population weights by rule (warning/error only):
 *  - "sample": the rule counts of the AI-labeled random sample (labels.csv sample = warning_error) — the rows the
 *    published 287/297 figure is computed on;
 *  - "all": every warning/error finding the engine reported on the held-out projects (summary.json totals).
 */
export function ruleWeights(labels, summary) {
  const sample = {};
  for (const l of labels) if (l.sample === "warning_error") sample[l.rule] = (sample[l.rule] ?? 0) + 1;
  let all = null;
  if (summary?.projects) {
    all = {};
    for (const p of Object.values(summary.projects)) for (const [k, n] of Object.entries(p.totals_by_rule_severity ?? {})) {
      const [rule, sev] = k.split("|");
      if (sev === "info") continue;
      all[rule] = (all[rule] ?? 0) + n;
    }
  }
  return { sample, all };
}

const counts = (verdicts) => {
  const c = { correct: 0, false_positive: 0, cant_tell: 0 };
  for (const v of verdicts) c[v]++;
  return c;
};

/** Reweighted precision for item→verdict pairs. items: [{ rule, verdict }]; unsureAsFp counts can't-tell as FP. */
export function correctedPrecision(items, weights, { unsureAsFp = false } = {}) {
  const strata = Object.entries(weights).map(([rule, weight]) => {
    const vs = items.filter((i) => i.rule === rule).map((i) => i.verdict);
    const c = counts(vs);
    return { key: rule, weight, tp: c.correct, fp: c.false_positive + (unsureAsFp ? c.cant_tell : 0) };
  });
  return { ...stratifiedPrecision(strata), strata };
}

/** Majority verdict per item across reviewers (ties → cant_tell). */
export function consensus(reviewers) {
  const items = new Set();
  for (const m of reviewers.values()) for (const k of m.keys()) items.add(k);
  const out = new Map();
  for (const it of items) {
    const vs = [...reviewers.values()].map((m) => m.get(it)?.verdict).filter(Boolean);
    const c = counts(vs);
    const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
    out.set(it, { verdict: top[0][1] > top[1][1] ? top[0][0] : "cant_tell" });
  }
  return out;
}

const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const ci = (c) => (c ? `${pct(c[0])}–${pct(c[1])}` : "–");
const k3 = (x) => (x == null ? "–（定義できない）" : x.toFixed(3));

/** Builds the Markdown report. key: key.json; labels: labels.csv rows (with project); summary: summary.json (optional). */
export function scoreReport({ key, labels, summary, reviewers, files = [] }) {
  const ai = new Map(labels.map((l) => [`${l.project}/${l.finding}`, l]));
  const keyItems = new Map(key.items.map((i) => [i.item, i]));
  const aiOf = (item) => AI_TO_VERDICT[ai.get(`${keyItems.get(item).project}/${keyItems.get(item).finding}`)?.verdict];
  const { sample: wSample, all: wAll } = ruleWeights(labels, summary);
  const lines = [];
  const warn = [];
  lines.push(`# 人による精度の確認：集計（${key.evalSet}）`, "");
  lines.push(`- シート：\`${key.sheetId}\`（${key.size} 件、シード ${key.seed}、エンジン ${key.engine.mode} \`${String(key.engine.commit).slice(0, 12)}\`）`);
  if (files.length) lines.push(`- 読み込んだ CSV：${files.map((f) => `\`${f}\``).join("、")}`);
  lines.push(`- 精度 = 正しい指摘 /（正しい指摘 + 誤検知）。「判断できない」は除外（「誤検知に数えた値」も併記）。`, "");

  for (const [who, m] of reviewers) {
    for (const [it, a] of m) {
      if (!keyItems.has(it)) { warn.push(`${who}: ${it} はこのシートに無い項目なので無視しました`); m.delete(it); continue; }
      if (a.sheet && a.sheet !== key.sheetId) warn.push(`${who}: ${it} のシート ID（${a.sheet}）が key.json（${key.sheetId}）と違います`);
    }
  }
  const dedupWarn = [...new Set(warn)];

  // AI baseline on the same items, for reference.
  const aiItems = key.items.map((i) => ({ rule: i.rule, verdict: aiOf(i.item) })).filter((x) => x.verdict);

  lines.push("## 確認者ごとの結果", "");
  lines.push("| 確認者 | 回答 | 正しい | 誤検知 | 判断できない | 精度（そのまま） | 95% CI | AI との一致率 | κ（3分類） | κ（2分類） |");
  lines.push("|---|---:|---:|---:|---:|---:|---|---:|---:|---:|");
  const perReviewer = [];
  for (const [who, m] of reviewers) {
    const its = [...m.entries()];
    const c = counts(its.map(([, a]) => a.verdict));
    const n = c.correct + c.false_positive;
    const h = its.map(([, a]) => a.verdict);
    const a = its.map(([it]) => aiOf(it));
    const k = cohenKappa(h, a);
    const dec = its.filter(([it, x]) => x.verdict !== "cant_tell" && aiOf(it) !== "cant_tell");
    const k2 = cohenKappa(dec.map(([, x]) => x.verdict), dec.map(([it]) => aiOf(it)));
    perReviewer.push({ who, m });
    lines.push(`| ${who} | ${its.length} / ${key.size} | ${c.correct} | ${c.false_positive} | ${c.cant_tell} | ${n ? pct(c.correct / n) : "–"} | ${ci(wilson(c.correct, n))} | ${pct(k.observed)} | ${k3(k.kappa)} | ${k3(k2.kappa)} |`);
    if (its.length < key.size) dedupWarn.push(`${who}: ${key.size - its.length} 件が未回答です`);
  }
  lines.push("", "κ（2分類）は、確認者と AI の両方が「正しい／誤検知」を付けた項目だけで計算。κ が定義できないのは、両者が全項目に同じ1つの判定を付けた場合（一致率を見てください）。", "");

  lines.push("### AI のラベルとの食い違い（確認者 × AI）", "");
  for (const { who, m } of perReviewer) {
    const cats = ["correct", "false_positive", "cant_tell"];
    const label = { correct: "正しい/TP", false_positive: "誤検知/FP", cant_tell: "判断できない/unsure" };
    lines.push(`**${who}**`, "", `| 確認者 ＼ AI | ${cats.map((c) => label[c]).join(" | ")} |`, "|---|---:|---:|---:|");
    for (const r of cats) lines.push(`| ${label[r]} | ${cats.map((c) => [...m.entries()].filter(([it, a]) => a.verdict === r && aiOf(it) === c).length).join(" | ")} |`);
    const diffs = [...m.entries()].filter(([it, a]) => a.verdict !== aiOf(it));
    if (diffs.length) {
      lines.push("", "食い違った項目：");
      for (const [it, a] of diffs) {
        const k = keyItems.get(it);
        lines.push(`- ${it}（${k.project} ${k.file_line}、${k.rule}）：確認者 ${a.verdict}／AI ${aiOf(it)}${a.comment ? ` — 「${a.comment.replace(/\s+/g, " ").slice(0, 120)}」` : ""}`);
      }
    }
    lines.push("");
  }

  if (reviewers.size >= 2) {
    lines.push("## 確認者どうしの一致", "", "| 組 | 共通の回答 | 一致率 | κ（3分類） |", "|---|---:|---:|---:|");
    const names = [...reviewers.keys()];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const A = reviewers.get(names[i]), B = reviewers.get(names[j]);
      const common = [...A.keys()].filter((k) => B.has(k));
      const k = cohenKappa(common.map((c) => A.get(c).verdict), common.map((c) => B.get(c).verdict));
      lines.push(`| ${names[i]} × ${names[j]} | ${common.length} | ${pct(k.observed)} | ${k3(k.kappa)} |`);
    }
    lines.push("");
  }

  lines.push("## 補正した精度の推定（ルール別に重み付け）", "");
  lines.push("確認したシートは未翻訳以外のルールを多めに含む（全数）ため、そのままの精度は元の母集団の精度ではありません。ルールごとの精度を、母集団でのルールの割合で重み付けして戻します。区間は層別の分散から求めた有効標本数による Wilson 法（95%）。", "");
  lines.push("- 母集団 A「AI ラベルの抽出」：`labels.csv` の `warning_error`（LP の「297件中 287件」の母集団）。ルール別件数：" + Object.entries(wSample).map(([r, n]) => `${r} ${n}`).join("、"));
  if (wAll) lines.push("- 母集団 B「全指摘」：6プロジェクトの警告・エラー全件（`summary.json`）。ルール別件数：" + Object.entries(wAll).map(([r, n]) => `${r} ${n.toLocaleString("en-US")}`).join("、"));
  lines.push("", "| 判定 | 母集団 | 推定精度 | 95% CI | 有効標本数 | 判定の付いた件数 | 判定の無いルール |", "|---|---|---:|---|---:|---:|---|");
  const sets = [...perReviewer.map(({ who, m }) => [who, m])];
  if (reviewers.size >= 2) sets.push(["多数決（同数は判断できない）", consensus(reviewers)]);
  sets.push(["（参考）AI のラベル、同じ項目", new Map(key.items.map((i) => [i.item, { verdict: aiOf(i.item) }]).filter(([, v]) => v.verdict))]);
  const pops = [["A 抽出", wSample], ...(wAll ? [["B 全指摘", wAll]] : [])];
  const headline = [];
  for (const [who, m] of sets) {
    const items = [...m.entries()].map(([it, a]) => ({ rule: keyItems.get(it).rule, verdict: a.verdict }));
    for (const [pname, w] of pops) for (const unsureAsFp of [false, true]) {
      const r = correctedPrecision(items, w, { unsureAsFp });
      lines.push(`| ${who}${unsureAsFp ? "（判断できない＝誤検知）" : ""} | ${pname} | ${pct(r.estimate)} | ${ci(r.ci)} | ${r.nEff ? r.nEff.toFixed(0) : "–"} | ${r.n} | ${r.missing.join(", ") || "–"} |`);
      if (pname === "A 抽出" && !unsureAsFp && !who.startsWith("（参考）")) headline.push({ who, ...r });
    }
  }
  lines.push("");
  const aiBase = correctedPrecision(aiItems, wSample);
  lines.push(`参考：AI 評価者1名の元の値は 297件中 287件（96.6%、95% CI 93.9–98.2%）。同じ項目に AI ラベルで同じ重み付けをすると ${pct(aiBase.estimate)}。`, "");

  lines.push("## LP の文への反映（docs/human-review.md の規則）", "");
  if (!headline.length) lines.push("- 確認者の回答がありません。LP の文は変えません。");
  else {
    for (const h of headline) lines.push(`- ${h.who}：補正後の推定 ${pct(h.estimate)}（95% CI ${ci(h.ci)}）。`);
    lines.push("- 区間が元の 96.6% を含み、かつ AI との κ（2分類）が 0.6 以上なら、数字は 287/297 のまま注記に人の再判定を加えます。そうでなければ人の値で置き換えます。どちらの場合も、確認者の人数・件数・属性を併記し、AI の評価と人の評価を混ぜて合算しないでください。");
  }
  if (dedupWarn.length) lines.push("", "## 注意", "", ...dedupWarn.slice(0, 30).map((w) => `- ${w}`), ...(dedupWarn.length > 30 ? [`- ほか ${dedupWarn.length - 30} 件`] : []));
  return lines.join("\n") + "\n";
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      key: { type: "string", default: join(ROOT, "out", "human-review", "key.json") },
      eval: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !positionals.length) {
    console.log("usage: node scripts/human-review-score.mjs <reviewer.csv>... [--key out/human-review/key.json] [--eval eval/heldout-2]");
    process.exit(values.help ? 0 : 2);
  }
  if (!existsSync(values.key)) throw new Error(`${values.key}: not found (run npm run human-review with the same --seed/--size first)`);
  const key = JSON.parse(readFileSync(values.key, "utf8"));
  const evalDir = resolve(values.eval ?? key.evalDir);
  const { labels } = readEvalSet(evalDir);
  const sp = join(evalDir, "summary.json");
  const summary = existsSync(sp) ? JSON.parse(readFileSync(sp, "utf8")) : undefined;
  const reviewers = new Map();
  for (const f of positionals) {
    for (const [who, m] of parseReviews(readFileSync(f, "utf8"), f.replace(/^.*\//, "").replace(/\.csv$/i, ""))) {
      if (!reviewers.has(who)) reviewers.set(who, new Map());
      for (const [k, v] of m) reviewers.get(who).set(k, v);
    }
  }
  process.stdout.write(scoreReport({ key, labels, summary, reviewers, files: positionals }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`human-review-score: ${e.message}`); process.exit(1); });
}
