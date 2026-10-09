// Regression tests for false positives and misses found by the OSS translation evaluation (eval/*, 2026-10-09).
// Fixtures are minimal strings written for these tests that reproduce each pattern.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, runChecks, type Glossary, type Table } from "../src/core/index.js";
import { enPhraseRegex, isInterjection, katakanaKey, normalizeApostrophes, visibleText } from "../src/core/text.js";

const G = (g: Partial<Glossary>): Glossary => ({ terms: [], characters: [], ...g });
const rules = (r: ReturnType<typeof runChecks>) => r.findings.map((f) => f.rule);
const q = (s: string) => JSON.stringify(s);

/** A small EN→JA .po file. Each entry: [msgid, msgstr] or a full entry object. */
type PoEntry = [string, string] | { id: string; plural?: string; str: string[]; comments?: string[] };
function po(entries: PoEntry[], header = "Language: ja\\nPlural-Forms: nplurals=1; plural=0;\\n"): Table {
  const body = entries.map((e) => {
    if (Array.isArray(e)) return `msgid ${q(e[0])}\nmsgstr ${q(e[1])}\n`;
    const lines = [...(e.comments ?? []), `msgid ${q(e.id)}`];
    if (e.plural !== undefined) {
      lines.push(`msgid_plural ${q(e.plural)}`);
      e.str.forEach((s, i) => lines.push(`msgstr[${i}] ${q(s)}`));
    } else lines.push(`msgstr ${q(e.str[0]!)}`);
    return lines.join("\n") + "\n";
  });
  return parseTable(`msgid ""\nmsgstr "${header}"\n\n${body.join("\n")}`, "t.po");
}
const rows = (pairs: [string, string][]) => po(pairs);

// ---------- 1. placeholders ----------

test("bracketed display labels are not placeholders: [none] → [なし], [empty] → [空]", () => {
  const r = runChecks([rows([["[none]", "[なし]"], ["Value: [empty]", "値: [空]"]])]);
  assert.deepEqual(rules(r).filter((x) => x.startsWith("placeholder")), []);
});

test("variable-like bracket tokens still count: [PLAYER], [player_name], and a dropped Ren'Py [name]", () => {
  const r = runChecks([rows([["Hi [PLAYER]!", "やあ！"], ["Hi [player_name]!", "やあ！"], ["Hi [name]!", "やあ！"]])]);
  assert.equal(rules(r).filter((x) => x === "placeholder.mismatch").length, 3);
});

test("a translator-written menu path does not add placeholders", () => {
  const r = runChecks([rows([["Use Export > macOS > rcodesign.", "[エクスポート] > [macOS] > [rcodesign] を使います。"]])]);
  assert.deepEqual(rules(r).filter((x) => x.startsWith("placeholder")), []);
});

test("'40% defense' is not printf % d; real printf and Wesnoth $var placeholders are still checked", () => {
  const ok = runChecks([rows([["Gain 40% defense here.", "ここでは40%の防御を得る。"], ["Hello $name|, welcome.", "$name| さん、ようこそ。"]])]);
  assert.deepEqual(rules(ok), []);
  const bad = runChecks([rows([["%d items", "アイテム"], ["$count/1000 tiles", "/1000 タイル"], ["Hi $unit.name.", "こんにちは。"]])]);
  assert.deepEqual(rules(bad), ["placeholder.mismatch", "placeholder.mismatch", "placeholder.mismatch"]);
  assert.match(bad.findings[2]!.message, /\$unit\.name(?!\.)/);
});

// ---------- 2. tags ----------

test("angle-bracket display text is not a tag: <unknown> → <不明>, <none available>", () => {
  const r = runChecks([rows([["<unknown>", "<不明>"], ["<none available>", "<利用できません>"], ["<Unnamed Material>", "<名前のないマテリアル>"]])]);
  assert.deepEqual(rules(r), []);
});

test("real markup is still checked: attributes, closing pairs, known tags, added <b>", () => {
  const r = runChecks([
    rows([
      ["<color=#f00>Red</color> alert", "赤い警告"],
      ["<foo>x</foo>", "x"],
      ["<a href=\"x\">link</a>", "リンク"],
      ["Gender:", "<b>性別：</b>"],
    ]),
  ]);
  assert.deepEqual(rules(r), ["tag.mismatch", "tag.mismatch", "tag.mismatch", "tag.mismatch"]);
});

test("emphasis dropped in a Japanese target is info, not a tag error", () => {
  const r = runChecks([rows([["my <i>friend</i>", "我が友"]])]);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.severity]), [["tag.emphasis-dropped", "info"]]);
});

// ---------- 3. PO plurals, speakers, fuzzy ----------

test("PO nplurals=1: msgstr[0] is compared with msgid_plural", () => {
  const t = po([{ id: "1 color", plural: "{num} colors", str: ["{num}色"] }, { id: "One file", plural: "%d files", str: ["%d ファイル"] }]);
  assert.equal(t.rows[0]!.source, "{num} colors");
  assert.match(t.rows[0]!.context!, /singular: 1 color/);
  assert.deepEqual(rules(runChecks([t])), []);
});

test("PO without Plural-Forms but only msgstr[0] uses msgid_plural; nplurals=2 keeps msgid", () => {
  assert.equal(po([{ id: "1 item", plural: "%d items", str: ["%d 個"] }], "Language: ja\\n").rows[0]!.source, "%d items");
  const en = po([{ id: "%d file", plural: "%d files", str: ["%d Datei", "%d Dateien"] }], "Language: de\\nPlural-Forms: nplurals=2; plural=(n != 1);\\n");
  assert.deepEqual(en.rows.map((r) => r.source), ["%d file", "%d files"]);
});

test("PO speaker=X comments (Wesnoth) set the speaker; generic roles do not", () => {
  const t = po([
    { id: "Onward!", str: ["進め！"], comments: ["#. [message]: speaker=Konrad"] },
    { id: "Look out!", str: ["危ない！"], comments: ["#. [message]: speaker=Sir Alric"] },
    { id: "Hm.", str: ["ふむ。"], comments: ["#. [message]: speaker=narrator"] },
    { id: "Ha.", str: ["はっ。"], comments: ["#. [message]: speaker=$unit.id|"] },
  ]);
  assert.deepEqual(t.rows.map((r) => r.speaker), ["Konrad", "Sir Alric", undefined, undefined]);
});

test("untranslated: fuzzy and empty rows are reported per line; a fully untranslated file is not", () => {
  const t = po([
    ["Open the map.", "地図を開く。"],
    { id: "Scenario not found", str: ["シナリオエディター"], comments: ["#, fuzzy"] },
    ["Player %s has left.", ""],
  ]);
  assert.equal(t.rows[1]!.fuzzy, true);
  const r = runChecks([t]);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.severity, f.line]), [
    ["untranslated.fuzzy", "warning", 8],
    ["untranslated.empty", "warning", 11],
  ]);
  assert.deepEqual(rules(runChecks([rows([["Open the map.", ""], ["Close it.", ""]])])), []);
  assert.deepEqual(rules(runChecks([t], undefined, { rules: false })), []);
});

test("untranslated.copy: English prose copied into a Japanese target; names, labels and code are not", () => {
  const t = rows([
    ["Save the current file", "Save the current file"],
    ["Godot", "Godot"],
    ["Run Godot", "Godot を実行"],
    ["Kalenz", "Kalenz"],
    ["Jolt Physics", "Jolt Physics"],
    ["px", "px"],
    ["user://save_data.cfg", "user://save_data.cfg"],
    ["%s by %s", "%s by %s"],
    ["[all | <cmd>] [-t]", "[all | <cmd>] [-t]"],
    ["Halgar Du’nar", "Halgar Du’nar"],
  ]);
  const r = runChecks([t]);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.severity, f.line]), [["untranslated.copy", "info", 4]]);
});

// ---------- 4. katakana notation ----------

test("katakanaKey folds イ/ー after e-row kana and a final ウ/ー after o-row kana, not distinct words", () => {
  assert.equal(katakanaKey("プレイヤー"), katakanaKey("プレーヤー"));
  assert.equal(katakanaKey("フェイズ"), katakanaKey("フェーズ"));
  assert.equal(katakanaKey("ウィンドウ"), katakanaKey("ウィンドー"));
  assert.notEqual(katakanaKey("アンドゥ"), katakanaKey("アンド"));
  assert.notEqual(katakanaKey("ボウル"), katakanaKey("ボール"));
  assert.notEqual(katakanaKey("パーティ"), katakanaKey("パート"));
  assert.notEqual(katakanaKey("ゲート"), katakanaKey("ゲーム"));
});

test("イ/ー and ウ/ー variants are reported as notation drift", () => {
  const r = runChecks([rows([["a", "プレイヤーA"], ["b", "プレイヤーB"], ["c", "プレーヤーC"], ["d", "ウィンドウを開く"], ["e", "ウィンドウ"], ["f", "ウィンドーを閉じる"]])]);
  const pairs = r.findings.map((f) => `${f.found}→${f.expected}`).sort();
  assert.deepEqual(pairs, ["ウィンドー→ウィンドウ", "プレーヤー→プレイヤー"]);
});

test("interjections are not notation drift: アアァ / アアア, ハハハ", () => {
  assert.ok(isInterjection("アアァ") && isInterjection("グオオオォ") && isInterjection("ドーーン") && isInterjection("ギャッ"));
  assert.ok(!isInterjection("ココア") && !isInterjection("サーバー"));
  const r = runChecks([rows([["Argh", "アアア！"], ["Argh!", "アアァ！"]])]);
  assert.deepEqual(rules(r), []);
});

test("a compound follows the standalone word's house style instead of contradicting it", () => {
  const r = runChecks([
    rows([
      ["1", "フォルダを開く"], ["2", "フォルダを閉じる"], ["3", "フォルダ"], ["4", "フォルダーを作成"],
      ["5", "データフォルダー"], ["6", "データフォルダ"],
    ]),
  ]);
  const compound = r.findings.find((f) => f.group === "データフォルダー / データフォルダ" || f.group === "データフォルダ / データフォルダー")!;
  assert.deepEqual([compound.found, compound.expected, compound.line], ["データフォルダー", "データフォルダ", r.findings.find((f) => f.found === "データフォルダー")!.line]);
  assert.ok(!r.findings.some((f) => f.expected === "データフォルダー"));
});

// ---------- Wesnoth: apostrophes, honorifics, Latin names in Japanese ----------

test("typographic apostrophes are folded: Li’sar = Li'sar", () => {
  assert.equal(normalizeApostrophes("Li’sar ‘x’ ʼy"), "Li'sar 'x' 'y");
  assert.equal(visibleText("Li’sar"), "Li'sar");
  assert.ok(enPhraseRegex("Li'sar", true).test("Death of Li’sar"));
  assert.ok(enPhraseRegex("Li’sar", true).test("Li'sar strikes"));
  const g = G({ characters: [{ id: "lisar", ja: "Li'sar", en: "Li'sar" }] });
  const r = runChecks([rows([["Death of Li’sar", "Li'sar の死"], ["That is Li’sar.", "あれは Li’sar です。"]])], g);
  assert.deepEqual(rules(r).filter((x) => x.startsWith("name")), []);
});

test("EN→JA honorifics: Japanese suffix after a space, compared on the target side", () => {
  const g = G({ characters: [{ id: "kalenz", ja: "Kalenz", en: "Kalenz" }] });
  const line = (id: string, ja: string): PoEntry => ({ id, str: [ja], comments: ["#. [message]: speaker=Konrad"] });
  const t = po([
    line("Kalenz, wait.", "Kalenz 様、待って。"),
    line("Kalenz, look.", "Kalenz 様、見て。"),
    line("Kalenz, run!", "Kalenz 殿、逃げて！"),
    line("Lord Kalenz, hello.", "Kalenz 様、こんにちは。"),
  ]);
  const r = runChecks([t], g);
  const hon = r.findings.filter((f) => f.category === "honorific");
  assert.deepEqual(hon.map((f) => [f.rule, f.side, f.found, f.expected]), [["honorific.drift", "target", "殿", "様"]]);
});

test("Latin names kept in a Japanese target are scanned for near-misses", () => {
  const g = G({ characters: [{ id: "a", ja: "Asheviere", en: "Asheviere" }] });
  const r = runChecks([rows([["Queen Asheviere rules.", "Asheviere 女王が支配する。"], ["Asheviere is here.", "Ashaviere がここにいる。"]])], g);
  assert.deepEqual(r.findings.filter((f) => f.rule === "name.near-miss").map((f) => [f.side, f.found, f.expected]), [["target", "Ashaviere", "Asheviere"]]);
});
