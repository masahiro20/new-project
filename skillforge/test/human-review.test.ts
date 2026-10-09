// Human review kit (docs/human-review.md): the scoring math of scripts/human-review-lib.mjs / human-review-score.mjs,
// and a no-network smoke test of the sheet generator (scripts/human-review.mjs) on a tiny injected fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cohenKappa, mulberry32, normVerdict, parseCsv, stratifiedPrecision, stratifiedSample, wilson } from "../scripts/human-review-lib.mjs";
import { consensus, correctedPrecision, parseReviews, ruleWeights, scoreReport } from "../scripts/human-review-score.mjs";
import { buildSheet, matchLabel, parseSourceMd } from "../scripts/human-review.mjs";
import { loadInputs, runChecks } from "../src/core/index.js";

const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sha10 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

test("wilson: matches the published held-out interval (287/297 → 0.939–0.982) and handles edges", () => {
  const ci = wilson(287, 297)!;
  near(ci[0], 0.939);
  near(ci[1], 0.982);
  assert.equal(wilson(0, 0), null);
  const all = wilson(10, 10)!;
  assert.equal(all[1], 1);
  near(all[0], 0.722);
  const none = wilson(0, 10)!;
  assert.equal(none[0], 0);
});

test("cohenKappa: textbook 2×2 example gives 0.4; one shared category is undefined (null)", () => {
  // 50 items: both yes 20, A yes/B no 5, A no/B yes 10, both no 15 → po 0.7, pe 0.5, κ 0.4.
  const a = [...Array(20).fill("y"), ...Array(5).fill("y"), ...Array(10).fill("n"), ...Array(15).fill("n")];
  const b = [...Array(20).fill("y"), ...Array(5).fill("n"), ...Array(10).fill("y"), ...Array(15).fill("n")];
  const k = cohenKappa(a, b);
  near(k.observed!, 0.7);
  near(k.expected!, 0.5);
  near(k.kappa!, 0.4);
  assert.equal(cohenKappa(["c", "c"], ["c", "c"]).kappa, null);
  near(cohenKappa(["a", "b", "c"], ["a", "b", "c"]).kappa!, 1);
  assert.equal(cohenKappa([], []).n, 0);
  assert.throws(() => cohenKappa(["a"], []));
});

test("stratifiedPrecision: reweights by stratum, effective n for the interval, renormalises missing strata", () => {
  const r = stratifiedPrecision([
    { key: "big", weight: 90, tp: 9, fp: 1 },
    { key: "small", weight: 10, tp: 1, fp: 1 },
  ]);
  near(r.estimate!, 0.86); // 0.9·0.9 + 0.1·0.5
  const v = (0.81 * 0.09) / 10 + (0.01 * 0.25) / 2;
  near(r.nEff, (0.86 * 0.14) / v);
  assert.ok(r.ci![0] < 0.86 && r.ci![1] > 0.86);
  // A stratum with no decisive verdict is dropped and reported.
  const m = stratifiedPrecision([
    { key: "a", weight: 50, tp: 3, fp: 1 },
    { key: "b", weight: 50, tp: 0, fp: 0 },
  ]);
  near(m.estimate!, 0.75);
  assert.deepEqual(m.missing, ["b"]);
  near(m.coveredWeight, 0.5);
  // Zero variance (all TP) falls back to the decisive count for the interval.
  const z = stratifiedPrecision([{ key: "a", weight: 1, tp: 20, fp: 0 }]);
  assert.equal(z.estimate, 1);
  assert.equal(z.nEff, 20);
  assert.deepEqual(z.ci, wilson(20, 20));
  assert.equal(stratifiedPrecision([]).estimate, null);
});

test("correctedPrecision / consensus / ruleWeights", () => {
  const items = [
    { rule: "u", verdict: "correct" }, { rule: "u", verdict: "correct" }, { rule: "u", verdict: "cant_tell" },
    { rule: "k", verdict: "false_positive" }, { rule: "k", verdict: "correct" },
  ];
  near(correctedPrecision(items, { u: 3, k: 1 }).estimate!, 0.75 * 1 + 0.25 * 0.5);
  near(correctedPrecision(items, { u: 3, k: 1 }, { unsureAsFp: true }).estimate!, 0.75 * (2 / 3) + 0.25 * 0.5);
  const revs = new Map([
    ["a", new Map([["H1", { verdict: "correct" }], ["H2", { verdict: "correct" }]])],
    ["b", new Map([["H1", { verdict: "correct" }], ["H2", { verdict: "false_positive" }]])],
  ]);
  const c = consensus(revs as never);
  assert.equal(c.get("H1")!.verdict, "correct");
  assert.equal(c.get("H2")!.verdict, "cant_tell"); // tie
  const w = ruleWeights(
    [{ sample: "warning_error", rule: "u" }, { sample: "warning_error", rule: "u" }, { sample: "census_extra", rule: "k" }, { sample: "warning_error", rule: "k" }],
    { projects: { p: { totals_by_rule_severity: { "u|warning": 50, "k|warning": 3, "c|info": 9 } } } },
  );
  assert.deepEqual(w.sample, { u: 2, k: 1 });
  assert.deepEqual(w.all, { u: 50, k: 3 });
});

test("parseReviews: quoted cells, Japanese verdict labels, later rows win, blank verdicts skipped", () => {
  const csv = 'reviewer_id,item_id,verdict,comment,sheet_id\nr1,H001,正しい指摘,"a, ""b""",s\nr1,H002,誤検知,,s\nr1,H002,cant_tell,changed,s\nr1,H003,,,s\n,H004,FP,,s\n';
  const r = parseReviews(csv, "file");
  assert.equal(r.get("r1")!.get("H001")!.verdict, "correct");
  assert.equal(r.get("r1")!.get("H001")!.comment, 'a, "b"');
  assert.equal(r.get("r1")!.get("H002")!.verdict, "cant_tell");
  assert.equal(r.get("r1")!.has("H003"), false);
  assert.equal(r.get("file")!.get("H004")!.verdict, "false_positive");
  assert.equal(normVerdict("TP"), "correct");
  assert.equal(normVerdict("??"), "");
  assert.deepEqual(parseCsv('a,"x\ny"\r\nb,c'), [["a", "x\ny"], ["b", "c"]]);
});

test("stratifiedSample: reproducible, takes every non-untranslated row, splits the rest by project, ignores verdicts", () => {
  const labels: Record<string, string>[] = [];
  for (const p of ["p1", "p2", "p3"]) for (let i = 0; i < 60; i++) labels.push({ project: p, finding: `F${i}`, rule: "untranslated.empty", sample: "warning_error", verdict: "TP" });
  labels.push({ project: "p4", finding: "F1", rule: "untranslated.empty", sample: "warning_error", verdict: "TP" });
  for (let i = 0; i < 10; i++) labels.push({ project: "p1", finding: `K${i}`, rule: "notation.katakana", sample: i < 3 ? "warning_error" : "census_extra", verdict: "TP" });
  labels.push({ project: "p2", finding: "I1", rule: "untranslated.copy", sample: "info", verdict: "FP" });
  const s1 = stratifiedSample(labels, { size: 40, seed: 7 });
  const s2 = stratifiedSample(labels, { size: 40, seed: 7 });
  assert.deepEqual(s1, s2);
  assert.equal(s1.length, 40);
  assert.equal(s1.filter((l) => l.rule === "notation.katakana").length, 10);
  assert.ok(!s1.some((l) => l.sample === "info"));
  const per = (p: string) => s1.filter((l) => l.project === p && l.rule === "untranslated.empty").length;
  assert.deepEqual([per("p1"), per("p2"), per("p3"), per("p4")], [10, 10, 10, 0]); // 30 × 60/181 → 9.94…, largest remainder
  // Verdicts play no part: flipping them gives the same draw.
  const flipped = labels.map((l) => ({ ...l, verdict: l.verdict === "TP" ? "FP" : "TP" }));
  assert.deepEqual(stratifiedSample(flipped, { size: 40, seed: 7 }).map((l) => l.project + l.finding), s1.map((l) => l.project + l.finding));
  assert.notDeepEqual(stratifiedSample(labels, { size: 40, seed: 8 }), s1);
  assert.equal(stratifiedSample(labels, { size: 40, seed: 7, includeInfo: true }).filter((l) => l.sample === "info").length, 1);
  const r = mulberry32(1);
  assert.ok(r() >= 0 && r() < 1);
});

test("parseSourceMd: reads the pinned commit, downloads (for-loop expanded), sha256 and check order of a real source.md", () => {
  const md = readFileSync(new URL("../eval/heldout-2/discourse/source.md", import.meta.url), "utf8");
  const s = parseSourceMd(md, "/cache/heldout-2");
  assert.equal(s.commit, "cfc6e9200b6d1d428efcf1bf1364422bec78b329");
  assert.equal(s.repo, "https://github.com/discourse/discourse");
  assert.match(s.license, /GPL-2\.0/);
  assert.equal(s.name, "Discourse");
  assert.equal(s.downloads.length, 2);
  assert.equal(s.downloads[0]!.file, "/cache/heldout-2/discourse/server.ja.yml");
  assert.equal(s.downloads[0]!.url, "https://raw.githubusercontent.com/discourse/discourse/cfc6e9200b6d1d428efcf1bf1364422bec78b329/config/locales/server.ja.yml");
  assert.equal(s.downloads[0]!.sha256, "045646ea8789ad86034d839c5d42e6123f62bb64b1b4b8022f91d15bf43e8872");
  assert.deepEqual(s.checkFiles, ["/cache/heldout-2/discourse/server.ja.yml", "/cache/heldout-2/discourse/server.en.yml"]);
});

// A tiny eval set laid out like eval/heldout-2, with its files pre-placed in the cache (no network).
const EN = '{\n  "menu": {\n    "start": "Start game",\n    "options": "Options",\n    "quit": "Quit"\n  },\n  "msg": {\n    "saved": "Saved {count} files",\n    "computer": "Computer settings",\n    "computer2": "Computer name",\n    "computer3": "Computer type"\n  }\n}\n';
const JA = '{\n  "menu": {\n    "start": "ゲーム開始",\n    "options": "オプション"\n  },\n  "msg": {\n    "saved": "ファイルを保存しました",\n    "computer": "コンピューター設定",\n    "computer2": "コンピューター名",\n    "computer3": "コンピュータの種類"\n  }\n}\n';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "kotomark-hr-"));
  const evalDir = join(dir, "evalset");
  const cache = join(dir, "cache");
  const proj = join(evalDir, "toy");
  mkdirSync(proj, { recursive: true });
  mkdirSync(join(cache, "evalset", "toy"), { recursive: true });
  writeFileSync(join(cache, "evalset", "toy", "en.json"), EN);
  writeFileSync(join(cache, "evalset", "toy", "ja.json"), JA);
  const S = "0123456789abcdef0123456789abcdef01234567";
  writeFileSync(join(proj, "source.md"), [
    "# データ出典：Toy Game（テスト用、i18n JSON）", "",
    "- リポジトリ：https://example.invalid/toy", `- コミット：\`${S}\``,
    `  - \`lang/en.json\` — ${EN.length} バイト、sha256 \`${sha256(EN)}\``,
    `  - \`lang/ja.json\` — ${Buffer.byteLength(JA)} バイト、sha256 \`${sha256(JA)}\``,
    "- ライセンス：MIT（テスト用）", "", "```bash",
    `D=/tmp/x; S=${S}; mkdir -p $D/toy`,
    "for f in ja en; do curl -sSfL -o $D/toy/$f.json https://example.invalid/raw/$S/lang/$f.json; done",
    "npx tsx src/cli/index.ts check $D/toy/ja.json $D/toy/en.json --format json --fail-on never --no-glossary > $D/toy.A.json", "```", "",
  ].join("\n"));
  // Labels from today's engine (as `kotomark labels` would number them), plus one label whose finding the engine no
  // longer reports (to exercise the location fallback and the message-hiding rule).
  const files = [join(cache, "evalset", "toy", "ja.json"), join(cache, "evalset", "toy", "en.json")];
  const { tables } = loadInputs(files.map((f) => ({ name: f, data: new Uint8Array(readFileSync(f)) })), {});
  const findings = runChecks(tables, undefined, { rules: true }).findings;
  const fl = (f: { file: string; line: number }) => `${f.file.split("+").map((p) => basename(p)).join("+")}:${f.line}`;
  const rows = ["sample,finding,file_line,id_hash,rule,severity,side,verdict,note"];
  findings.forEach((f, i) => rows.push([f.rule.startsWith("untranslated.") ? "warning_error" : "census_extra", `F${String(i + 1).padStart(4, "0")}`, fl(f), sha10(f.id), f.rule, f.severity, f.side, i === 0 ? "FP" : "TP", "SECRET_AI_NOTE"].join(",")));
  const start = findings.find((f) => f.rule === "untranslated.empty")!;
  rows.push(["census_extra", "F0099", fl(start).replace(/:\d+$/, ":3"), sha10("menu.start"), "tag.mismatch", "error", "target", "FP", "SECRET_AI_NOTE"].join(","));
  writeFileSync(join(proj, "labels.csv"), rows.join("\n") + "\n");
  return { dir, evalDir, cache, findings };
}

test("generator smoke test: offline fixture → blind self-contained sheet + key (current engine, location fallback)", async () => {
  const fx = fixture();
  try {
    assert.equal(fx.findings.length, 3);
    const { html, key, report } = await buildSheet({ evalDir: fx.evalDir, cache: fx.cache, size: 10, seed: 3, engine: "current", offline: true });
    assert.equal(key.items.length, 4);
    assert.equal(report.items, 4);
    assert.deepEqual(new Set(key.items.map((i: { item: string }) => i.item)), new Set(["H001", "H002", "H003", "H004"]));
    assert.equal(key.matchMethods.index, 3);
    assert.equal(key.matchMethods.none, 1);
    assert.deepEqual(key.messagesOmittedForRules, ["tag.mismatch"]);
    // Blind: no AI verdicts or notes, no finding numbers in the page.
    assert.ok(!html.includes("SECRET_AI_NOTE"));
    assert.ok(!/"verdict"\s*:/.test(html));
    assert.ok(!/F00\d\d/.test(html));
    assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href=/.test(html)); // self-contained
    const data = JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)![1]!);
    assert.equal(data.items.length, 4);
    const kat = data.items.find((i: { rule: string }) => i.rule === "notation.katakana");
    assert.equal(kat.target, "コンピュータの種類");
    assert.equal(kat.found, "コンピュータ");
    assert.match(kat.messageJa, /コンピュータ/);
    const empty = data.items.find((i: { rule: string }) => i.rule === "untranslated.empty");
    assert.equal(empty.source, "Quit");
    assert.equal(empty.missing, "target");
    const tag = data.items.find((i: { rule: string }) => i.rule === "tag.mismatch");
    assert.equal(tag.source, "Start game");
    assert.equal(tag.messageEn, "");
    assert.equal(data.attribution[0].license, "MIT（テスト用）");
    assert.equal(data.attribution[0].commit, "0123456789abcdef0123456789abcdef01234567");

    // Offline with a corrupted cached file fails on the sha256 check instead of using it.
    writeFileSync(join(fx.cache, "evalset", "toy", "en.json"), EN.replace("Quit", "Exit"));
    await assert.rejects(buildSheet({ evalDir: fx.evalDir, cache: fx.cache, size: 10, seed: 3, engine: "current", offline: true }), /sha256/);
    writeFileSync(join(fx.cache, "evalset", "toy", "en.json"), EN);

    // Round trip: a reviewer CSV for this key scores against the fixture's AI labels.
    const { readEvalSet } = await import("../scripts/human-review.mjs");
    const { labels } = readEvalSet(fx.evalDir);
    const csv = ["reviewer_id,item_id,verdict,comment,sheet_id", ...key.items.map((i: { item: string }) => `r1,${i.item},correct,,${key.sheetId}`)].join("\n");
    const md = scoreReport({ key, labels, summary: undefined, reviewers: parseReviews(csv), files: [] });
    assert.match(md, /\| r1 \| 4 \/ 4 \| 4 \| 0 \| 0 \| 100\.0% \|/);
    assert.match(md, /AI との一致率/);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("matchLabel: index first, then location + id hash (incl. the label sheet's ' guard on ids like -50)", () => {
  const fs = [
    { file: "/x/a.po", line: 10, id: "-50", rule: "untranslated.empty", severity: "warning" },
    { file: "/x/a.po", line: 12, id: "k", rule: "untranslated.empty", severity: "warning" },
  ];
  const base = { file_line: "a.po:10", rule: "untranslated.empty", severity: "warning" };
  assert.equal(matchLabel({ ...base, finding: "F0001", id_hash: sha10("'-50") }, fs).method, "index");
  assert.equal(matchLabel({ ...base, finding: "F0002", id_hash: sha10("-50") }, fs).method, "location");
  assert.equal(matchLabel({ ...base, finding: "F0002", id_hash: "0000000000" }, fs).method, "location-no-id");
  assert.equal(matchLabel({ ...base, file_line: "a.po:11", finding: "F0001", id_hash: "x" }, fs).method, "none");
});
