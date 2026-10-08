// Regression tests for issues found in the internal review (2026-10-08).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, runChecks, type Glossary } from "../src/core/index.js";
import { firstPersonPronouns, politeness } from "../src/core/checks/voice.js";
import { read } from "./helpers.js";
import { parseGlossary } from "../src/core/index.js";

const rules = (r: ReturnType<typeof runChecks>) => r.findings.map((f) => f.rule);
const G = (g: Partial<Glossary>): Glossary => ({ terms: [], characters: [], ...g });

test("en/ja headers follow column order: an EN→JA sheet is read as EN→JA", () => {
  const t = parseTable("id,en,ja\n1,Take the Mana Stone.,マナストーンを取れ。\n", "x.csv");
  assert.equal(t.sourceLang, "en");
  const r = runChecks([t], parseGlossary(read("samples/en-ja/glossary.json")));
  assert.ok(rules(r).includes("term.forbidden"));
});

test("glossary direction mismatch is reported instead of silently skipped", () => {
  const t = parseTable("id,source,target\n1,Take the Mana Stone.,マナストーンを取れ。\n", "x.csv");
  const r = runChecks([t], G({ terms: [{ source: "魔導石", target: "Mana Stone" }] }));
  assert.deepEqual(rules(r).filter((x) => x.startsWith("term")), ["term.direction"]);
});

test("XLIFF 1.2 <bpt>/<ept> native codes are not unbalanced tags", () => {
  const x = `<xliff version="1.2"><file source-language="ja" target-language="en"><body>
<trans-unit id="a"><source><bpt id="1">&lt;b&gt;</bpt>魔導石<ept id="1">&lt;/b&gt;</ept></source>
<target><bpt id="1">&lt;b&gt;</bpt>Mana Stone<ept id="1">&lt;/b&gt;</ept></target></trans-unit></body></file></xliff>`;
  assert.deepEqual(rules(runChecks([parseTable(x, "a.xlf")])), []);
});

test("XLIFF 2.0 multi-segment units keep every segment", () => {
  const x = `<xliff version="2.0" srcLang="ja" trgLang="en"><file id="f"><unit id="u">
<segment><source>こんにちは。</source><target>Hello.</target></segment>
<segment><source>魔導石だ。</source><target>A Magic Stone.</target></segment></unit></file></xliff>`;
  const t = parseTable(x, "b.xlf");
  assert.equal(t.rows[0]!.source, "こんにちは。魔導石だ。");
  const r = runChecks([t], G({ terms: [{ source: "魔導石", target: "Mana Stone", forbidden: ["Magic Stone"] }] }));
  assert.ok(rules(r).includes("term.forbidden"));
});

test("void tags (<br>, TMP <sprite>) and source-side imbalance are not errors", () => {
  const t = parseTable('id,ja,en\n1,あ<br>い,A<br>B\n2,<sprite=1>あ,<sprite=1>A\n3,<b>前半,<b>First half\n', "t.csv");
  assert.deepEqual(rules(runChecks([t])), []);
});

test("unterminated CSV quote is an error with its line", () => {
  assert.throws(() => parseTable('id,ja,en\n1,あ,"Hi there\n2,い,B\n', "q.csv"), /line 2/);
});

test("CSV with bare CR inside a quoted cell counts lines", () => {
  const t = parseTable('id,ja,en\n1,"あ\rい",A\n2,う,B\n', "cr.csv");
  assert.deepEqual(t.rows.map((r) => r.line), [2, 4]);
});

test("term matching across line breaks, NBSP and irregular plurals", () => {
  const t = parseTable('id,ja,en\n1,"魔導石を\n見よ。","Behold the Mana\nStone."\n2,妖精だ,Fairies!\n3,狼の群れ,A pack of wolves.\n4,魔導石,Mana Stone\n', "p.csv");
  const g = G({ terms: [{ source: "魔導石", target: "Mana Stone" }, { source: "妖精", target: "Fairy" }, { source: "狼", target: "Wolf" }] });
  assert.deepEqual(runChecks([t], g).findings.filter((f) => f.category === "term"), []);
});

test("near-miss ignores ordinary words and differing initials", () => {
  const t = parseTable("id,ja,en\n1,雨だ。,Rain is falling. The main gate is open.\n2,門だ。,Main gate. It will rain.\n", "n.csv");
  const r = runChecks([t], G({ characters: [{ id: "kain", ja: "カイン", en: "Kain" }] }));
  assert.ok(!rules(r).includes("name.near-miss"));
});

test("character names are case-sensitive (Will ≠ will)", () => {
  const t = parseTable("id,ja,en\n1,ウィルはどこ？,Where is he? I will find him.\n", "w.csv");
  const r = runChecks([t], G({ characters: [{ id: "will", ja: "ウィル", en: "Will" }] }));
  assert.ok(rules(r).includes("name.missing"));
});

test("pronouns after particles, with 達, and fantasy pronouns", () => {
  assert.deepEqual(firstPersonPronouns("だからぼくは行く"), ["ぼく"]);
  assert.deepEqual(firstPersonPronouns("それでおれが"), ["おれ"]);
  assert.deepEqual(firstPersonPronouns("私達の村"), ["私"]);
  assert.deepEqual(firstPersonPronouns("わらわは女王じゃ"), ["わらわ"]);
  assert.deepEqual(firstPersonPronouns("こわしがいがある"), []);
});

test("名前 column is the speaker; ますます is not polite", () => {
  const t = parseTable("ID,名前,日本語,英語\n1,ミナ,行くよ,Let's go\n", "h.csv");
  assert.equal(t.rows[0]!.speaker, "ミナ");
  assert.equal(politeness("ますます強くなるぞ。"), "plain");
});

test("殿下 is not 殿; title case is normalized for honorific drift", () => {
  const t = parseTable("id,speaker,ja,en\n1,A,エリス殿下、どうぞ。,\"Princess Eris, please.\"\n2,A,エリス殿下！,Princess Eris!\n3,B,リゼット様。,Lady Lisette.\n4,B,リゼット様、はい。,\"Yes, my lady Lisette.\"\n", "d.csv");
  const g = G({ honorificPolicy: "keep", characters: [{ id: "eris", ja: "エリス", en: "Eris" }, { id: "lisette", ja: "リゼット", en: "Lisette" }] });
  const r = runChecks([t], g);
  assert.ok(!r.findings.some((f) => f.found === "Princess Eris"), "殿下 must not expect -dono");
  assert.ok(!rules(r).includes("honorific.drift"));
});

test("plain-profile character speaking politely is a warning", () => {
  const t = parseTable("id,speaker,ja,en\n1,トビアス,行きます。,I'll go.\n", "v.csv");
  const r = runChecks([t], G({ characters: [{ id: "tobias", ja: "トビアス", en: "Tobias", voice: { ja: { politeness: "plain" } } }] }));
  assert.equal(r.findings.find((f) => f.rule === "voice.politeness")?.severity, "warning");
});

test("ruby with attributes and <rp>; printf and Ren'Py placeholders", () => {
  const t = parseTable('id,ja,en\n1,<ruby class="r">漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>字 %.2f [player_name],Kanji %.2f [player_name]\n2,残り%5d,Left\n', "r.csv");
  const r = runChecks([t]);
  assert.deepEqual(rules(r), ["placeholder.mismatch"]);
  assert.equal(r.findings[0]!.id, "2");
});

test("20k rows × 200 terms finishes in reasonable time", () => {
  const terms = Array.from({ length: 200 }, (_, i) => ({ source: `用語${i}号`, target: `Term ${i}` }));
  const body = Array.from({ length: 20_000 }, (_, i) => `${i},用語${i % 200}号を使う,Use Term ${i % 200}.`).join("\n");
  const started = Date.now();
  const r = runChecks([parseTable(`id,ja,en\n${body}\n`, "big.csv")], G({ terms }));
  const ms = Date.now() - started;
  assert.equal(r.findings.filter((f) => f.category === "term").length, 0);
  assert.ok(ms < 8000, `took ${ms}ms`);
  console.log(`perf: 20k rows x 200 terms in ${ms}ms`);
});
