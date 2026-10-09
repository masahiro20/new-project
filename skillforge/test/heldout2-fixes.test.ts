// Regressions for the false positives and the label-sheet bug found by the second held-out evaluation
// (eval/heldout-2/fixes.md). Every fixture is a small hand-written string; none is copied from the evaluated projects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findingsToLabelCsv, loadInputs, parseGlossary, runChecks, type Row, type Table } from "../src/core/index.js";
import { nothingToTranslate } from "../src/core/text.js";

const json = (o: object) => JSON.stringify(o, null, 2);
const rulesOf = (t: Table[], g = parseGlossary("")) => runChecks(t, g).findings.map((f) => `${f.rule}|${f.severity}|${f.id}`).sort();

function table(rows: [string, string][], format: Table["format"] = "po"): Table {
  const rs: Row[] = rows.map(([source, target], i) => ({ file: "x.po", line: i + 1, id: `k${i}`, source, target }));
  return { file: "x.po", format, sourceLang: "en", targetLang: "ja", rows: rs };
}

// ---------- 1. untranslated.empty on rows with nothing to translate ----------

test("nothingToTranslate: numbers, dates, signs, placeholders and key names have nothing to translate", () => {
  for (const s of ["-12", "+3", "2.5x", "x4", "75%", "1999/12/31", "23:59", "9:15 PM", "…", "...", "★", "--", "${HERO}", "%{site}: %{subject}", "{{done}}/{{all}}", "%1$s / %2$s", "(%s)", "%d×", "<b>%s</b>", "Ctrl", "Shift", "Alt", "Esc", "F12", "Cmd", "Ctrl+Z", "Shift+Alt+F3"]) {
    assert.equal(nothingToTranslate(s), true, s);
  }
  for (const s of ["Tab", "Home", "Enter", "Space", "OK", "x", "%1$s items", "{} [OFF]", "[NEW]", "Level %d", "${HERO} wins", "Ctrl to zoom", "5 km"]) {
    assert.equal(nothingToTranslate(s), false, s);
  }
});

test("untranslated.empty: not reported for a source with nothing to translate; real text still is", () => {
  const t = table([["Start game", "ゲーム開始"], ["-12", ""], ["1999/12/31", ""], ["...", ""], ["${HERO}", ""], ["%{site}: %{subject}", ""], ["Ctrl", ""], ["Open the map", ""], ["Tab", ""]]);
  assert.deepEqual(rulesOf([t]), ["untranslated.empty|warning|k7", "untranslated.empty|warning|k8"]);
});

test("untranslated.empty: a key missing from the ja file is not reported when its English is a key name or placeholders only", () => {
  const en = { keys: { ctrl: "Ctrl", esc: "Esc", pager: "{{page}}/{{pages}}", help: "Show shortcuts", ok: "OK" } };
  const ja = { keys: { ok: "OK" } };
  const { tables } = loadInputs([{ name: "ja.json", data: json(ja) }, { name: "en.json", data: json(en) }]);
  assert.deepEqual(rulesOf(tables), ["untranslated.empty|warning|keys.help"]);
});

// ---------- 2. display text read as markup ----------

test("placeholder: [word] translated in full-width brackets (［番号］) is a display label, not a lost placeholder", () => {
  assert.deepEqual(rulesOf([table([["[digit]", "［数字］"], ["Press [digit] to jump", "［数字］キーで移動"]], "i18n-json")]), []);
  // A real lowercase placeholder that disappears is still an error when nothing translated stands in for it.
  assert.deepEqual(rulesOf([table([["Hello [player_name]", "こんにちは"]], "i18n-json")]), ["placeholder.mismatch|error|k0"]);
});

test("tag: a bare <space> / <color> that is never closed is display text, not TextMeshPro markup", () => {
  assert.deepEqual(rulesOf([table([["<space>", "<スペース>"], ["Press <space> twice", "スペースキーを2回押す"], ["paint <unit> <color>", "paint <ユニット> <色>"]], "i18n-json")]), []);
  // With a value or a closing tag they are markup and still compared.
  assert.deepEqual(rulesOf([table([["A<space=2em>B", "AB"], ["<color=red>Hot</color>", "熱い"]], "i18n-json")]), ["tag.mismatch|error|k0", "tag.mismatch|error|k1"]);
});

// ---------- 3. label sheet: rows that share an id ----------

test("labels: .po entries sharing a msgctxt show their own source and target, looked up by file and line", () => {
  const po = [
    'msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Language: ja\\n"', "",
    'msgctxt "castle_building"', 'msgid "Storehouse"', 'msgstr "貯蔵庫"', "",
    'msgctxt "castle_building"', 'msgid "Barracks"', 'msgstr ""', "",
    'msgctxt "castle_building"', 'msgid "Tower"', 'msgstr "塔"', "",
  ].join("\n");
  const { tables } = loadInputs([{ name: "ja.po", data: po }]);
  const result = runChecks(tables);
  const empty = result.findings.filter((f) => f.rule === "untranslated.empty");
  assert.equal(empty.length, 1);
  assert.equal(empty[0]!.line, 10);
  const csv = findingsToLabelCsv(result, tables).trim().split("\n");
  const line = csv.find((l) => l.includes(",10,"))!;
  assert.match(line, /,Barracks,,,$/);
  assert.ok(!line.includes("貯蔵庫") && !line.includes("塔"), line);
});

test("labels: a paired .ks source-side finding shows the row found through the original's file and line", () => {
  const g = parseGlossary(json({ terms: [], characters: [{ id: "akane", ja: "あかね", en: "Akane", forbidden: { ja: ["茜"] } }] }));
  const ja = "*s\n\n茜、おはよう。[p]\n";
  const en = "*s\nMorning, Akane.[p]\n";
  const { tables } = loadInputs([{ name: "ja/a.ks", data: ja }, { name: "en/a.ks", data: en }]);
  const result = runChecks(tables, g);
  const f = result.findings.find((x) => x.rule === "name.forbidden")!;
  assert.deepEqual([f.side, f.file, f.line], ["source", "ja/a.ks", 3]);
  assert.match(findingsToLabelCsv(result, tables), /ja\/a\.ks,3,s#1,name,name\.forbidden.*,茜、おはよう。,"Morning, Akane\.",,/);
});

// ---------- 4. Ren'Py: the empty-target note ----------

test("renpy: a blank `old \" \"` string is neither reported nor counted as an empty target in the note", () => {
  const rpy = [
    'translate japanese strings:', "",
    '    # game/screens.rpy:10', '    old "Save"', '    new "セーブ"', "",
    '    # game/screens.rpy:20', '    old " "', '    new " "', "",
    '    # game/screens.rpy:30', '    old "Load"', '    new ""', "",
  ].join("\n");
  const { tables, notes } = loadInputs([{ name: "game/tl/japanese/screens.rpy", data: rpy }]);
  assert.deepEqual(rulesOf(tables).map((r) => r.split("|")[0]), ["untranslated.empty"]);
  assert.ok(notes.some((n) => n.endsWith("1 of 3 rows have an empty target (untranslated)")), notes.join("\n"));
});

// ---------- 5. .ks: the translation's speaker labels ----------

const sheet = parseGlossary(json({
  terms: [],
  characters: [
    { id: "akane", ja: "あかね", en: "Akane", aliases: { en: ["Aka"] }, forbidden: { en: ["Akne"] } },
    { id: "c2", ja: "蓮", en: "Ren", reading: "れん" },
  ],
}));

test("ks: paired rows keep the original's speaker and carry the translation's as targetSpeaker", () => {
  const { tables } = loadInputs([{ name: "ja/b.ks", data: "*s\n#あかね\nやあ。[p]\n" }, { name: "en/b.ks", data: "*s\n#Akane\nHi.[p]\n" }]);
  assert.deepEqual(tables[0]!.rows.map((r) => [r.speaker, r.targetSpeaker]), [["あかね", "Akane"]]);
});

test("ks: a translation speaker label that is not the character's English name or alias is reported on the translation line", () => {
  const ja = "*s\n#あかね\nやあ。[p]\n#あかね\nまたね。[p]\n#あかね\nうん。[p]\n#蓮\nおう。[p]\n#蓮\nじゃあ。[p]\n";
  const en = "*s\n#Akane\nHi.[p]\n#Aka\nSee you.[p]\n#Akne\nYeah.[p]\n#Ren\nYo.[p]\n#蓮\nWell.[p]\n";
  const { tables } = loadInputs([{ name: "ja/c.ks", data: ja }, { name: "en/c.ks", data: en }]);
  const fs = runChecks(tables, sheet).findings.filter((f) => f.category === "name").sort((a, b) => a.line - b.line);
  assert.deepEqual(fs.map((f) => [f.rule, f.severity, f.side, f.file, f.line, f.found, f.expected]), [
    ["name.forbidden", "error", "target", "en/c.ks", 7, "Akne", "Akane"],
    ["name.speaker-label", "warning", "target", "en/c.ks", 11, "蓮", "Ren"],
  ]);
  assert.match(fs[1]!.message, /Speaker label "蓮" in the translation \(original "蓮"\) is not this character's approved name "Ren"/);
});

test("ks: an en→ja pair checks the Japanese speaker label against the Japanese name, alias and reading", () => {
  const en = "*s\n#Ren\nYo.[p]\n#Ren\nWell.[p]\n#Ren\nOkay.[p]\n";
  const ja = "*s\n#れん\nおう。[p]\n#蓮\nじゃあ。[p]\n#Ren\nいいよ。[p]\n";
  const { tables } = loadInputs([{ name: "en/d.ks", data: en }, { name: "ja/d.ks", data: ja }], { pairSource: "en" });
  const fs = runChecks(tables, sheet).findings.filter((f) => f.category === "name");
  assert.deepEqual(fs.map((f) => [f.rule, f.side, f.file, f.line, f.found]), [["name.speaker-label", "target", "ja/d.ks", 7, "Ren"]]);
});

test("ks: without a character sheet the translation's speaker labels are not checked", () => {
  const { tables } = loadInputs([{ name: "ja/e.ks", data: "*s\n#あかね\nやあ。[p]\n" }, { name: "en/e.ks", data: "*s\n#Whoever\nHi.[p]\n" }]);
  assert.deepEqual(runChecks(tables).findings.filter((f) => f.category === "name"), []);
});
