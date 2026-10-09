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
  nissa: "±30秒/日の目安が妥当か（機種差）",
  n_hin: "スラングとしての意味・使われ方",
  shutter_naki: "キヤノンA系の例示が適切か",
  gokubihin: "ランクの序列（極美品>超美品>美品>良品>並品）がショップ間で通用するか",
  choubihin: "ランクの序列",
  ryouhin: "ランクの序列",
  namihin: "ランクの序列",
  yellowing: "ヤケ（外装の日焼け）と黄変（レンズ）を同じ語にしてよいか",
  bunkai_ato: "カニ目傷を分解跡に含めてよいか",
  kenma: "新品仕上げを研磨に含めてよいか",
  henpin_fuka: "ノーリターン単体の扱い",
  hood: "「フード」の誤検出（衣類など）。ジャンル絞り込みで足りるか",
  dust: "「チリ」の誤検出（国名）",
  hari: "「針」の誤検出（カメラの露出計の針など）",
  mikakunin: "単体「未確認」を高リスクにしてよいか",
  seido: "「精度」の誤検出",
  manual: "「説明書」の扱い",
  fushoku: "「腐食」を一律で高リスクにしてよいか",
  ss: "「SS」の誤検出（SSランク等）",
  af: "短い英字の誤検出",
  mf: "短い英字の誤検出",
  oh: "「OH」「O/H」の誤検出",
  gp: "短い英字の誤検出",
  gf: "短い英字の誤検出",
  yg: "短い英字の誤検出",
  wg: "短い英字の誤検出",
  pg: "短い英字の誤検出",
  rg: "短い英字の誤検出",
  dekaatsu: "語の採否（必要か）",
  heikou_yunyu: "並行輸入の説明（保証の扱い）",
  shiroto_hokan: "危険度（中）が妥当か",
  kuwashikunai: "危険度（中）が妥当か",
  kabi: "カビ＝高、くもり＝中 の区別が妥当か",
  kumori: "カビ＝高、くもり＝中 の区別が妥当か",
  tomaru: "「止まる」の誤検出",
  homage: "危険度（中）が妥当か",
  // Lens / film camera additions (2026-10-09)
  jissha_mikakunin: "「実写未確認」を中リスクにしてよいか（「未確認」=高 より優先される）",
  lens_contact: "「接点不良」の誤検出（家電など）。説明文は汎用にしてある",
  kousen_more: "「光漏れ」が液晶のバックライト漏れの意味でも出る",
  makimodoshi_fuuryou: "「巻き戻し不良」の誤検出（カセットデッキ等）",
  ten_kizu: "「点傷」の誤検出（家具など）と危険度（低）",
  self_timer_fudou: "「不動」=高 より優先して低にしてよいか",
  atom_lens: "放射性レンズの説明（発送規制の書き方）",
  kandouhin: "「完動品」を安心材料（positive）にしてよいか"
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
