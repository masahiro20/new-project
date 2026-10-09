// Regressions for the false positives found by the held-out evaluation (eval/heldout/fixes.md).
// Every fixture is a small hand-written string; none is copied from the evaluated projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadInputs, runChecks, type Row, type Table } from "../src/core/index.js";
import { pairDirection } from "../src/core/inputs.js";

const json = (o: object) => JSON.stringify(o, null, 2);
const rulesOf = (t: Table[]) => runChecks(t).findings.map((f) => `${f.rule}|${f.severity}|${f.id}`).sort();

function table(rows: [string, string][], sourceLang: "ja" | "en" = "en", format: Table["format"] = "po"): Table {
  const rs: Row[] = rows.map(([source, target], i) => ({ file: "x.po", line: i + 1, id: `k${i}`, source, target }));
  return { file: "x.po", format, sourceLang, targetLang: sourceLang === "ja" ? "en" : "ja", rows: rs };
}

// ---------- 1. pairing direction ----------

test("pairing: en.json with keys the ja file lacks is the source (en→ja), and the note says why", () => {
  const en = { app: { open: "Open", close: "Close", share: "Share {{count}} items" } };
  const ja = { app: { open: "開く", close: "閉じる" } };
  const { tables, notes } = loadInputs([{ name: "locales/ja-JP.json", data: json(ja) }, { name: "locales/en.json", data: json(en) }]);
  const t = tables[0]!;
  assert.deepEqual([t.sourceLang, t.targetLang, t.file], ["en", "ja", "locales/en.json+ja-JP.json"]);
  assert.equal(t.rows.find((r) => r.id === "app.open")!.target, "開く");
  assert.match(notes.join("\n"), /direction en→ja \(en is the source: it has keys the ja file lacks \(1 key\(s\) only in en, 0 only in ja\)/);
  // The missing key is untranslated, not a placeholder error against an empty Japanese "source".
  assert.deepEqual(rulesOf(tables), ["untranslated.empty|warning|app.share"]);
});

test("pairing: Rails YAML (en.yml + ja.yml) pairs en→ja when ja lags behind", () => {
  const en = "en:\n  menu:\n    save: Save\n    load: Load\n    quit: Quit to title\n";
  const ja = "ja:\n  menu:\n    save: セーブ\n    load: ロード\n";
  const { tables } = loadInputs([{ name: "config/ja.yml", data: ja }, { name: "config/en.yml", data: en }]);
  assert.deepEqual([tables[0]!.sourceLang, tables[0]!.targetLang], ["en", "ja"]);
});

test("pairing: a Japanese game's string table with more ja keys stays ja→en", () => {
  const ja = { dlg: { a: "行くぞ！", b: "待って", c: "ここは？" } };
  const en = { dlg: { a: "Let's go!", b: "Wait" } };
  const { tables, notes } = loadInputs([{ name: "ui_en.json", data: json(en) }, { name: "ui_ja.json", data: json(ja) }]);
  assert.deepEqual([tables[0]!.sourceLang, tables[0]!.targetLang], ["ja", "en"]);
  assert.match(notes.join("\n"), /direction ja→en \(ja is the source/);
});

test("pairing: equal key sets default to ja; a base/default name or an explicit option overrides", () => {
  const ja = { a: "はい", b: "いいえ" };
  const en = { a: "Yes", b: "No" };
  const plain = loadInputs([{ name: "ja.json", data: json(ja) }, { name: "en.json", data: json(en) }]);
  assert.equal(plain.tables[0]!.sourceLang, "ja");
  assert.match(plain.notes.join("\n"), /key sets do not tell.*ja taken as the source/);
  const based = loadInputs([{ name: "lang/ja.json", data: json(ja) }, { name: "lang/base/en.json", data: json(en) }]);
  assert.equal(based.tables[0]!.sourceLang, "en");
  const forced = loadInputs([{ name: "ja.json", data: json(ja) }, { name: "en.json", data: json(en) }], { pairSource: "en" });
  assert.deepEqual([forced.tables[0]!.sourceLang, forced.tables[0]!.targetLang], ["en", "ja"]);
  assert.match(forced.notes.join("\n"), /source language en as requested/);
});

test("pairDirection: a few stray keys on the other side do not flip a clear superset", () => {
  const mk = (lang: "ja" | "en", ids: string[]): Table => ({
    file: `${lang}.json`, format: "i18n-json", sourceLang: lang, targetLang: lang === "ja" ? "en" : "ja", singleLang: lang,
    rows: ids.map((id, i) => ({ file: `${lang}.json`, line: i + 1, id, source: id, target: "" })),
  });
  const shared = ["a", "b", "c"];
  assert.equal(pairDirection(mk("ja", [...shared, "old"]), mk("en", [...shared, "n1", "n2", "n3"])).source, "en");
  assert.equal(pairDirection(mk("ja", [...shared, "x1", "x2"]), mk("en", [...shared, "y1"])).source, "ja");
  assert.equal(pairDirection(mk("ja", [...shared, "x1"]), mk("en", [...shared, "y1"])).source, "ja");
});

// ---------- 2. missing keys and plural variants ----------

test("missing keys: only untranslated rules; an extra key in the translation is info; Japanese plural forms are legit", () => {
  const en = {
    files: { one: "<b>{{count}}</b> file", other: "<b>{{count}}</b> files" },
    msgs_one: "%{n} message", msgs_other: "%{n} messages",
    tip: "Press <kbd>{{key}}</kbd> to jump",
    gone: { one: "{{count}} day", other: "{{count}} days" },
  };
  const ja = { files: { other: "<b>{{count}}</b> 個のファイル" }, msgs_other: "%{n} 件のメッセージ", oldkey: "古い <b>{{x}}</b> 文" };
  const { tables, notes } = loadInputs([{ name: "en.json", data: json(en) }, { name: "ja.json", data: json(ja) }]);
  assert.equal(tables[0]!.sourceLang, "en");
  assert.deepEqual(rulesOf(tables), [
    // The whole plural is untranslated: reported once, on the `other` form Japanese needs.
    "untranslated.empty|warning|gone.other",
    "untranslated.empty|warning|tip",
    "untranslated.extra-key|info|oldkey",
  ]);
  assert.match(notes.join("\n"), /3 plural variant key\(s\) absent from the Japanese file not reported .*files\.one, msgs_one, gone\.one/);
});

test("missing keys: ja→en with an English-only `.one` key is not reported (ja has one plural form)", () => {
  const ja = { stars: { other: "★{{count}}" }, title: "タイトル", menu: "メニュー" };
  const en = { stars: { one: "{{count}} star", other: "{{count}} stars" }, title: "Title" };
  const { tables } = loadInputs([{ name: "ja.json", data: json(ja) }, { name: "en.json", data: json(en) }]);
  assert.equal(tables[0]!.sourceLang, "ja");
  assert.deepEqual(rulesOf(tables), ["untranslated.empty|warning|menu"]);
});

// ---------- 3. printf positional arguments and repeated named placeholders ----------

test("placeholders: %n$ reordering matches unnumbered conversions by position", () => {
  const ok = (s: string, t: string) => assert.deepEqual(rulesOf([table([[s, t]])]), [], `${s} → ${t}`);
  ok("%s sent %s to %s", "%3$s に %1$s が %2$s を送った");
  ok("%s scored %d", "%2$d 点：%1$s");
  ok("%1$s and %2$s", "%s と %s");
  ok("Hello %s", "%1$s さん、%1$s さん！");
  ok("Key '%c' in %s", "%2$s のキー '%1$c'");
  ok("%ld bytes", "%ld バイト");
  const bad = (s: string, t: string) => assert.deepEqual(rulesOf([table([[s, t]])]), ["placeholder.mismatch|error|k0"], `${s} → ${t}`);
  bad("%s scored %d", "%1$d 点：%2$s"); // types swapped
  bad("%s and %s", "%1$s と %1$s"); // second argument dropped
  bad("%s and %s", "%s"); // unnumbered count still matters
});

test("placeholders: a named placeholder used more (or fewer) times is info, not an error", () => {
  const f = runChecks([table([["Join {server} now", "{server} に参加しよう。{server} は無料です"]])]).findings;
  assert.deepEqual(f.map((x) => `${x.rule}|${x.severity}`), ["placeholder.count|info"]);
  assert.match(f[0]!.message, /used more times than in the source: \{server\}/);
  const g = runChecks([table([["${who} meets ${who}", "${who} と会う"]])]).findings;
  assert.deepEqual(g.map((x) => `${x.rule}|${x.severity}`), ["placeholder.count|info"]);
  // A different named placeholder is still an error.
  assert.deepEqual(rulesOf([table([["Join {server}", "{host} に参加"]])]), ["placeholder.mismatch|error|k0"]);
});

// ---------- 4. katakana middle dot ----------

test("notation.katakana: with a dotted compound in the majority, the dotless minority is flagged", () => {
  const rows: [string, string][] = [
    ["a", "ギルド・ホールへ行く"], ["b", "ギルド・ホールで待つ"], ["c", "ギルド・ホールの扉"],
    ["d", "ギルドホールに戻る"], ["e", "ギルドに入る"], ["f", "ギルドの掟"], ["g", "ギルドを抜ける"], ["h", "ギルドが動く"],
    ["i", "ギルドへ報告"],
  ];
  const f = runChecks([table(rows)]).findings.filter((x) => x.rule === "notation.katakana");
  assert.deepEqual(f.map((x) => [x.line, x.found, x.expected]), [[4, "ギルドホール", "ギルド・ホール"]]);
});

test("notation.katakana: on a tie the shared words cannot decide, so the dotless form is kept", () => {
  const rows: [string, string][] = [
    ["a", "ロード・メニューを開く"], ["b", "ロードメニューを閉じる"], ["c", "ロードする"], ["d", "ロード中"], ["e", "メニューへ"],
  ];
  const f = runChecks([table(rows)]).findings.filter((x) => x.rule === "notation.katakana");
  assert.deepEqual(f.map((x) => [x.line, x.found, x.expected]), [[1, "ロード・メニュー", "ロードメニュー"]]);
});

// ---------- 5. untranslated.copy on command syntax ----------

test("untranslated.copy: command/option syntax copied as is is not reported; English prose still is", () => {
  const rows: [string, string][] = [
    ["Open the door", "ドアを開ける"], ["(file, tcp:port)", "(file, tcp:port)"], ["set log_level=debug first", "set log_level=debug first"],
    ["Save the game now", "Save the game now"],
  ];
  const f = runChecks([table(rows)]).findings.filter((x) => x.rule === "untranslated.copy");
  assert.deepEqual(f.map((x) => x.line), [4]);
});
