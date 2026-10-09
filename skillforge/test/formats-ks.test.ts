// KAG / TyranoScript scenario files (.ks): units, labels, speakers, inline tags, skipped blocks, pairing, encodings, sample findings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFormat, loadInputs, parseGlossary, parseTable, runChecks, type InputFile } from "../src/core/index.js";
import { ksBareKey, parseKs, parseKsTag } from "../src/core/parsers/ks.js";
import { pairKey } from "../src/core/parsers/lang.js";
import { PLACEHOLDER, visibleText } from "../src/core/text.js";
import { read } from "./helpers.js";

const sample = (p: string): InputFile => ({ name: p, data: new Uint8Array(readFileSync(new URL(`../samples/formats/${p}`, import.meta.url))) });
const units = (ks: string, file = "first.ks") => parseKs(ks, file).table.rows.map((r) => [r.id, r.line, r.speaker, r.source]);

test("ks: format detected from the extension", () => {
  assert.equal(detectFormat("data/scenario/first.ks", "*start\nこんにちは[p]"), "ks");
  assert.equal(detectFormat("first.KS", new Uint8Array([0x2a, 0x61])), "ks");
});

test("ks: labels, unit numbering per label, line of the first text line, [p] ends a unit, [l] does not", () => {
  const ks = [
    "*start|はじまり", // 1
    "一行目。[l]", // 2
    "同じページ。[p]", // 3
    "", // 4
    "次のページ。[p]", // 5
    "*next", // 6
    "", // 7
    "[bg storage=a.jpg]", // 8
    "ラベルの最初。[p]", // 9
    "最後は[p]なし", // 10
  ].join("\n");
  assert.deepEqual(units(ks), [
    ["start#1", 2, undefined, "一行目。同じページ。"],
    ["start#2", 5, undefined, "次のページ。"],
    ["next#1", 9, undefined, "ラベルの最初。"],
    ["next#2", 10, undefined, "最後は"],
    ["next#3", 10, undefined, "なし"],
  ]);
  assert.equal(parseKs(ks, "first.ks").table.rows[0]!.context, "*start|はじまり");
  // Text before the first label.
  assert.deepEqual(units("前置き[p]"), [["(top)#1", 1, undefined, "前置き"]]);
});

test("ks: speakers from #name (face dropped, # clears), chara_ptext, chara_new display names; a speaker line ends a unit", () => {
  const ks = [
    "[chara_new name=akane jname=あかね storage=a.png]",
    "*s",
    "#akane:happy",
    "おはよう。",
    "#やまと",
    "よう。[p]",
    "#",
    "地の文。[p]",
    "[chara_ptext name=akane]",
    "またね。[p]",
    "@chara_ptext name=Guest",
    "誰？[p]",
  ].join("\n");
  assert.deepEqual(units(ks), [
    ["s#1", 4, "あかね", "おはよう。"],
    ["s#2", 6, "やまと", "よう。"],
    ["s#3", 8, undefined, "地の文。"],
    ["s#4", 10, "あかね", "またね。"],
    ["s#5", 12, "Guest", "誰？"],
  ]);
});

test("ks: [cm]/[er]/[ct] end a unit, @ command lines are tags, [r] is a line break, line ends join (Japanese: nothing, Latin: one space)", () => {
  const ks = ["*s", "一つ目[cm]二つ目[er]", "三つ目", "続き[r]", "改行後[p]", "Hello", "world.[l][r]", "Next line.", "@p", "End[ct]"].join("\n");
  assert.deepEqual(units(ks).map((u) => u[3]), ["一つ目", "二つ目", "三つ目続き\n改行後", "Hello world.\nNext line.", "End"]);
});

test("ks: comments, [iscript] and [macro] blocks, /* */ blocks are skipped (with notes)", () => {
  const ks = [
    "; コメント行",
    "*s",
    "[iscript]",
    "f.text = '台詞ではない[p]';",
    "[endscript]",
    "[macro name=heart]",
    "[graph storage=heart.png]本文ではない[p]",
    "[endmacro]",
    "/*",
    "コメントの中[p]",
    "*/",
    "\t; タブの後のコメント",
    "@iscript",
    "x = 1",
    "@endscript",
    "本文。[p]",
    "[macro name=x][font size=10][endmacro]これは本文。[p]",
  ].join("\n");
  const r = parseKs(ks, "a.ks");
  assert.deepEqual(r.table.rows.map((x) => [x.id, x.line, x.source]), [
    ["s#1", 16, "本文。"],
    ["s#2", 17, "これは本文。"],
  ]);
  assert.ok(r.notes.some((n) => n.includes("2 [iscript] block(s) skipped")), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => n.includes("2 [macro] definition(s) skipped")), r.notes.join("\n"));
});

test("ks: inline tags — ruby → {base|reading}, emb canonical, styling tags kept, pacing dropped, ch text, [[ kept", () => {
  const ks = [
    "*s",
    '[ruby text=かん]漢[ruby text="じ"]字と[emb exp=f.name]と[emb exp="sf.title"]。[wait time=200][delay speed=30]',
    "[font size=40 color=0xff0000]大声[resetfont]で[ch text=！]",
    "[[注]は文字。[ruby text=よみ]",
    "[p]",
  ].join("\n");
  assert.deepEqual(units(ks)[0]![3], '{漢|かん}{字|じ}と[emb exp="f.name"]と[emb exp="sf.title"]。[font size=40 color=0xff0000]大声[resetfont]で！[[注]は文字。{|よみ}');
  assert.deepEqual(parseKsTag(' glink  text="ついて いく" target=*a cond '), { name: "glink", attrs: { text: "ついて いく", target: "*a", cond: "" }, raw: 'glink  text="ついて いく" target=*a cond' });
});

test("ks: [glink]/[ptext] text attributes become units of their own", () => {
  assert.deepEqual(units('*c\n[glink text="ついていく" target=*a]\n[glink text=待つ target=*b]\n[s]'), [
    ["c#1", 2, undefined, "ついていく"],
    ["c#2", 3, undefined, "待つ"],
  ]);
});

test("text.ts: [emb exp=…] is a placeholder and not visible text; KAG styling tags are not visible text", () => {
  assert.deepEqual('こんにちは、[emb exp="f.name"]さん'.match(PLACEHOLDER), ['[emb exp="f.name"]']);
  assert.deepEqual("[emb exp='a[0]'] [emb exp=f.x]".match(PLACEHOLDER), ["[emb exp='a[0]']", "[emb exp=f.x]"]);
  assert.equal(visibleText('[font size=30]魔導石[resetfont]と[emb exp="f.name"]'), "魔導石と");
  // Other formats keep bare bracket words as they were.
  assert.equal(visibleText("[none] [style] [font]"), "[none] [style] [font]");
});

test("ks: language from the path, else from the text; single file → single-language table", () => {
  assert.equal(parseKs("*a\nHello.[p]", "scenario/ja/first.ks").table.singleLang, "ja");
  assert.equal(parseKs("*a\nこんにちは[p]", "first_en.ks").table.singleLang, "en");
  assert.equal(parseKs("*a\nこんにちは[p]", "first.ks").table.singleLang, "ja");
  assert.equal(parseKs("*a\nHello.[p]", "first.ks").table.singleLang, "en");
  const { tables, notes } = loadInputs([{ name: "first.ks", data: "*a\nこんにちは[p]" }]);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]!.format, "ks");
  assert.ok(notes.some((n) => n.includes("single-language (ja)")), notes.join("\n"));
});

test("ks: pairing ja/en files by label + unit index; rows point at the translation, the original's line is kept", () => {
  const ja = "*s\n#あかね\nこんにちは。[p]\n\n地の文。[p]\n";
  const en = "; English\n*s\n#Akane\nHello.[p]\nNarration.[p]\n";
  const { tables, notes } = loadInputs([{ name: "scenario/ja/first.ks", data: ja }, { name: "scenario/en/first.ks", data: en }]);
  assert.equal(tables.length, 1);
  const t = tables[0]!;
  assert.equal(t.file, "scenario/ja/first.ks+en/first.ks");
  assert.deepEqual([t.format, t.sourceLang, t.targetLang], ["ks", "ja", "en"]);
  assert.deepEqual(t.rows.map((r) => [r.file, r.line, r.id, r.speaker, r.source, r.target, r.sourceRef?.line]), [
    ["scenario/en/first.ks", 4, "s#1", "あかね", "こんにちは。", "Hello.", 3],
    ["scenario/en/first.ks", 5, "s#2", "あかね", "地の文。", "Narration.", 5], // the name stays until # clears it
  ]);
  assert.ok(t.rows[0]!.context!.includes("ja: scenario/ja/first.ks:3"));
  assert.ok(notes.some((n) => n.startsWith("Paired scenario/ja/first.ks")), notes.join("\n"));
});

test("ks: first.ks pairs with first_en.ks (an untagged original with its tagged copy)", () => {
  assert.equal(ksBareKey(pairKey("data/scenario/first_en.ks")), "data/scenario/first.ks");
  assert.equal(ksBareKey(pairKey("data/scenario/en/first.ks")), "data/scenario/first.ks");
  const files: InputFile[] = [
    { name: "first.ks", data: "*a\nはじめ[p]" },
    { name: "first_en.ks", data: "*a\nStart[p]" },
    { name: "second.ks", data: "*a\nつぎ[p]" },
    { name: "second_en.ks", data: "*a\nNext[p]" },
  ];
  const { tables } = loadInputs(files);
  assert.deepEqual(tables.map((t) => [t.file, t.rows[0]!.source, t.rows[0]!.target]), [
    ["first.ks+first_en.ks", "はじめ", "Start"],
    ["second.ks+second_en.ks", "つぎ", "Next"],
  ]);
});

test("ks: different unit counts in a label → note, still paired by index; missing units are untranslated, extra are info", () => {
  const ja = "*a\n一。[p]\n二。[p]\n三。[p]\n*b\nB。[p]\n";
  const en = "*a\nOne.[p]\nTwo.[p]\n*b\nB.[p]\nExtra.[p]\n*c\nOnly en.[p]\n";
  const { tables, notes } = loadInputs([{ name: "ja/x.ks", data: ja }, { name: "en/x.ks", data: en }], { pairSource: "ja" });
  const t = tables[0]!;
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["a#3"]!.missing, "target");
  assert.equal(byId["a#3"]!.file, "ja/x.ks"); // nothing to point at in the translation
  assert.equal(byId["a#3"]!.line, 4);
  assert.equal(byId["b#2"]!.missing, "source");
  assert.equal(byId["b#2"]!.file, "en/x.ks");
  assert.ok(notes.some((n) => /2 label\(s\) have a different number of text units.*\*a \(3 \/ 2\), \*b \(1 \/ 2\)/.test(n)), notes.join("\n"));
  assert.ok(notes.some((n) => n.includes("label(s) only in en/x.ks: *c")), notes.join("\n"));
  const rules = runChecks(tables).findings.filter((f) => f.category === "untranslated").map((f) => [f.rule, f.id]);
  assert.deepEqual(rules.sort(), [["untranslated.empty", "a#3"], ["untranslated.extra-key", "b#2"], ["untranslated.extra-key", "c#1"]]);
});

test("ks: Shift_JIS and UTF-16 LE (BOM) files are decoded", () => {
  // "*s\n#あい\nうあ[p]\n" in Shift_JIS: あ 82A0, い 82A2, う 82A4.
  const sjis = new Uint8Array([0x2a, 0x73, 0x0a, 0x23, 0x82, 0xa0, 0x82, 0xa2, 0x0a, 0x82, 0xa4, 0x82, 0xa0, 0x5b, 0x70, 0x5d, 0x0a]);
  const { tables, notes } = loadInputs([{ name: "scenario/sjis.ks", data: sjis }]);
  assert.deepEqual(tables[0]!.rows.map((r) => [r.id, r.speaker, r.source]), [["s#1", "あい", "うあ"]]);
  assert.ok(notes.some((n) => n.includes("Shift_JIS")), notes.join("\n"));
  const text = "*s\n#あかね\nこんにちは[p]\n";
  const u16 = new Uint8Array(2 + text.length * 2);
  u16[0] = 0xff;
  u16[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    u16[2 + i * 2] = text.charCodeAt(i) & 0xff;
    u16[3 + i * 2] = text.charCodeAt(i) >> 8;
  }
  assert.deepEqual(parseTable(u16, "u16.ks").rows.map((r) => [r.speaker, r.source]), [["あかね", "こんにちは"]]);
});

test("ks: tag, placeholder and ruby rules on paired scenarios", () => {
  const ja = ["*s", '[font color=0xff0000]禁書[resetfont]と[emb exp="f.name"]。[p]', "[ruby text=ほし]星を見る。[p]", "[ruby text=]詠む。[p]"].join("\n");
  const en = ["*s", "[font color=0xff0000]Forbidden books and f.name.[p]", "[ruby text=ほし]Star gazing.[p]", "Reading.[p]"].join("\n");
  const { tables } = loadInputs([{ name: "ja/a.ks", data: ja }, { name: "en/a.ks", data: en }]);
  const f = runChecks(tables).findings.map((x) => [x.rule, x.id, x.side, x.file, x.line, x.message]);
  assert.deepEqual(f.filter((x) => x[0] === "placeholder.mismatch").map((x) => x[5]), ['missing [emb exp="f.name"]']);
  assert.deepEqual(f.filter((x) => x[0] === "tag.mismatch").map((x) => x[5]), ["missing [resetfont]"]);
  assert.deepEqual(f.filter((x) => x[0] === "ruby.leak").map((x) => [x[1], x[3]]), [["s#2", "en/a.ks"]]);
  // A source-side finding points at the original file and line.
  assert.deepEqual(f.filter((x) => x[0] === "ruby.malformed").map((x) => [x[1], x[2], x[3], x[4]]), [["s#3", "source", "ja/a.ks", 4]]);
});

test("ks sample: speaker drift, term drift, dropped [emb], dropped [resetfont], broken ruby, missing page", () => {
  const g = parseGlossary(read("samples/ja-en/glossary.json"));
  const { tables, notes } = loadInputs([sample("ks/scenario/ja/first.ks"), sample("ks/scenario/en/first.ks")]);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]!.rows.length, 10);
  assert.ok(notes.some((n) => n.includes("*stacks (4 / 3)")), notes.join("\n"));
  const f = runChecks(tables, g).findings.map((x) => `${x.rule} ${x.file}:${x.line} ${x.side}`);
  assert.deepEqual(f, [
    "term.forbidden ks/scenario/en/first.ks:12 target",
    "name.speaker-label ks/scenario/ja/first.ks:24 source",
    "placeholder.mismatch ks/scenario/en/first.ks:8 target",
    "tag.mismatch ks/scenario/en/first.ks:27 target",
    "ruby.malformed ks/scenario/ja/first.ks:24 source",
    "untranslated.empty ks/scenario/ja/first.ks:31 target",
  ]);
});
