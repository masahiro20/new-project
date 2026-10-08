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
