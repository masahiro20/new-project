// Deterministic synthetic glossary + script for the B-02 performance regression test and the bench script.
import type { Glossary, Table } from "../src/core/types.js";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const KATA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワガギグゲゴザジズゼゾダデドバビブベボパピプペポ";
const KANJI = "魔法剣盾城森川山海空火水風土光闇王姫騎士竜鬼神殿塔門鍵宝石書巻薬草毒";
const LOWER = "abcdefghijklmnopqrstuvwxyz";

/** `terms` JA→EN glossary terms and `rows` script rows; each row mentions 0–3 terms, half rendered correctly. */
export function stressData(terms: number, rows: number, seed = 1): { glossary: Glossary; tables: Table[] } {
  const r = rng(seed);
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(r() * s.length)]).join("");
  const seen = new Set<string>();
  const g: Glossary = { terms: [], characters: [] };
  while (g.terms.length < terms) {
    const src = r() < 0.5 ? pick(KATA, 3 + Math.floor(r() * 4)) : pick(KANJI, 2 + Math.floor(r() * 3));
    if (seen.has(src)) continue;
    seen.add(src);
    const en = `${pick(LOWER, 4 + Math.floor(r() * 5))}${r() < 0.3 ? ` ${pick(LOWER, 5)}` : ""}`;
    g.terms.push({ source: src, target: en[0]!.toUpperCase() + en.slice(1), ...(r() < 0.1 ? { forbidden: [pick(LOWER, 6)] } : {}) });
  }
  const t: Table = { file: "stress.csv", format: "csv", sourceLang: "ja", targetLang: "en", rows: [] };
  for (let i = 0; i < rows; i++) {
    const used = Array.from({ length: Math.floor(r() * 4) }, () => g.terms[Math.floor(r() * g.terms.length)]!);
    const source = `${used.map((u) => u.source).join("と")}は${pick("あいうえおかきくけこ", 6)}。`;
    const target = `The ${used.map((u) => (r() < 0.5 ? u.target : pick(LOWER, 5))).join(" and ")} is here.`;
    t.rows.push({ file: "stress.csv", line: i + 2, id: `r${i}`, source, target });
  }
  return { glossary: g, tables: [t] };
}
