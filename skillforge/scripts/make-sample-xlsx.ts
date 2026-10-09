// Regenerates samples/formats/book.xlsx (invented text). Run: npx tsx scripts/make-sample-xlsx.ts
import { writeFileSync } from "node:fs";
import { makeXlsx } from "../test/xlsx-fixture.js";

const book = makeXlsx([
  {
    name: "Script",
    rows: {
      1: ["ID", "Speaker", "Japanese", "English", "Notes"],
      2: ["b_001", "リゼット", "灰の書庫へようこそ。", "Welcome to the Ashen Archive.", "Opening"],
      3: ["b_002", "ミナ", { rich: ["この", "魔導石", "、光ってます！"] }, "This Mana Stone is glowing!", null],
      4: ["b_003", "トビアス", "魔導石なんてただの石だ。", "Magic Stones are just rocks.", null],
      // row 5 left empty on purpose: line numbers are spreadsheet rows
      6: { A: "b_004", B: "リゼット", C: { inline: "ルーン・ゲートを開きます。" }, D: "I shall open the Rune Gate." },
      7: ["b_005", "ミナ", "ルーンゲートの向こうへ！", "Through the Rune Gate!"],
      8: ["b_006", "リゼット", "{0}個の魔導石が必要です。", "You will need some Mana Stones.", "{0} = count"],
      9: ["b_007", "トビアス", "僕が先に行く。", "I'll go first.", null],
    },
  },
  { name: "Notes", rows: { 1: ["Memo"], 2: ["Invented sample text for Kotomark format tests."] } },
]);
writeFileSync(new URL("../samples/formats/book.xlsx", import.meta.url), book);
console.log(`book.xlsx ${book.length} bytes`);
