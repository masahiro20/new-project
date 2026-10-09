// Ren'Py text tags, interpolation and escapes in the rule checks (placeholders, tags, ruby, length, visible text),
// and that generic {0} / {name} / {{name}} placeholders of other formats keep working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, runChecks, type Finding, type Table } from "../src/core/index.js";
import { isRenpyText, PLACEHOLDER, placeholderText, visibleText } from "../src/core/text.js";

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** A Ren'Py strings block: one row per [original, translation]. Japanese originals → ja→en. */
function renpy(pairs: [string, string][], lang = "english"): Table {
  const body = pairs.map(([o, n]) => `    old ${q(o)}\n    new ${q(n)}\n`).join("\n");
  return parseTable(`translate ${lang} strings:\n\n${body}`, `game/tl/${lang}/t.rpy`, { format: "renpy" });
}

function csv(rows: [string, string][]): Table {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return parseTable(["id,ja,en", ...rows.map(([j, e], i) => `r${i + 1},${esc(j)},${esc(e)}`)].join("\n"), "t.csv");
}

const rules = (t: Table, maxLength?: number) => {
  if (maxLength) for (const r of t.rows) r.maxLength = maxLength;
  return runChecks([t]).findings.filter((f) => ["placeholder", "tag", "ruby", "length"].includes(f.category));
};
const brief = (fs: Finding[]) => fs.map((f) => `${f.rule}@${f.side}: ${f.message}`);
const ruleNames = (fs: Finding[]) => fs.map((f) => f.rule);

test("Ren'Py emphasis {b} {i} {u} {plain}: kept → clean; dropped in a Japanese target → info; dropped in English → tag.mismatch", () => {
  assert.deepEqual(brief(rules(renpy([["{b}書庫番{/b}です。", "I'm the {b}archive keeper{/b}."], ["{i}静かに{/i}", "{i}Quiet{/i}"]]))), []);
  // ja→en: a dropped {b} is a tag mismatch (the same rule as <b> in HTML).
  assert.deepEqual(ruleNames(rules(renpy([["{b}書庫番{/b}です。", "I'm the archive keeper."]]))), ["tag.mismatch"]);
  assert.match(rules(renpy([["{b}書庫番{/b}です。", "I'm the archive keeper."]]))[0]!.message, /\{b\}.*\{\/b\}/);
  // en→ja: emphasis Japanese typography drops → info, like <i>.
  const enja = renpy([["It's {i}{u}really{/u}{/i} {plain}late{/plain}.", "本当に遅い。"]], "japanese");
  assert.equal(enja.targetLang, "ja");
  assert.deepEqual(rules(enja).map((f) => [f.rule, f.severity]), [["tag.emphasis-dropped", "info"]]);
  // {s} (strikethrough) is not emphasis: same as <s>.
  assert.deepEqual(ruleNames(rules(renpy([["It is {s}old{/s} new.", "新しい。"]], "japanese"))), ["tag.mismatch"]);
});

test("Ren'Py tags must balance: a missing or misplaced closer the translation introduced is tag.unbalanced", () => {
  assert.deepEqual(ruleNames(rules(renpy([["{b}注意{/b}", "{b}Caution"]]))), ["tag.mismatch", "tag.unbalanced"]);
  assert.deepEqual(ruleNames(rules(renpy([["{b}{i}注意{/i}{/b}", "{b}{i}Caution{/b}{/i}"]]))), ["tag.unbalanced"]);
  // An imbalance already in the source (a tag spanning strings) is not reported.
  assert.deepEqual(ruleNames(rules(renpy([["{b}続く", "{b}To be continued"]]))), []);
});

test("Ren'Py value tags {color=…} {size=…} {a=…} {font=…} {cps=…} {k=…}: compared by name; missing → tag.mismatch; stripped from visible text", () => {
  const ok = renpy([["{color=#f00}危険{/color}な{size=+10}罠{/size}", "A {size=+10}trap{/size} that's {color=#f00}dangerous{/color}"]]);
  assert.deepEqual(brief(rules(ok)), []);
  // Another value is the translator's choice (like attributes on HTML tags).
  assert.deepEqual(brief(rules(renpy([["{size=+10}罠{/size}", "{size=+6}Trap{/size}"]]))), []);
  const dropped = rules(renpy([["{a=https://example.com}公式サイト{/a}と{font=k.ttf}{cps=20}{k=-.5}文字{/k}{/cps}{/font}", "the official site and text"]]));
  assert.deepEqual(ruleNames(dropped), ["tag.mismatch"]);
  assert.match(dropped[0]!.message, /\{a\}.*\{\/a\}.*\{font\}.*\{cps\}.*\{k\}/);
  assert.equal(visibleText("{color=#f00}Danger{/color} {a=jump:x}here{/a} {size=+10}{font=a.ttf}big{/font}{/size}"), "Danger here big");
  assert.equal(visibleText("{image=heart.png}{alpha=0.5}{outlinecolor=#000}x{/outlinecolor}{/alpha}{vspace=10}{space=20}"), "x");
  // Length limits count visible text only.
  const len = renpy([["{color=#f00}危険{/color}", "{color=#ff0000}Danger{/color}"]]);
  assert.deepEqual(ruleNames(rules(len, 6)), []);
});

test("Ren'Py pacing tags {w} {w=0.5} {p} {nw} {fast}: not compared, not placeholders, stripped from visible text", () => {
  const t = renpy([
    ["待って{w}…{w=0.5}本当に？{p}行こう。{nw}", "Wait… really? Let's go."],
    ["はい。", "{fast}Yes.{w=1.0}"],
  ]);
  assert.deepEqual(brief(rules(t)), []);
  assert.equal(visibleText("Wait{w}… really?{w=0.5}{p}Let's go.{nw}{fast}{done}{clear}"), "Wait… really?Let's go.");
  // Term matching sees the words, not the tags.
  assert.equal(visibleText("Magic{w=0.3} Stone"), "Magic Stone");
});

test("Ren'Py ruby {rb}{/rb}{rt}{/rt}: may be dropped in English; leak if copied into English; reading must be kana; malformed counts", () => {
  assert.deepEqual(brief(rules(renpy([["{rb}魔導石{/rb}{rt}まどうせき{/rt}を見た。", "I saw a Magic Stone."]]))), []);
  const leak = rules(renpy([["{rb}魔導石{/rb}{rt}まどうせき{/rt}", "{rb}Magic Stone{/rb}{rt}madouseki{/rt}"]]));
  assert.deepEqual(leak.map((f) => [f.rule, f.side]), [["ruby.leak", "target"]]);
  const reading = rules(renpy([["{rb}魔導石{/rb}{rt}magic{/rt}を見たことがない。", "I've never seen a Magic Stone."]]));
  assert.deepEqual(reading.map((f) => [f.rule, f.side]), [["ruby.reading", "source"]]);
  assert.match(reading[0]!.message, /magic/);
  assert.match(reading[0]!.message, /魔導石/);
  // {rt} without {rb} (the base is the text before) is valid; an unclosed {rt} is malformed.
  assert.deepEqual(brief(rules(renpy([["魔導石{rt}まどうせき{/rt}", "Magic Stone"]]))), []);
  assert.deepEqual(ruleNames(rules(renpy([["{rb}魔導石{/rb}{rt}まどうせき", "Magic Stone"]]))), ["ruby.malformed"]);
  // en→ja: ruby added by the Japanese translation is fine; the reading is checked on the Japanese side.
  assert.deepEqual(brief(rules(renpy([["A Magic Stone.", "{rb}魔導石{/rb}{rt}まどうせき{/rt}だ。"]], "japanese"))), []);
  // The reading is not visible text (length, terms), the base is.
  assert.equal(visibleText("{rb}魔導石{/rb}{rt}まどうせき{/rt}を見た"), "魔導石を見た");
  // Ren'Py ruby is not a placeholder even in a CSV: the {/rb} closer marks it as Ren'Py text.
  assert.deepEqual(brief(rules(csv([["{rb}魔導石{/rb}{rt}まどうせき{/rt}", "Magic Stone"]]))), []);
});

test("Ren'Py interpolation [name!t] [name!u] [score:.2f] [player.name] [p_name]: placeholders, flags and spec must match", () => {
  const same = renpy([["[name!t]が[score:.2f]点。[player.name]と[p_name]、[title!u]。", "[name!t] scored [score:.2f]. [player.name] and [p_name], [title!u]."]]);
  assert.deepEqual(brief(rules(same)), []);
  const t = renpy([
    ["[name!t]が来た。", "[name] arrived."],
    ["[score:.2f]点", "[score] points"],
    ["[player.name]と[p_name]", "[player.name]"],
  ]);
  const fs = rules(t);
  assert.deepEqual(ruleNames(fs), ["placeholder.mismatch", "placeholder.mismatch", "placeholder.mismatch"]);
  assert.match(fs[0]!.message, /missing \[name!t\].*unexpected \[name\]/);
  assert.match(fs[1]!.message, /\[score:\.2f\]/);
  assert.match(fs[2]!.message, /\[p_name\]/);
  assert.deepEqual(placeholderText("[[name!t] [name!t] [[score:.2f]", true).match(PLACEHOLDER), ["[name!t]"]);
  // Not interpolation: prose and links in brackets.
  assert.deepEqual("[Note: see below] [http://x.y] [warning!] [Note:Important]".match(PLACEHOLDER), null);
});

test("Ren'Py escapes and {#…}: [[ and {{ are literal brackets, {#disambiguator} is invisible and not a placeholder", () => {
  const t = renpy([
    ["戻る{#menu}", "Back"],
    ["[[name]と{{b}を書く", "Write [[name] and {{b}"],
    ["[[p_name]は変数ではない", "[[p_name] is not a variable"],
  ]);
  assert.deepEqual(brief(rules(t)), []);
  // Dropping the escape turns it back into interpolation: reported.
  assert.deepEqual(ruleNames(rules(renpy([["[[p_name]は変数ではない", "[p_name] is not a variable"]]))), ["placeholder.mismatch"]);
  assert.equal(visibleText("Back{#menu}"), "Back");
  assert.equal(visibleText("Write [[p_name] and {{b} or {{0}"), "Write [p_name] and {b} or {0}");
  // {{name}} is an i18next / Mustache placeholder, not an escape.
  assert.deepEqual(placeholderText("Hi {{name}}").match(PLACEHOLDER), ["{name}"]);
  assert.deepEqual(ruleNames(rules(csv([["こんにちは{{name}}", "Hello"]]))), ["placeholder.mismatch"]);
});

test("generic placeholders keep working: {0} {name} {b} outside Ren'Py text stay placeholders; Ren'Py tables treat {b} {w} as tags", () => {
  // CSV / JSON: {0}, {name}, and even {b} / {w} (no Ren'Py closer or value tag in the pair) are placeholders.
  const fs = rules(csv([["{0}の{name}", "{name}"], ["{b}個", "items"], ["{w}幅", "{w} wide"]]));
  assert.deepEqual(brief(fs).map((s) => s.replace(/@.*?: /, ": ")), ["placeholder.mismatch: missing {0}", "placeholder.mismatch: missing {b}"]);
  assert.equal(isRenpyText("{b}個"), false);
  assert.equal(isRenpyText("{b}個{/b}"), true);
  assert.equal(isRenpyText("{color=#f00}x"), true);
  assert.equal(isRenpyText("{b}個", "renpy"), true);
  // A CSV exported from Ren'Py: the {/b} closer makes the pair Ren'Py text, so {b} is a tag, {w} pacing.
  assert.deepEqual(ruleNames(rules(csv([["{b}書庫番{/b}{w}だ", "{b}Keeper{/b}"]]))), []);
  // In a Ren'Py table, {0} / {name} (not tag names) are still placeholders and a bare {w} is pacing.
  assert.deepEqual(ruleNames(rules(renpy([["{0}の{name}{w}", "{name}"]]))), ["placeholder.mismatch"]);
});
