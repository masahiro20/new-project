// Input formats beyond CSV/JSON/XLIFF: XLSX, gettext PO, per-locale i18n JSON, Unity / Unreal string table CSVs,
// and loadInputs (decoding, detection, pairing single-language tables by key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { detectFormat, loadInputs, parseGlossary, parseTable, runChecks, type InputFile, type Table } from "../src/core/index.js";
import { makeXlsx } from "./xlsx-fixture.js";
import { read } from "./helpers.js";

const bytes = (p: string) => new Uint8Array(readFileSync(new URL(`../${p}`, import.meta.url)));
const sample = (p: string): InputFile => ({ name: p, data: bytes(`samples/formats/${p}`) });
const lineOf = (text: string, needle: string) => text.slice(0, text.indexOf(needle)).split("\n").length;
const rowsOf = (t: Table) => t.rows.map((r) => [r.id, r.line, r.source, r.target]);

// ---------- XLSX ----------

test("XLSX: spreadsheet row numbers, shared/rich/inline strings, gaps, furigana skipped, sheet in file label", () => {
  const book = makeXlsx([
    {
      name: "Lines",
      rows: {
        1: { A: "key", C: "ja", D: "en", E: "speaker", F: "max_length" },
        2: { A: "a1", C: { rich: ["魔導石", "を拾った"], ruby: "まどうせき" }, D: "You got a Mana Stone & more", E: "ミナ", F: 30 },
        4: { A: "a2", C: { inline: "<b>開始</b>" }, D: { inline: "Start_x000D_" } },
        5: { A: "a3", C: "x < y", D: "" },
      },
    },
  ]);
  const t = parseTable(book, "book.xlsx");
  assert.equal(t.file, "book.xlsx#Lines");
  assert.equal(t.format, "xlsx");
  assert.equal(t.sourceLang, "ja");
  assert.deepEqual(rowsOf(t), [
    ["a1", 2, "魔導石を拾った", "You got a Mana Stone & more"],
    ["a2", 4, "<b>開始</b>", "Start\r"],
    ["a3", 5, "x < y", ""],
  ]);
  assert.equal(t.rows[0]!.speaker, "ミナ");
  assert.equal(t.rows[0]!.maxLength, 30);
});

test("XLSX: first non-empty sheet by default; sheet option by name or 1-based number; notes name the choice", () => {
  const book = makeXlsx([
    { name: "Empty", rows: {} },
    { name: "Ch1", rows: { 1: ["id", "ja", "en"], 2: ["c1", "猫", "Cat"] } },
    { name: "Ch2", rows: { 3: ["id", "ja", "en"], 4: ["c2", "犬", "Dog"] } },
  ]);
  const def = loadInputs([{ name: "b.xlsx", data: book }]);
  assert.equal(def.tables[0]!.file, "b.xlsx#Ch1");
  assert.match(def.notes.join("\n"), /read sheet "Ch1".*Empty, Ch2/);
  const byName = loadInputs([{ name: "b.xlsx", data: book }], { sheet: "ch2" }).tables[0]!;
  assert.deepEqual([byName.file, ...rowsOf(byName)], ["b.xlsx#Ch2", ["c2", 4, "犬", "Dog"]]);
  assert.equal(parseTable(book, "b.xlsx", { sheet: 3 }).file, "b.xlsx#Ch2");
  assert.equal(parseTable(book, "b.xlsx", { sheet: "2" }).file, "b.xlsx#Ch1");
  assert.throws(() => parseTable(book, "b.xlsx", { sheet: "Nope" }), /b\.xlsx: no sheet "Nope" \(sheets: Empty, Ch1, Ch2\)/);
  assert.throws(() => parseTable(book, "b.xlsx", { sheet: 1 }), /sheet "Empty" is empty/);
});

test("XLSX: workbook XML with namespace prefixes, numbers, booleans and absolute relationship targets", () => {
  const ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const files = {
    "xl/workbook.xml": strToU8(`<x:workbook ${ns} xmlns:r="r"><x:sheets><x:sheet name="A &amp; B" sheetId="1" r:id="rId7"/></x:sheets></x:workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId7" Target="/xl/worksheets/data.xml"/></Relationships>`),
    "xl/worksheets/data.xml": strToU8(
      `<x:worksheet ${ns}><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>id</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>ja</x:t></x:is></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>en</x:t></x:is></x:c><x:c r="D1" t="inlineStr"><x:is><x:t>limit</x:t></x:is></x:c></x:row>` +
        `<x:row r="2"><x:c r="A2"><x:v>101</x:v></x:c><x:c r="B2" t="str"><x:f>A1</x:f><x:v>&#x9B54;&#23566;</x:v></x:c><x:c r="C2" t="b"><x:v>1</x:v></x:c><x:c r="D2"><x:v>12</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
    ),
  };
  const t = parseTable(zipSync(files), "ns.xlsx");
  assert.equal(t.file, "ns.xlsx#A & B");
  assert.deepEqual(rowsOf(t), [["101", 2, "魔導", "TRUE"]]);
  assert.equal(t.rows[0]!.maxLength, 12);
});

test("XLSX: clear errors for non-zip, legacy .xls, text input and zips that are not workbooks", () => {
  assert.throws(() => parseTable(strToU8("id,ja,en\n"), "x.xlsx"), /x\.xlsx: not an \.xlsx file/);
  assert.throws(() => parseTable(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "old.xlsx"), /legacy \.xls/);
  assert.throws(() => parseTable("PK\u0003\u0004...", "t.xlsx"), /must be passed as bytes/);
  assert.throws(() => parseTable(zipSync({ "word/document.xml": strToU8("<w/>") }), "doc.xlsx"), /xl\/workbook\.xml missing/);
  assert.throws(() => loadInputs([{ name: "dir/bad.xlsx", data: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) }]), /^Error: dir\/bad\.xlsx: could not unzip/);
});

test("XLSX: committed sample samples/formats/book.xlsx", () => {
  const { tables, notes } = loadInputs([sample("book.xlsx")]);
  const t = tables[0]!;
  assert.equal(t.file, "book.xlsx#Script");
  assert.deepEqual(t.rows.map((r) => [r.id, r.line]), [["b_001", 2], ["b_002", 3], ["b_003", 4], ["b_004", 6], ["b_005", 7], ["b_006", 8], ["b_007", 9]]);
  assert.equal(t.rows[1]!.source, "この魔導石、光ってます！");
  assert.equal(t.rows[0]!.context, "Opening");
  assert.match(notes[0]!, /also has: Notes/);
});

// ---------- PO ----------

const PO = `# translator note
msgid ""
msgstr ""
"Language: en\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#. Speaker: Lisette
#: src/a.c:10 src/a.c:20
#, fuzzy, c-format
msgctxt "greet"
msgid "ようこそ、"
"灰の書庫へ。"
msgstr "Welcome to the \\"Ashen\\"\\n"
"Archive.\\t"

msgid "魔導石"
msgstr "Mana Stone"

msgid "%d個の魔導石"
msgid_plural "%d個の魔導石たち"
msgstr[0] "%d Mana Stone"
msgstr[1] "%d Mana Stones"

#~ msgid "古い"
#~ msgstr "Old"
`;

test("PO: msgctxt/msgid ids, line of msgctxt or msgid, multi-line strings, escapes, comments, fuzzy, plurals", () => {
  const t = parseTable(PO, "ui.po");
  assert.equal(t.format, "po");
  assert.equal(t.sourceLang, "ja");
  assert.equal(t.targetLang, "en");
  assert.deepEqual(rowsOf(t), [
    ["greet", lineOf(PO, 'msgctxt "greet"'), "ようこそ、灰の書庫へ。", 'Welcome to the "Ashen"\nArchive.\t'],
    ["魔導石", lineOf(PO, 'msgid "魔導石"'), "魔導石", "Mana Stone"],
    ["%d個の魔導石", lineOf(PO, 'msgid "%d個'), "%d個の魔導石", "%d Mana Stone"],
    ["%d個の魔導石[1]", lineOf(PO, 'msgid "%d個'), "%d個の魔導石たち", "%d Mana Stones"],
  ]);
  assert.equal(t.rows[0]!.speaker, "Lisette");
  assert.equal(t.rows[0]!.context, "Speaker: Lisette | ref: src/a.c:10 src/a.c:20 | fuzzy");
  assert.match(t.rows[2]!.context!, /plural: %d個の魔導石たち/);
  assert.equal(detectFormat("strings.pot", ""), "po");
  assert.equal(detectFormat("pasted", '# c\n\nmsgid "a"\nmsgstr "b"\n'), "po");
});

test("PO: Unreal Engine export (msgctxt \"Namespace,Key\", #. Key:/SourceLocation:) — sample ui.po", () => {
  const text = read("samples/formats/ui.po");
  const { tables, notes } = loadInputs([sample("ui.po")]);
  const t = tables[0]!;
  assert.equal(t.targetLang, "en");
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["UI,MainMenu_Start"]!.line, lineOf(text, 'msgctxt "UI,MainMenu_Start"'));
  assert.match(byId["UI,MainMenu_Start"]!.context!, /^Key:\tMainMenu_Start \| SourceLocation:\t\/Game\/UI\//);
  assert.equal(byId["Items,Item_ManaStone_Desc"]!.source, "星詠みの力を宿した魔導石。\n{Count}個まで持てる。");
  assert.match(byId["Quests,Quest_Gate_Title"]!.context!, /fuzzy/);
  assert.equal(byId["UI,Hud_Saved"]!.source, '"{Slot}"にセーブしました。');
  assert.equal(byId["UI,Hud_Saved"]!.target, "");
  assert.ok(notes.some((n) => /ui\.po: 1 of 6 rows have an empty target/.test(n)));
});

test("PO: .pot template (all msgstr empty) and errors with file:line", () => {
  const { tables, notes } = loadInputs([{ name: "t.pot", data: 'msgid ""\nmsgstr ""\n\nmsgid "Start"\nmsgstr ""\n' }]);
  assert.deepEqual(rowsOf(tables[0]!), [["Start", 4, "Start", ""]]);
  assert.equal(tables[0]!.sourceLang, "en");
  assert.match(notes.join("\n"), /no translations yet/);
  assert.throws(() => parseTable('msgid "a"\nmsgstr "b\n', "bad.po"), /bad\.po:2: malformed PO string/);
  assert.throws(() => parseTable('msgid "a"\nfoo\n', "bad.po"), /bad\.po:2: unexpected line/);
  assert.throws(() => parseTable('msgid ""\nmsgstr "Language: ja\\n"\n', "h.po"), /h\.po: no PO entries/);
});

// ---------- i18n JSON ----------

test("i18n JSON: nested keys flattened with dots, line where each key appears, arrays, locale wrapper", () => {
  const ja = `{
  "menu": {
    "start": "開始",
    "items": ["剣",
      "盾"]
  },
  "count": 3,
  "title": "灰の書庫"
}`;
  const t = parseTable(ja, "ja.json");
  assert.equal(t.format, "i18n-json");
  assert.equal(t.singleLang, "ja");
  assert.deepEqual(rowsOf(t), [
    ["menu.start", 3, "開始", ""],
    ["menu.items.0", 4, "剣", ""],
    ["menu.items.1", 5, "盾", ""],
    ["title", 8, "灰の書庫", ""],
  ]);
  const wrapped = parseTable('{\n  "en": {\n    "menu": { "start": "Start" }\n  }\n}', "messages.json");
  assert.equal(wrapped.singleLang, "en");
  assert.deepEqual(rowsOf(wrapped), [["menu.start", 3, "Start", ""]]);
});

test("i18n JSON vs bilingual keyed map: mixed languages stay bilingual, single-language ja/en keys are a locale file", () => {
  const bi = parseTable('{\n  "a": {"ja": "猫", "en": "Cat"}\n}', "m.json");
  assert.equal(bi.format, "json");
  assert.equal(bi.singleLang, undefined);
  const untranslated = parseTable('{"a": {"en": "Cat", "ja": ""}}', "m.json");
  assert.equal(untranslated.format, "json");
  const langNames = parseTable('{"lang": {"ja": "Japanese", "en": "English"}}', "en.json");
  assert.equal(langNames.format, "i18n-json");
  assert.deepEqual(rowsOf(langNames), [["lang.ja", 1, "Japanese", ""], ["lang.en", 1, "English", ""]]);
  assert.throws(() => parseTable('{"a": 1}', "x.json"), /x\.json: (no string records|could not|Could not|expected)/);
  assert.throws(() => parseTable('{"a": "x",}', "x.json"), /x\.json: JSON parse error at line 1/);
});

test("loadInputs: ja.json + en.json paired by key; missing keys stay visible; line is the ja line", () => {
  const { tables, notes } = loadInputs([sample("locales/ja.json"), sample("locales/en.json")]);
  assert.equal(tables.length, 1);
  const t = tables[0]!;
  assert.equal(t.file, "locales/ja.json+en.json");
  assert.equal(t.format, "i18n-json");
  assert.deepEqual([t.sourceLang, t.targetLang, t.singleLang], ["ja", "en", undefined]);
  const ja = read("samples/formats/locales/ja.json");
  const en = read("samples/formats/locales/en.json");
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["faction.order_desc"]!.line, lineOf(ja, '"order_desc"'));
  assert.equal(byId["faction.order_desc"]!.target, "The Dawn Knights guard the Rune Gate.");
  assert.deepEqual([byId["menu.options"]!.source, byId["menu.options"]!.target], ["設定", ""]);
  assert.deepEqual([byId["debug.fps"]!.source, byId["debug.fps"]!.target, byId["debug.fps"]!.line], ["", "FPS counter", lineOf(en, '"fps"')]);
  assert.match(byId["debug.fps"]!.context!, /only in locales\/en\.json:/);
  assert.match(notes.join("\n"), /Paired locales\/ja\.json \(ja, 9 keys\) with locales\/en\.json \(en, 9 keys\) by key \(matching names\).*1 missing in locales\/en\.json: menu\.options; 1 only in locales\/en\.json: debug\.fps/);
  const r = runChecks(tables, parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json"));
  assert.ok(r.findings.some((f) => f.rule === "term.forbidden" && f.found === "Dawn Knights" && f.file === t.file && f.line === lineOf(ja, '"order_desc"')));
});

// ---------- Unity / Unreal CSV ----------

test("Unity Localization CSV: Key is the id, Shared Comments is context, locale headers resolve", () => {
  const t = parseTable(read("samples/formats/unity_table.csv"), "unity_table.csv");
  assert.equal(t.format, "unity-csv");
  assert.deepEqual([t.sourceLang, t.targetLang], ["ja", "en"]);
  assert.deepEqual([t.rows[0]!.id, t.rows[0]!.line, t.rows[0]!.context, t.rows[0]!.target], ["TITLE_ARCHIVE", 2, "Location name", "Ashen Archive"]);
  for (const [ja, en] of [["Japanese (ja)", "English (en)"], ["Japanese (Japan)(ja-JP)", "English (United States)(en-US)"], ["ja", "en"], ["Japanese", "English"]]) {
    const csv = `Key,Id,Shared Comments,"${ja}","${en}"\nK1,7,note,猫,Cat\n`;
    const u = parseTable(csv, "t.csv");
    assert.deepEqual([u.rows[0]!.id, u.rows[0]!.source, u.rows[0]!.target, u.rows[0]!.context], ["K1", "猫", "Cat", "note"], `${ja}/${en}`);
  }
  // Locale columns carry no direction: the left one is the source, like plain "en,ja" CSVs.
  const enFirst = parseTable("Key,Id,Shared Comments,English(en),Japanese(ja)\nK1,1,,Cat,猫\n", "t.csv");
  assert.deepEqual([enFirst.sourceLang, enFirst.rows[0]!.source], ["en", "Cat"]);
});

test("Unreal string tables: single-language Key,SourceString,Comment; paired ja ↔ en by Key; escapes; speaker from comment", () => {
  const ja = parseTable(read("samples/formats/unreal/ST_Dialogue_ja.csv"), "ST_Dialogue_ja.csv");
  assert.deepEqual([ja.format, ja.singleLang], ["unreal-csv", "ja"]);
  assert.equal(ja.rows.find((r) => r.id === "DLG_005")!.source, "焦らずに。\nゆっくりと。");
  const { tables, notes } = loadInputs([sample("unreal/ST_Dialogue_en.csv"), sample("unreal/ST_Dialogue_ja.csv")]);
  assert.equal(tables.length, 1);
  const t = tables[0]!;
  assert.equal(t.file, "unreal/ST_Dialogue_ja.csv+ST_Dialogue_en.csv");
  const d2 = t.rows.find((r) => r.id === "DLG_002")!;
  assert.deepEqual([d2.line, d2.speaker, d2.target], [3, "Mina", "Lisette-sama, is this Mana Stone genuine?"]);
  assert.equal(t.rows.find((r) => r.id === "DLG_005")!.target, "");
  assert.match(notes.join("\n"), /1 missing in unreal\/ST_Dialogue_en\.csv: DLG_005/);
});

// ---------- loadInputs ----------

test("loadInputs: pairs by base name when several candidates exist; leftovers are noted and still checked", () => {
  const files: InputFile[] = [
    { name: "locales/ja/ui.json", data: '{"start": "開始"}' },
    { name: "locales/en/menu.json", data: '{"quit": "Quit"}' },
    { name: "locales/en/ui.json", data: '{"start": "Start"}' },
    { name: "locales/ja/menu.json", data: '{"quit": "終了"}' },
    { name: "text_ja.csv", data: "key,ja\nk1,魔導石\n" },
    { name: "text_en.csv", data: "key,en\nk1,Mana Stone\n" },
    { name: "extra_ja.csv", data: "key,text\nx1,余り\n" },
  ];
  const { tables, notes } = loadInputs(files);
  assert.deepEqual(
    tables.map((t) => [t.file, t.rows.map((r) => `${r.id}=${r.source}|${r.target}`).join(",")]),
    [
      ["locales/ja/ui.json+en/ui.json", "start=開始|Start"],
      ["locales/ja/menu.json+en/menu.json", "quit=終了|Quit"],
      ["text_ja.csv+text_en.csv", "k1=魔導石|Mana Stone"],
      ["extra_ja.csv", "x1=余り|"],
    ],
  );
  assert.equal(tables[3]!.singleLang, "ja");
  assert.match(notes.join("\n"), /extra_ja\.csv: single-language \(ja\), no en counterpart; checked alone/);
});

test("loadInputs: two single-language files with unrelated names are paired as the only pair; langs.source flips the direction", () => {
  const files: InputFile[] = [
    { name: "strings_main.json", data: '{"a": "Hello"}' },
    { name: "honyaku.json", data: '{"a": "こんにちは"}' },
  ];
  const r = loadInputs(files);
  assert.equal(r.tables[0]!.file, "honyaku.json+strings_main.json");
  assert.match(r.notes[0]!, /the only two single-language files/);
  const flipped = loadInputs(files, { langs: { source: "en" } }).tables[0]!;
  assert.deepEqual([flipped.file, flipped.sourceLang, flipped.rows[0]!.source, flipped.rows[0]!.target], ["strings_main.json+honyaku.json", "en", "Hello", "こんにちは"]);
});

test("loadInputs: decodes UTF-8 (BOM) and UTF-16 bytes, honours per-file format, errors name the file, onError skips", () => {
  const csv = "key,ja,en\nk1,猫,Cat\n";
  const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(csv)]);
  const le = new Uint8Array(2 + csv.length * 2);
  le[0] = 0xff;
  le[1] = 0xfe;
  for (let i = 0; i < csv.length; i++) {
    le[2 + i * 2] = csv.charCodeAt(i) & 0xff;
    le[3 + i * 2] = csv.charCodeAt(i) >> 8;
  }
  const { tables } = loadInputs([
    { name: "a.csv", data: utf8 },
    { name: "b.csv", data: le },
    { name: "pasted", data: csv.replace(/,/g, "\t"), format: "tsv" },
  ]);
  assert.deepEqual(tables.map((t) => [t.file, t.rows[0]!.id, t.rows[0]!.source, t.rows[0]!.target, t.rows[0]!.line]), [
    ["a.csv", "k1", "猫", "Cat", 2],
    ["b.csv", "k1", "猫", "Cat", 2],
    ["pasted", "k1", "猫", "Cat", 2],
  ]);
  assert.throws(() => loadInputs([{ name: "x/broken.csv", data: 'id,ja,en\n1,"oops\n' }]), /^Error: x\/broken\.csv: Unterminated quoted field/);
  assert.throws(() => loadInputs([{ name: "bad.csv", data: new Uint8Array([0x61, 0xff, 0xfe, 0xfd, 0x80]) }]), /bad\.csv: not valid UTF-8|bad\.csv:/);
  const errs: string[] = [];
  const ok = loadInputs([{ name: "foo.csv", data: "foo,bar\n1,2\n" }, { name: "good.csv", data: csv }], { onError: (f, e) => errs.push(`${f} ${e.message}`) });
  assert.deepEqual(ok.tables.map((t) => t.file), ["good.csv"]);
  assert.match(errs[0]!, /^foo\.csv foo\.csv: Could not find source\/target columns/);
});

test("column errors keep the header list short (binary or non-tabular input)", () => {
  const header = Array.from({ length: 400 }, (_, i) => `col${i}`).join(",");
  const errs: string[] = [];
  loadInputs([{ name: "wide.csv", data: `${header}\n${header}\n` }], { onError: (_f, e) => errs.push(e.message) });
  assert.equal(errs.length, 1);
  assert.match(errs[0]!, /Could not find source\/target columns in \[col0, col1, [^\]]*… \(400 columns\)\]/);
  assert.ok(errs[0]!.length < 400, errs[0]);
});

test("loadInputs: every sample under samples/formats loads and the deliberate drifts fire", () => {
  const names = ["book.xlsx", "ui.po", "locales/ja.json", "locales/en.json", "unity_table.csv", "unreal/ST_Dialogue_ja.csv", "unreal/ST_Dialogue_en.csv"];
  const { tables } = loadInputs(names.map(sample));
  assert.deepEqual(tables.map((t) => t.file), ["book.xlsx#Script", "ui.po", "locales/ja.json+en.json", "unity_table.csv", "unreal/ST_Dialogue_ja.csv+ST_Dialogue_en.csv"]);
  const r = runChecks(tables, parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json"));
  const has = (rule: string, file: string) => r.findings.some((f) => f.rule === rule && f.file === file);
  assert.ok(has("term.forbidden", "book.xlsx#Script"));
  assert.ok(has("placeholder.mismatch", "book.xlsx#Script"));
  assert.ok(has("voice.first-person", "book.xlsx#Script"));
  assert.ok(has("term.forbidden", "ui.po"));
  assert.ok(has("name.forbidden", "ui.po"));
  assert.ok(has("term.forbidden", "unity_table.csv"));
  assert.ok(has("term.missing", "unity_table.csv"));
  assert.ok(has("honorific.policy", "unreal/ST_Dialogue_ja.csv+ST_Dialogue_en.csv"));
  assert.ok(has("placeholder.mismatch", "locales/ja.json+en.json"));
});
