import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DIGEST } from "../lib/lawdigest";
import { LAWBOOK_LAWS } from "../lib/lawbook-list";
import { lawbookAppendix, lawbookArticle, lawbookIndex, searchLawbook } from "../lib/lawbook";

const norm = (s: string) => s.replace(/[\s　]/g, "");

test("同梱の法令集：全法令がそろっている", () => {
  const idx = lawbookIndex();
  assert.equal(idx.length, LAWBOOK_LAWS.length);
  for (const e of idx) assert.ok(e.articles > 0, e.title);
});

test("法令集の要点：各項目の語句が現行条文にそのまま含まれる", () => {
  const missing: string[] = [];
  for (const d of DIGEST) {
    const law = LAWBOOK_LAWS.find((l) => l.short === d.law);
    assert.ok(law, `unknown law ${d.law}`);
    const text = d.ref.startsWith("別表") ? lawbookAppendix(law.id, d.ref)?.text : lawbookArticle(law.id, d.ref)?.text;
    if (!text || !norm(text).includes(norm(d.quote))) missing.push(`${d.law}${d.ref}：${d.quote}`);
  }
  assert.deepEqual(missing, []);
});

test("法令集の全文検索：語をすべて含む条を返す", () => {
  const hits = searchLawbook("延焼のおそれのある部分 防火構造", { scope: ["令"] });
  assert.ok(hits.some((h) => h.ref.includes("第百三十六条の二")), JSON.stringify(hits.map((h) => h.ref)));
});
