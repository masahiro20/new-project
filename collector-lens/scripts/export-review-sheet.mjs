// Exports data/glossary.json as a CSV review sheet for a camera/watch specialist.
// Output: docs/glossary-review-sheet.csv (UTF-8 with BOM so Excel opens it correctly).
// The "要確認" column marks entries Ren wants a human expert to look at first.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(readFileSync(join(root, "data/glossary.json"), "utf8"));

// Why an entry needs an expert look first (meaning, risk level or false matches).
const NEEDS_CHECK = {
  // 2026-10-09 レビュアー確認で残したもの（理由つき）。解決したものは外した（docs/decisions.md）。
  n_hin: "「N品」単体は偽物スラングのほか、店によっては New（新品）ランクの略として使う可能性。「N級品」は偽物で確実。「N品番」「N品質」は除外済み",
  gokubihin: "極美品と超美品の上下はショップで逆のことがある。「極上美品」を同じ段として追加したのが妥当か",
  choubihin: "極美品との上下関係（店ごとの差）",
  mikakunin: "単体「未確認」を高のままにした。動作系の言い回し（動作は未確認・通電未確認など）は動作未確認へ移したので、残りは「サイズ未確認」のような軽いものも含む。中に下げるか",
  atom_lens: "放射性レンズの発送規制の書き方（国ごとの規則。法務・物流の確認が必要）"
};

function basis(e) {
  if (e.id.startsWith("cond_")) return "メルカリ・ヤフオク・ラクマ共通の「商品の状態」選択肢";
  if (e.category === "rank") return "中古カメラ店・時計店のランク表記の慣行";
  if (e.category === "return") return "出品文・取引条件の定型句";
  if (e.category === "seller") return "個人出品の定型の免責表現";
  return "中古カメラ・時計の出品で一般的な用語";
}

const head = ["id", "日本語表記", "英訳", "英語の解説", "ジャンル", "分類", "危険度", "根拠", "作成", "要確認", "確認してほしい点", "専門家の判定(OK/修正/削除)", "修正案", "コメント"];
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const rows = g.entries.map((e) => [
  e.id, e.ja.join(" / "), e.en, e.explain, e.genre.join(","), e.category, e.risk,
  basis(e), "AI作成・Ren(AI)確認済み", NEEDS_CHECK[e.id] ? "★" : "", NEEDS_CHECK[e.id] || "", "", "", ""
]);
rows.sort((a, b) => (b[9] === "★") - (a[9] === "★"));
const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
writeFileSync(join(root, "docs/glossary-review-sheet.csv"), csv);
const missing = Object.keys(NEEDS_CHECK).filter((id) => !g.entries.some((e) => e.id === id));
if (missing.length) { console.error("unknown ids in NEEDS_CHECK: " + missing.join(", ")); process.exit(1); }
console.log(`wrote docs/glossary-review-sheet.csv (${rows.length} rows, ${Object.keys(NEEDS_CHECK).length} marked 要確認)`);
