// Regressions from the real-world EN→JA .po evaluation (eval/*/fp-patterns.md): auto-drafted glossaries and
// term.missing. All fixtures are small hand-written lines, not copies of the evaluated projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlossary, runChecks, type Glossary, type Row, type Table } from "../src/core/index.js";
import { draftGlossary } from "../src/core/draft.js";
import { containsPhrase } from "../src/core/text.js";

function table(pairs: [string, string][], file = "ui.po"): Table {
  const rows: Row[] = pairs.map(([source, target], i) => ({ file, line: i * 3 + 1, id: `m${i}`, source, target }));
  return { file, format: "po", sourceLang: "en", targetLang: "ja", rows };
}
const draftOf = (pairs: [string, string][]) => draftGlossary([table(pairs)]);
const targetOf = (d: ReturnType<typeof draftGlossary>, source: string) => d.entries.find((e) => e.source === source)?.target;
const termFindings = (pairs: [string, string][], g: Glossary) =>
  runChecks([table(pairs)], g).findings.filter((f) => f.rule.startsWith("term."));

test("draft: a Latin name kept in most translations is proposed as-is", () => {
  const d = draftOf([
    ["Open the project in Xcode.", "Xcode でプロジェクトを開きます。"],
    ["Xcode is not installed.", "Xcode がインストールされていません。"],
    ["Select the Xcode command line tools.", "Xcode のコマンドラインツールを選択します。"],
    ["Line spacing", "行間"],
    ["Command line", "コマンドライン"],
  ]);
  assert.equal(targetOf(d, "Xcode"), "Xcode");
  assert.equal(d.glossary.terms.find((t) => t.source === "Xcode")?.target, "Xcode");
});

test("draft: weak or unrelated co-occurrence leaves the term without a target", () => {
  // チャンネル co-occurs with Channel in two of four rows; the term itself is rendered differently every time.
  const d = draftOf([
    ["Channel Mixer: Edit Channel", "チャンネルミキサー: チャンネルを修正"],
    ["Edit Channel values", "チャンネル値の変更"],
    ["Edit Brush", "ブラシを編集"],
    ["Edit Palette", "パレットの調整"],
    ["Edit in place", "その場で書き換え"],
  ]);
  assert.equal(targetOf(d, "Edit"), undefined);
  assert.ok(!d.glossary.terms.some((t) => t.source === "Edit"));
});

test("draft: an over-long compound is trimmed to the shared part (アニメーションキーフレーム → キーフレーム)", () => {
  const d = draftOf([
    ["Insert Keyframe", "キーフレームを挿入"],
    ["Delete Keyframe", "キーフレームを削除"],
    ["Copy Keyframe", "アニメーションキーフレームをコピー"],
    ["Paste Keyframe", "アニメーションキーフレームを貼り付け"],
    ["Move Keyframe", "アニメーションキーフレームを移動"],
    ["Animation", "アニメーション"],
    ["Animation track", "アニメーショントラック"],
  ]);
  assert.equal(targetOf(d, "Keyframe"), "キーフレーム");
});

test("draft: targets never end mid-word or start inside another word (最近開, 名の変更)", () => {
  const d = draftOf([
    ["Recent Projects", "最近開いたプロジェクト"],
    ["Recent Files", "最近開いたファイル"],
    ["Recent Scenes", "最近開いたシーン"],
    ["Rename Layer", "レイヤー名の変更"],
    ["Rename Frame", "フレーム名の変更"],
    ["Rename Tag", "タグ名の変更"],
    ["Update Seams", "繋ぎ目の更新"],
    ["Rebuild Seams", "繋ぎ目の再構築"],
  ]);
  const targets = d.entries.map((e) => e.target).filter(Boolean);
  assert.ok(!targets.includes("最近開"), JSON.stringify(targets));
  assert.ok(!targets.includes("名の変更"), JSON.stringify(targets));
  assert.ok(!targets.some((x) => x!.startsWith("目の")), JSON.stringify(targets));
  assert.equal(targetOf(d, "Recent"), "最近");
});

test("draft: everyday UI verbs, adverbs and sub-phrases of a longer term are not proposed", () => {
  const d = draftOf([
    ["Modify Layer", "レイヤーを変更"],
    ["Modify Frame", "フレームを修正"],
    ["Display Grid", "グリッドを表示"],
    ["Display Rulers", "ルーラーを表示"],
    ["Strangely, the door opens.", "不思議なことに、扉が開く。"],
    ["Strangely, nobody came.", "不思議なことに、誰も来なかった。"],
    ["Loading Block Modifiers", "ブロックモディファイアを読み込み中"],
    ["Active Block Modifiers", "アクティブなブロックモディファイア"],
    ["Block Modifiers are slow", "ブロックモディファイアは遅い"],
    ["Block Modifiers interval", "ブロックモディファイアの間隔"],
  ]);
  const sources = d.entries.map((e) => e.source);
  for (const s of ["Modify", "Display", "Modifiers"]) assert.ok(!sources.includes(s), `${s} in ${sources.join(", ")}`);
  assert.equal(targetOf(d, "Strangely"), undefined);
  assert.equal(targetOf(d, "Block Modifiers"), "ブロックモディファイア");
});

test("draft: a single-kanji target needs a strong, repeated link", () => {
  const d = draftOf([
    ["King Garard commands it.", "Garard 王が命じた。"],
    ["King Garard is dead.", "Garard 王は死んだ。"],
    ["Sail to the Isle of Alduin.", "船で Alduin 島へ行く。"],
    ["The Isle of Alduin is far.", "Alduin 島は遠い。"],
  ]);
  assert.notEqual(targetOf(d, "King Garard"), "王");
  assert.notEqual(targetOf(d, "Isle of Alduin"), "島");
});

test("draft: terms are marked draft: true and the glossary schema accepts it", () => {
  const d = draftOf([
    ["Open Palette", "パレットを開く"],
    ["Close Palette", "パレットを閉じる"],
    ["Palette colors", "パレットの色"],
  ]);
  const term = d.glossary.terms.find((t) => t.source === "Palette");
  assert.equal(term?.target, "パレット");
  assert.equal(term?.draft, true);
  const g = parseGlossary(JSON.stringify(d.glossary));
  assert.equal(g.terms.find((t) => t.source === "Palette")?.draft, true);
});

test("term.missing: kept-as-is English, longest match, ALL-CAPS identifiers", () => {
  const g: Glossary = {
    characters: [],
    terms: [
      { source: "App Store", target: "アプリストア" },
      { source: "Modifiers", target: "モディファイア" },
      { source: "Loading Block Modifiers", target: "ローディングブロックモディファイア" },
      { source: "Reset", target: "リセット" },
      { source: "VSync", target: "垂直同期" },
    ],
  };
  const f = termFindings([
    ["Publish to the App Store", "App Store に公開"],
    ["Loading Block Modifiers", "読み込みブロック修飾子"],
    ["Play the RESET animation", "RESET アニメーションを再生"],
    ["Reset all", "すべて初期化"],
    ["Enable VSync", "VSYNC を有効化"],
  ], g);
  assert.deepEqual(f.map((x) => `${x.group}@${x.line}`), ["Loading Block Modifiers → ローディングブロックモディファイア@4", "Reset → リセット@10"]);
});

test("term.missing: approved renderings match with particles and inflection (選択を解除, 準備しています)", () => {
  const g: Glossary = { characters: [], terms: [{ source: "Deselect", target: "選択解除" }, { source: "Preparing", target: "準備中" }] };
  const f = termFindings([
    ["Deselect all", "すべての選択を解除"],
    ["Preparing the export...", "エクスポートを準備しています..."],
    ["Preparing", "準備中"],
    ["Deselect", "外す"],
  ], g);
  assert.deepEqual(f.map((x) => x.line), [10]);
});

test("term.missing: a plural term matches singular source text; draft terms report as info", () => {
  const g: Glossary = {
    characters: [],
    terms: [{ source: "Egg Hunts", target: "エッグハント", draft: true }, { source: "Normal Race", target: "ノーマルレース" }],
  };
  const f = termFindings([
    ["Egg Hunts", "エッグハント"],
    ["Start an egg hunt", "卵狩りを開始"],
    ["Normal Race", "普通レース"],
  ], g);
  assert.deepEqual(f.map((x) => `${x.line}:${x.severity}`), ["4:info", "7:warning"]);
});

test("containsPhrase: loose Japanese matching stays conservative", () => {
  const loose = (t: string, p: string) => containsPhrase(t, p, "ja", false, true);
  assert.ok(loose("すべての選択を解除", "選択解除"));
  assert.ok(loose("ジョイスティックのボタン", "ジョイスティックボタン"));
  assert.ok(loose("取り消し", "取消"));
  assert.ok(loose("名前変更", "名前を変更"));
  assert.ok(!loose("マウス ボタン", "マウスボタン"), "a space inside a katakana compound is notation drift, not grammar");
  assert.ok(!loose("集合", "集中"));
  assert.ok(!containsPhrase("すべての選択を解除", "選択解除", "ja"), "strict by default");
  assert.ok(containsPhrase("Li'sar の死", "Li’sar", "ja"), "apostrophes are folded");
});
