import { test } from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { parseGlossary, parseTable, type Row, type Table } from "../src/core/index.js";
import { draftGlossary } from "../src/core/draft.js";
import { read } from "./helpers.js";

const tables = (...files: string[]) => files.map((f) => parseTable(read(f), basename(f)));
const jaEn = tables("samples/ja-en/script.csv", "samples/ja-en/ch2.json");
const sampleGlossary = parseGlossary(read("samples/ja-en/glossary.json"));

test("draft: JA→EN sample terms, with drift visible in renderings", () => {
  const d = draftGlossary(jaEn);
  const entry = (s: string) => d.entries.find((e) => e.source === s);
  const mana = entry("魔導石")!;
  assert.equal(mana.target, "Mana Stone");
  assert.equal(mana.renderings["Magic Stone"], 2);
  assert.ok(mana.renderings["Mana Stone"]! >= 5);
  assert.equal(entry("星詠み")?.target, "Stargazer");
  assert.equal(entry("ルーンゲート")?.target, "Rune Gate");
  assert.equal(entry("ルーンゲート")?.rows, 3, "ルーン・ゲート folds into ルーンゲート");
  assert.equal(entry("灰の書庫")?.target, "Ashen Archive");
  assert.equal(entry("書庫"), undefined, "substring with the same rows is dropped");
  assert.ok(d.notes.some((n) => n.includes("Magic Stone")));
  assert.deepEqual(d.glossary.terms.find((t) => t.source === "魔導石")?.forbidden, undefined);
  const rows = d.entries.map((e) => e.rows);
  assert.deepEqual(rows, [...rows].sort((a, b) => b - a));
});

test("draft: characters from speaker labels, system labels and names kept out of terms", () => {
  const d = draftGlossary(jaEn);
  const chars = Object.fromEntries(d.glossary.characters.map((c) => [c.ja, c]));
  assert.equal(chars["リゼット"]?.en, "Lisette");
  assert.equal(chars["リゼット"]?.id, "lisette");
  assert.equal(chars["トビアス"]?.en, "Tobias");
  assert.equal(chars["システム"], undefined);
  assert.ok(!d.entries.some((e) => e.source === "リゼット" || e.source === "トビアス"));
});

test("draft: existing glossary entries are excluded", () => {
  const d = draftGlossary(jaEn, sampleGlossary);
  const sources = d.entries.map((e) => e.source);
  for (const s of ["魔導石", "星詠み", "ルーンゲート", "灰の書庫", "暁の騎士団", "リゼット", "トビアス"]) assert.ok(!sources.includes(s), s);
  assert.equal(d.glossary.characters.length, 0);
});

test("draft: EN→JA XLIFF yields Mana Stone → 魔導石 or reports the split", () => {
  const d = draftGlossary(tables("samples/en-ja/ui.xlf"));
  const mana = d.entries.find((e) => e.source === "Mana Stone")!;
  assert.ok(mana);
  assert.ok(mana.target === "魔導石" || (mana.renderings["魔導石"] && d.notes.some((n) => n.startsWith("Mana Stone"))));
});

test("draft: glossary output is valid glossary JSON", () => {
  const d = draftGlossary(jaEn);
  const g = parseGlossary(JSON.stringify(d.glossary));
  assert.equal(g.terms.length, d.glossary.terms.length);
  assert.equal(g.characters.length, d.glossary.characters.length);
  assert.ok(g.terms.length >= 4);
});

test("draft: 20k rows in under 3 s", () => {
  let seed = 7;
  const rnd = (n: number) => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) % n;
  };
  const kana = [..."アイウカキクサシスタチツナニヌハヒフマミムラリルロ"];
  const kanji = [..."火水風土光闇剣盾城塔森海山空星月竜王騎士魔法石書"];
  const latin = ["ka", "ri", "do", "mo", "sa", "ne", "lu", "vo", "ta", "zi"];
  const byJa = new Map<string, string>();
  while (byJa.size < 300) {
    const ja = byJa.size % 2
      ? Array.from({ length: 4 }, () => kana[rnd(kana.length)]).join("")
      : Array.from({ length: 3 }, () => kanji[rnd(kanji.length)]).join("");
    const w = () => latin[rnd(10)]! + latin[rnd(10)]! + latin[rnd(10)]!;
    if (!byJa.has(ja)) byJa.set(ja, `${w()} ${w()}`.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
  }
  const terms = [...byJa].map(([ja, en]) => ({ ja, en }));
  const rows: Row[] = Array.from({ length: 20_000 }, (_, i) => {
    const a = terms[rnd(terms.length)]!;
    const b = terms[rnd(terms.length)]!;
    return {
      file: "big.csv", line: i + 2, id: `r${i}`, speaker: `話者${i % 40}`,
      source: `${a.ja}は${b.ja}の近くにあると聞いた。急がなければ。`,
      target: `I heard the ${a.en} is near the ${b.en}. We must hurry.`,
    };
  });
  const big: Table = { file: "big.csv", format: "csv", sourceLang: "ja", targetLang: "en", rows };
  const t0 = performance.now();
  const d = draftGlossary([big]);
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
  assert.equal(d.entries.length, 100);
  const right = d.entries.filter((e) => e.target && byJa.get(e.source)?.toLowerCase() === e.target.toLowerCase()).length;
  assert.ok(right >= 80, `${right}/100 aligned correctly`);
});

test("everyday words do not crowd out real terms; single-kanji and okurigana terms are found", () => {
  const common = ["自分", "本当", "大丈夫", "一緒", "時間", "仲間"];
  const enWords = ["myself", "really", "fine", "together", "time", "friends"];
  const verbsJa = ["見た", "言った", "待った", "走った", "笑った", "泣いた", "考えた"];
  const verbsEn = ["saw", "said", "waited", "ran", "laughed", "cried", "thought"];
  const lines: string[] = ["id,speaker,ja,en"];
  let n = 0;
  const add = (ja: string, en: string) => lines.push(`l${++n},A,${ja},"${en}"`);
  // Everyday words in many rows.
  for (let i = 0; i < 60; i++) add(`${common[i % 6]}は${verbsJa[i % 7]}。`, `I ${verbsEn[i % 7]} it, ${enWords[i % 6]}.`);
  // Real terms in fewer rows, in varied sentences.
  ["動く", "止まる", "燃える", "壊れた"].forEach((v, i) => add(`魔導炉が${v}。`, [`The Mana Reactor hums.`, `Stop the Mana Reactor!`, `Is the Mana Reactor burning?`, `Our Mana Reactor broke.`][i]!));
  ["抜け", "研げ", "捨てるな", "拾った"].forEach((v, i) => add(`剣を${v}。`, [`Draw your Sword.`, `Sharpen the Sword!`, `Never drop that Sword.`, `I found a Sword.`][i]!));
  ["捧げよ", "聞け", "忘れるな"].forEach((v, i) => add(`祈りを${v}。`, [`Offer a Prayer.`, `Hear my Prayer!`, `Never forget the Prayer.`][i]!));
  ["行く", "登る", "見える"].forEach((v, i) => add(`星詠みの塔へ${v}。`, [`We go to the Stargazer Tower.`, `Climb the Stargazer Tower!`, `I see the Stargazer Tower.`][i]!));
  const t = parseTable(lines.join("\n") + "\n", "common.csv");
  const draft = draftGlossary([t], undefined, { maxTerms: 6 });
  const got = Object.fromEntries(draft.glossary.terms.map((x) => [x.source, x.target]));
  assert.equal(got["魔導炉"], "Mana Reactor");
  assert.equal(got["剣"], "Sword");
  assert.equal(got["祈り"], "Prayer");
  assert.equal(got["星詠みの塔"], "Stargazer Tower");
  assert.ok(!draft.entries.some((e) => common.includes(e.source)), "everyday words are excluded");
});

test("single kanji inside ordinary words is not proposed; custom stopwords apply", () => {
  const t = parseTable(
    "id,ja,en\n1,剣士が来た。,The swordsman came.\n2,剣を取れ。,Take the blade.\n3,剣が光る。,The Sword shines.\n4,魔導炉だ。,A Mana Reactor.\n5,魔導炉か。,The Mana Reactor?\n",
    "s.csv",
  );
  const draft = draftGlossary([t]);
  assert.ok(!draft.glossary.terms.some((x) => x.source === "剣"), "inconsistent single kanji gets no target");
  const custom = draftGlossary([t], { terms: [], characters: [], ignoreWords: ["魔導炉"] });
  assert.ok(!custom.entries.some((e) => e.source === "魔導炉"));
  assert.ok(!draftGlossary([t], undefined, { stopwords: ["魔導炉"] }).entries.some((e) => e.source === "魔導炉"));
});
