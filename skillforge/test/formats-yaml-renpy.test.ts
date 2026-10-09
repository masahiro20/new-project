// YAML locale files and Ren'Py translation files: parsing, line numbers, errors, pairing, direction, samples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFormat, loadInputs, parseGlossary, parseTable, runChecks, type InputFile, type Table } from "../src/core/index.js";
import { parseYaml, parseYamlDocument } from "../src/core/parsers/yaml.js";
import { parseRenpy, parseStatement, renpyCharacters } from "../src/core/parsers/renpy.js";
import { read } from "./helpers.js";

const sample = (p: string): InputFile => ({ name: p, data: new Uint8Array(readFileSync(new URL(`../samples/formats/${p}`, import.meta.url))) });
const rowsOf = (t: Table) => t.rows.map((r) => [r.id, r.line, r.source, r.target]);
const leaves = (yaml: string) => parseYaml(yaml, "x.yml").table.rows.map((r) => [r.id, r.line, r.source]);

// ---------- YAML ----------

test("YAML: nested keys flattened with dots, line = line of the key, comments and non-text values skipped", () => {
  const y = ["# header", "menu:", "  start: 開始 # comment", "", "  sub:", "    deep: 深い", "count: 3", "flag: true", "none: ~", "empty:", "title: タイトル"].join("\n");
  assert.deepEqual(leaves(y), [
    ["menu.start", 3, "開始"],
    ["menu.sub.deep", 6, "深い"],
    ["title", 11, "タイトル"],
  ]);
});

test("YAML: single language root (ja: / en-US:) is dropped and sets the language; Misskey _lang_ too", () => {
  const rails = parseYaml("ja:\n  hello: Hello there\n", "config/locales/x.yml").table;
  assert.equal(rails.singleLang, "ja"); // root key wins over the (English) text
  assert.deepEqual(rowsOf(rails), [["hello", 2, "Hello there", ""]]);
  assert.equal(parseYaml("en-US:\n  a: あ\n", "f.yml").table.singleLang, "en");
  const misskey = parseYaml('_lang_: "English"\nok: はい\n', "ja-JP.yml").table;
  assert.equal(misskey.singleLang, "en");
  assert.deepEqual(rowsOf(misskey), [["ok", 2, "はい", ""]]);
  // Without hints: the file name, then the text.
  assert.equal(parseYaml("a: Hello\n", "locales/ja/ui.yml").table.singleLang, "ja");
  assert.equal(parseYaml("a: こんにちは\n", "ui.yml").table.singleLang, "ja");
  assert.equal(parseYaml("a: Hello\n", "ui.yml").table.singleLang, "en");
  assert.equal(parseYaml("a: Hello\n", "ui.yml").table.format, "yaml");
});

test("YAML: quoting and escapes", () => {
  const y = [
    `a: "タブ\\t改行\\n\\"引用\\" \\u3042 \\x41 \\\\"`,
    `b: 'it''s # not a comment'`,
    `"quoted key": "x: y"`,
    `c: plain: with colon`,
    `d: "{name}さん"`,
    `e: '%s件'`,
    `f: http://example.com/a#b`,
  ].join("\n");
  assert.deepEqual(leaves(y), [
    ["a", 1, 'タブ\t改行\n"引用" あ A \\'],
    ["b", 2, "it's # not a comment"],
    ["quoted key", 3, "x: y"],
    ["c", 4, "plain: with colon"],
    ["d", 5, "{name}さん"],
    ["e", 6, "%s件"],
    ["f", 7, "http://example.com/a#b"],
  ]);
});

test("YAML: multi-line plain and quoted scalars fold; escaped line break joins", () => {
  const y = ["a: 一行目", "  二行目", "", "  三行目", 'b: "first', "  second\\", "  third", "", '  last"', "c: 'x", "  y'"].join("\n");
  assert.deepEqual(leaves(y), [
    ["a", 1, "一行目 二行目\n三行目"],
    ["b", 5, "first secondthird\nlast"],
    ["c", 10, "x y"],
  ]);
});

test("YAML: block scalars | and > with chomping and an indentation indicator", () => {
  const y = [
    "lit: |",
    "  一行目",
    "    字下げ",
    "  三行目",
    "",
    "strip: |-",
    "  x",
    "",
    "keep: |+",
    "  y",
    "",
    "fold: >",
    "  aa",
    "  bb",
    "",
    "  cc",
    "    more",
    "  dd",
    "ind: |2",
    "    four",
    "end: z",
  ].join("\n");
  assert.deepEqual(leaves(y), [
    ["lit", 1, "一行目\n  字下げ\n三行目\n"],
    ["strip", 6, "x"],
    ["keep", 9, "y\n\n"],
    ["fold", 12, "aa bb\ncc\n  more\ndd\n"],
    ["ind", 19, "  four\n"],
    ["end", 21, "z"],
  ]);
});

test("YAML: sequences → .0 keys (line of the dash), compact maps in lists, lists at the key's indentation, flow collections", () => {
  const y = [
    "items:",
    "  - 一",
    "  - '二'",
    "  - name: 剣",
    "    desc: 鋭い",
    "same:",
    "- あ",
    "- い",
    "flow: [赤, '青', {k: 緑}]",
    "map: {a: 甲, b: [乙, 丙]}",
    "multi: [",
    "  上,",
    "  下 ]",
  ].join("\n");
  assert.deepEqual(leaves(y), [
    ["items.0", 2, "一"],
    ["items.1", 3, "二"],
    ["items.2.name", 4, "剣"],
    ["items.2.desc", 5, "鋭い"],
    ["same.0", 7, "あ"],
    ["same.1", 8, "い"],
    ["flow.0", 9, "赤"],
    ["flow.1", 9, "青"],
    ["flow.2.k", 9, "緑"],
    ["map.a", 10, "甲"],
    ["map.b.0", 10, "乙"],
    ["map.b.1", 10, "丙"],
    ["multi.0", 12, "上"],
    ["multi.1", 13, "下"],
  ]);
});

test("YAML: ---, directives, anchors / aliases / merge keys, tags, duplicate keys (later wins, noted)", () => {
  const y = ["%YAML 1.2", "---", "base: &b", "  ok: OK", "  no: いいえ", "dialog:", "  <<: *b", "  no: キャンセル", "copy: *b", "t: !!str 123", "dup: 1つ目", "dup: 2つ目", "..."].join("\n");
  const r = parseYaml(y, "x.yml");
  assert.deepEqual(
    r.table.rows.map((x) => [x.id, x.line, x.source]),
    [
      ["base.ok", 4, "OK"],
      ["base.no", 5, "いいえ"],
      ["dialog.no", 8, "キャンセル"],
      ["dialog.ok", 4, "OK"],
      ["copy.ok", 4, "OK"],
      ["copy.no", 5, "いいえ"],
      ["t", 10, "123"],
      ["dup", 12, "2つ目"],
    ],
  );
  assert.match(r.notes.join("\n"), /x\.yml: duplicate key "dup" at lines 11 and 12; the later one wins/);
});

test("YAML: unsupported or broken input → clear errors with line numbers", () => {
  const err = (y: string, re: RegExp) => assert.throws(() => parseYaml(y, "bad.yml"), re);
  err("a: 1\n---\nb: 2", /bad\.yml: YAML parse error at line 2: a second YAML document/);
  err("? complex\n: key", /line 1: complex mapping keys/);
  err("a:\n\tb: x", /line 2: tab used for indentation/);
  err('a: "open\nb: c', /line 1: unterminated double-quoted string/);
  err("a: [1, 2\nb: c", /line 1: unterminated flow collection/);
  err("a: x\n  b: y", /line 2: a 'key:' inside a multi-line value/);
  err("a:\n  b: x\n c: y", /line 3: unexpected indentation/);
  err("a: *nope", /line 1: unknown alias \*nope/);
  err('a: "x" y', /line 1: unexpected text after a quoted value/);
  err('a: "\\q"', /line 1: invalid escape '\\q'/);
  err("just text", /line 1: expected 'key: value'|expected a YAML mapping/);
  err("- a\n- b", /expected a YAML mapping of translation keys .*got a list/);
  err("ja:\n  a: あ\nen:\n  a: A", /several locale roots \(ja, en\); split it/);
  err("# only a comment\n", /no string values found|expected a YAML mapping/);
  assert.equal(parseYamlDocument("").root, undefined);
});

test("YAML: detection by extension and by content; parseTable", () => {
  assert.equal(detectFormat("ja-JP.yml", ""), "yaml");
  assert.equal(detectFormat("en.YAML", ""), "yaml");
  assert.equal(detectFormat("pasted", "# c\nja:\n  a: b\n"), "yaml");
  assert.equal(detectFormat("pasted", "---\na: b\n"), "yaml");
  assert.equal(detectFormat("pasted", "id,ja,en\nx,あ,a\n"), "csv");
  assert.equal(detectFormat("pasted", "key: value, other\n"), "csv");
  const t = parseTable("ja:\n  a: あ\n", "x.yml");
  assert.equal(t.singleLang, "ja");
});

test("YAML: ja-JP.yml + en-US.yml paired by key like i18n JSON (sample)", () => {
  const { tables, notes } = loadInputs([sample("yaml/ja-JP.yml"), sample("yaml/en-US.yml")]);
  assert.equal(tables.length, 1);
  const t = tables[0]!;
  assert.equal(t.file, "yaml/ja-JP.yml+en-US.yml");
  assert.equal(t.sourceLang, "ja");
  assert.equal(t.targetLang, "en");
  assert.equal(t.format, "yaml");
  const ja = read("samples/formats/yaml/ja-JP.yml").split("\n");
  const lineOf = (needle: string) => ja.findIndex((l) => l.includes(needle)) + 1;
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["item.mana_stone_desc"]!.line, lineOf("mana_stone_desc:"));
  assert.equal(byId["item.mana_stone_desc"]!.source, "星詠みの力を宿した魔導石。\n灰の書庫で見つかる。\n");
  assert.equal(byId["faction.order_desc"]!.target, "The Dawn Knights guard the Rune Gate.");
  assert.equal(byId["tips.1"]!.line, lineOf("ルーン・ゲートは"));
  assert.equal(byId["menu.options"]!.target, "");
  assert.match(byId["debug.fps"]!.context!, /only in yaml\/en-US\.yml:\d+/);
  assert.ok(!byId["_lang_"]);
  assert.match(notes.join("\n"), /Paired yaml\/ja-JP\.yml \(ja, 13 keys\) with yaml\/en-US\.yml \(en, 13 keys\) by key \(matching names\).*missing in yaml\/en-US\.yml: menu\.options.*only in yaml\/en-US\.yml: debug\.fps/);

  const g = parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json");
  const found = runChecks(tables, g).findings.map((f) => `${f.rule} ${f.id}`).sort();
  assert.deepEqual(found, [
    "notation.katakana tips.1",
    "placeholder.mismatch dialog.save_done",
    "term.forbidden faction.order_desc",
    "term.forbidden item.mana_stone_desc",
    "untranslated.empty menu.options",
  ]);
});

// ---------- Ren'Py ----------

const TL = [
  "# TODO: Translation updated at 2026-10-01 10:00", // 1
  "", // 2
  "# game/script.rpy:10", // 3
  "translate english start_1a2b3c4d:", // 4
  "", // 5
  '    # voice "v/l001.ogg"', // 6
  '    # l "[player]、{b}遅い{/b}わよ。\\n早く来て。"', // 7
  '    voice "v/l001.ogg"', // 8
  '    l "[player], you\'re {b}late{/b}.\\nCome quickly."', // 9
  "", // 10
  "# game/script.rpy:12", // 11
  "translate english start_5e6f7a8b:", // 12
  "", // 13
  '    # "雨が降っていた。"', // 14
  '    "It was raining."', // 15
  "", // 16
  "translate english start_9c0d1e2f:", // 17
  '    # extend "冷たい雨だ。"', // 18
  '    extend " A cold rain."', // 19
  "", // 20
  "translate english start_aa11bb22:", // 21
  "    # nvl clear", // 22
  '    # m happy "\\"本当に？\\""', // 23
  '    # "トビアス" "嘘じゃない。"', // 24
  "    nvl clear", // 25
  '    m happy "\\"Really?\\"" with vpunch', // 26
  '    "Tobias" "It\'s true."', // 27
  "", // 28
  "translate english python:", // 29
  '    define x = Character("X")', // 30
  "", // 31
  "translate english strings:", // 32
  "", // 33
  "    # game/screens.rpy:45", // 34
  '    old "はじめから"', // 35
  '    new "Start"', // 36
  "", // 37
  "    # game/screens.rpy:46", // 38
  "    # game/screens.rpy:90", // 39
  '    old "つづきから"', // 40
  '    new "Load"', // 41
].join("\n");

test("Ren'Py: dialogue blocks — label id, speaker variable, commented original, translation line, context, voice, extend, narration", () => {
  const { table: t, notes } = parseRenpy(TL, "game/tl/english/script.rpy");
  assert.equal(t.format, "renpy");
  assert.equal(t.sourceLang, "ja");
  assert.equal(t.targetLang, "en");
  assert.deepEqual(rowsOf(t), [
    ["start_1a2b3c4d", 9, "[player]、{b}遅い{/b}わよ。\n早く来て。", "[player], you're {b}late{/b}.\nCome quickly."],
    ["start_5e6f7a8b", 15, "雨が降っていた。", "It was raining."],
    ["start_9c0d1e2f", 19, "冷たい雨だ。", " A cold rain."],
    ["start_aa11bb22", 26, '"本当に？"', '"Really?"'],
    ["start_aa11bb22#2", 27, "嘘じゃない。", "It's true."],
    [t.rows[5]!.id, 36, "はじめから", "Start"],
    [t.rows[6]!.id, 41, "つづきから", "Load"],
  ]);
  const [a, narr, ext, m, named, s1, s2] = t.rows;
  assert.equal(a!.speaker, "l");
  assert.equal(a!.context, "game/script.rpy:10 | voice: v/l001.ogg");
  assert.equal(narr!.speaker, undefined);
  assert.equal(narr!.context, "game/script.rpy:12");
  assert.equal(ext!.speaker, undefined); // extend after narration: still the narrator
  assert.equal(ext!.context, "extend");
  assert.equal(m!.speaker, "m");
  assert.equal(named!.speaker, "トビアス");
  assert.match(s1!.id, /^strings:[0-9a-f]{8}$/);
  assert.notEqual(s1!.id, s2!.id);
  assert.equal(s1!.context, "game/screens.rpy:45");
  assert.equal(s2!.context, "game/screens.rpy:46, game/screens.rpy:90");
  assert.match(notes.join("\n"), /1 translate python\/style block\(s\) skipped/);
  // The id of a strings entry depends only on its old text.
  assert.equal(parseRenpy('translate english strings:\n    old "はじめから"\n    new "New Game"\n', "b.rpy").table.rows[0]!.id, s1!.id);
});

test("Ren'Py: extend keeps the previous speaker; mismatched statement counts; untranslated strings; errors", () => {
  const tl = [
    "translate english a1:",
    '    # e "一つ目"',
    '    e "First"',
    "translate english a2:",
    '    # extend "続き"',
    '    extend "more"',
    "translate english a3:",
    '    # e "長い台詞"',
    '    e "A long"',
    '    e "line"',
    "translate english strings:",
    '    old "未訳"',
    '    new ""',
    '    old "最後"',
  ].join("\n");
  const { table: t, notes } = parseRenpy(tl, "x.rpy");
  assert.deepEqual(
    t.rows.map((r) => [r.id, r.line, r.speaker, r.target]),
    [
      ["a1", 3, "e", "First"],
      ["a2", 6, "e", "more"],
      ["a3", 9, "e", "A long\nline"],
      [t.rows[3]!.id, 13, undefined, ""],
      [t.rows[4]!.id, 14, undefined, ""],
    ],
  );
  assert.match(notes.join("\n"), /1 dialogue block\(s\) have a different number of original and translated lines/);
  assert.throws(() => parseRenpy("translate english strings:\n    new \"x\"\n", "y.rpy"), /y\.rpy:2: "new" without a preceding "old"/);
  assert.throws(() => parseRenpy('label start:\n    e "hi"\n', "game/script.rpy"), /no "translate <language> <id>:" blocks found/);
});

test("Ren'Py: statement classification and escapes", () => {
  assert.deepEqual(parseStatement('e "Hi"'), { kind: "say", who: "e", what: "Hi" });
  assert.deepEqual(parseStatement('e happy @ sad "Hi" with dissolve'), { kind: "say", who: "e", what: "Hi" });
  assert.deepEqual(parseStatement('"Narration"'), { kind: "say", what: "Narration" });
  assert.deepEqual(parseStatement("e 'single \\' quote'"), { kind: "say", who: "e", what: "single ' quote" });
  assert.deepEqual(parseStatement('e "a\\\\b \\"c\\" \\n d [name] {i}x{/i}"'), { kind: "say", who: "e", what: 'a\\b "c" \n d [name] {i}x{/i}' });
  assert.deepEqual(parseStatement('voice "v.ogg"'), { kind: "voice", file: "v.ogg" });
  for (const s of ["nvl clear", 'play music "a.ogg"', '$ renpy.notify("x")', 'show eileen happy', "TODO: check this", 'Note: "x" is a pun']) {
    assert.equal(parseStatement(s).kind, "other", s);
  }
  // A string literal may continue on the next line; the line break collapses to one space.
  const t = parseRenpy('translate english m:\n    # e "一行目"\n    e "Line one\n       and two"\n', "m.rpy").table;
  assert.equal(t.rows[0]!.target, "Line one and two");
  assert.equal(t.rows[0]!.line, 3);
});

test("Ren'Py: direction from the original lines; English original → en→ja", () => {
  const tl = 'translate japanese s1:\n    # e "Good morning."\n    e "おはよう。"\n';
  const r = parseRenpy(tl, "game/tl/japanese/script.rpy");
  assert.equal(r.table.sourceLang, "en");
  assert.equal(r.table.targetLang, "ja");
  const odd = parseRenpy('translate english s1:\n    # e "Good morning."\n    e "Good morning!"\n', "o.rpy");
  assert.equal(odd.table.sourceLang, "en");
  assert.match(odd.notes.join("\n"), /translate english blocks, but the original lines read as en/);
});

test("Ren'Py: detection; define Character names; game scripts in loadInputs name the speakers (sample)", () => {
  assert.equal(detectFormat("game/tl/english/script.rpy", ""), "renpy");
  assert.equal(detectFormat("pasted", "# game/script.rpy:1\ntranslate english x_1:\n    # e \"あ\"\n    e \"a\"\n"), "renpy");
  assert.deepEqual(renpyCharacters('define e = Character("アイリーン", color="#fff")\ndefine m = Character(_(\'ミナ\'))\ndefine p = DynamicCharacter("pname")\ndefine n = Character(None, kind=nvl)\n'), { e: "アイリーン", m: "ミナ" });

  const { tables, notes } = loadInputs([sample("renpy/game/script.rpy"), sample("renpy/game/tl/english/script.rpy")]);
  assert.equal(tables.length, 1);
  const t = tables[0]!;
  assert.equal(t.file, "renpy/game/tl/english/script.rpy");
  assert.equal(t.sourceLang, "ja");
  assert.match(notes.join("\n"), /renpy\/game\/script\.rpy: Ren'Py game script \(no translate blocks\); read 3 character name\(s\) for speakers: l=リゼット, m=ミナ, t=トビアス/);
  const tl = read("samples/formats/renpy/game/tl/english/script.rpy").split("\n");
  const lineOf = (needle: string) => tl.findIndex((l) => l.includes(needle)) + 1;
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["start_8b0d4e17"]!.speaker, "リゼット");
  assert.equal(byId["start_8b0d4e17"]!.line, lineOf("archive keeper"));
  assert.equal(byId["start_e2f90b5d"]!.speaker, "トビアス"); // extend
  assert.equal(byId["start_3f1c2a9e"]!.speaker, undefined);

  const g = parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json");
  const found = runChecks(tables, g).findings.map((f) => `${f.rule} ${f.id} ${f.line}`).sort();
  assert.deepEqual(found, [
    `name.forbidden start_8b0d4e17 ${lineOf("Lizette")}`,
    `placeholder.mismatch ${t.rows.find((r) => r.source.startsWith("[player]の日記"))!.id} ${lineOf("Read the diary")}`,
    `term.forbidden start_15aa6c3b ${lineOf("Dawn Knights")}`,
    `term.forbidden start_c47e9a20 ${lineOf("Magic Stone")}`,
    `untranslated.empty ${t.rows.find((r) => r.source === "引き返す")!.id} ${lineOf('new ""')}`,
    `voice.contraction start_8b0d4e17 ${lineOf("Lizette")}`,
  ].sort());

  // Without the game script the speaker stays the variable; a lone game script is skipped with a note.
  assert.equal(loadInputs([sample("renpy/game/tl/english/script.rpy")]).tables[0]!.rows[1]!.speaker, "l");
  const lone = loadInputs([{ name: "game/options.rpy", data: "define config.name = _(\"x\")\n" }]);
  assert.deepEqual(lone.tables, []);
  assert.match(lone.notes.join("\n"), /Skipped 1 Ren'Py file\(s\) without translate blocks or character defines: game\/options\.rpy/);
});
