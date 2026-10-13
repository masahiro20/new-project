// サンプル監査レポート 2本目（Ren'Py の台本形式・英→日）を生成する。1本目は scripts/sample-report.mjs（Battle for Wesnoth）。
//   node scripts/sample-report-renpy.mjs                 → web/sample-report-2/index.html を書き出す（埋め込みデータから）
//   node scripts/sample-report-renpy.mjs --verify <dir>  → 書き出す前に、<dir>/A.json（Kotomark の出力）と
//                                                          <dir>/*.rpy（固定コミットの原本）で件数・各指摘の存在・抜粋の一字一句を確認する
// 公開サイトへは web/build-site.mjs が site/sample-report-2/index.html にコピーする（CSP もそこで付く）。
//
// データの取り直し（/tmp のみに置く。原本はリポジトリに入れない）:
//   SHA=e58fd737ebcbcad20240d80cf821be5a0ffd2dc1; D=/tmp/kotomark-sample/renpy-tutorial; mkdir -p $D
//   for f in common options screens script tutorial_atl tutorial_director tutorial_distribute tutorial_playing tutorial_screens tutorial_video; do
//     curl -sSfL -o $D/$f.rpy https://raw.githubusercontent.com/renpy/renpy/$SHA/tutorial/game/tl/japanese/$f.rpy; done
//   npx tsx src/cli/index.ts check $D/*.rpy --format json --fail-on never --no-glossary > $D/A.json
//   node scripts/sample-report-renpy.mjs --verify $D
//
// 指摘は全11件をすべて掲載する（選別なし）。修正案と一言の説明は AI（Kotomark の社内評価者）が原文・訳文を読んで書いたもので、人の確認ではない。
// 抜粋は各120字以内。「…」は省略を表し、それ以外は原本どおり（--verify で照合する）。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "web/sample-report-2/index.html");

const REPO = "https://github.com/renpy/renpy";
const SHA = "e58fd737ebcbcad20240d80cf821be5a0ffd2dc1";
const DIR = "tutorial/game/tl/japanese/";
const NFILES = 10;
const FILES = {
  common: { path: DIR + "common.rpy", rows: 358, ja: "Ren'Py 共通の画面・メッセージの文字列", en: "Ren'Py common UI and messages" },
  screens: { path: DIR + "tutorial_screens.rpy", rows: 113, ja: "チュートリアル（スクリーン編）の台詞・選択肢", en: "tutorial, screens chapter: dialogue and menu choices" },
};
const ROWS_TOTAL = 776;
const RUN_DATE = "2026-10-13";

// Kotomark の出力（用語集なし・既定設定）の集計。--verify で A.json と照合する。
const TOTALS = { errors: 0, warnings: 10, infos: 1 };
const BY_RULE = [
  { rule: "notation.katakana", error: 0, warning: 9, info: 0 },
  { rule: "untranslated.empty", error: 0, warning: 1, info: 0 },
  { rule: "untranslated.copy", error: 0, warning: 0, info: 1 },
];

const RULES = {
  "untranslated.fuzzy": { ja: "古い訳のまま（fuzzy）", en: "Stale translation (fuzzy)" },
  "untranslated.empty": { ja: "未翻訳（空欄）", en: "Untranslated (empty)" },
  "untranslated.copy": { ja: "原文と同じ訳文", en: "Translation identical to source" },
  "notation.katakana": { ja: "カタカナの表記揺れ", en: "Katakana notation drift" },
  "placeholder.mismatch": { ja: "変数（プレースホルダー）の不一致", en: "Placeholder mismatch" },
  "tag.mismatch": { ja: "タグの不一致", en: "Tag mismatch" },
  "tag.emphasis-dropped": { ja: "強調タグの省略", en: "Emphasis tag dropped" },
  "voice.first-person": { ja: "一人称の揺れ", en: "First-person pronoun drift" },
};
const SEV = {
  error: { ja: "エラー", en: "Error" },
  warning: { ja: "警告", en: "Warning" },
  info: { ja: "参考", en: "Info" },
};


// 掲載する全11件。file/line/rule は Kotomark の指摘そのもの。src/tgt は原本からの抜粋（「…」は省略）。
const ITEMS = [
  {
    file: "common", line: 1198, rule: "notation.katakana", severity: "warning",
    src: "The {a=edit:1:log.txt}log.txt{/a} file may contain information to help you determine what is wrong with your computer.", tgt: "{a=edit:1:log.txt}log.txt{/a} ファイルにある情報は何があなたのコンピュータで問題になっているか探る手助けになるでしょう",
    whatJa: "同じファイルの別の5か所は「コンピューター」（長音あり）です。この行だけ「コンピュータ」です。",
    whatEn: "The other five places in these files write 「コンピューター」 with the long-vowel mark; only this line writes 「コンピュータ」.",
    fix: "コンピュータ → コンピューター（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 96, rule: "notation.katakana", severity: "warning",
    src: "Inside the screen statement, lines introduces displayables such as frame, vbox, text, and textbutton;…", tgt: "screenステートメント内にはframe、vbox、text、textbuttonといったdisplayablesやaction、xalign、yposのようなプロパティを導入する行があります。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 126, rule: "notation.katakana", severity: "warning",
    src: "And that is inside a frame that provides the background and borders.…", tgt: "また、これは背景や境界線を指定されたフレームの中にあります。このフレームは位置を与えるTransformを行うatプロパティを持ちます。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 216, rule: "notation.katakana", severity: "warning",
    src: "There are a few properties that can be applied to a screen itself.", tgt: "スクリーン自身にもいくつか適用されるプロパティがあります。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 222, rule: "notation.katakana", severity: "warning",
    src: "When the modal property is true, you can't interact with things beneath the screen.…", tgt: "modalプロパティがtrueのとき、このスクリーンの下にあるものには触れることができません。続けるには「このスクリーンを閉じる」をクリックしてください。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 228, rule: "notation.katakana", severity: "warning",
    src: "When a screen has the tag property, it's treated like the tag part of an image name. Here, I'm showing a_tag_screen.", tgt: "スクリーンがtagプロパティを持っていると、画像名のタグの部分のように扱われます。今、私はa_tag_screenを表示しています。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 252, rule: "notation.katakana", severity: "warning",
    src: "The zorder property controls the order in which screens overlap each other.…", tgt: "zorderプロパティは互いに重なるスクリーンの順序を制御します。zorderの数字が大きいほどプレイヤーに近いスクリーンとなります。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 264, rule: "notation.katakana", severity: "warning",
    src: "The variant property selects a screen based on the properties of the device it's running on.", tgt: "variantプロパティは起動しているデバイスに基づいて選択されます。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 276, rule: "notation.katakana", severity: "warning",
    src: "Finally, the style_prefix property specifies a prefix that's applied to the styles in the screen.", tgt: "最後に、style_prefixプロパティはスクリーン内で適用するスタイルの接頭辞を指定します。",
    whatJa: "長音のない「プロパティ」です。同じ翻訳ファイル群では「プロパティー」が29か所で多数派です（tutorial_atl.rpy など）。",
    whatEn: "This line writes 「プロパティ」 without the long-vowel mark; 「プロパティー」 is the majority form (29 uses across these files, e.g. in tutorial_atl.rpy).",
    fix: "プロパティ → プロパティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "screens", line: 456, rule: "untranslated.empty", severity: "warning",
    src: "Be Merry", tgt: "",
    whatJa: "訳文が空です。メニューの選択肢（勉強・運動・食事・飲料・…）の最後の1つだけ、訳がありません。画面には英語の「Be Merry」が出ます。",
    whatEn: "The translation is empty. It is the last of five menu choices (study, exercise, eat, drink, …); the player sees the English “Be Merry”.",
    fix: "楽しむ", fixKind: "translate",
  },
  {
    file: "screens", line: 508, rule: "untranslated.copy", severity: "info",
    src: "Hello, world.", tgt: "Hello, world.",
    whatJa: "訳文が原文と同じです。コード例の画面に出す文字列なので、意図して訳していない可能性もあります（そのため重大度は「参考」です）。",
    whatEn: "The translation is identical to the source. It is a string in a code-example screen, so leaving it in English may be intentional (hence the “info” severity).",
    fix: "意図どおりなら変更不要。訳す場合は「こんにちは、世界。」", fixKind: "translate",
  },
];

// ---------- verify (optional) ----------
function quoted(line) {
  const m = line.match(/"((?:[^"\\]|\\.)*)"/);
  return m ? JSON.parse(`"${m[1]}"`) : null;
}
function sourceFor(lines, n) {
  // 訳文の行（n、1始まり）から上へたどり、直前の「# 話者 "原文"」または「old "原文"」を返す。
  for (let i = n - 2; i >= Math.max(0, n - 6); i--) {
    const t = lines[i].trim();
    if (/^# \w+ "/.test(t) || /^# "/.test(t) || /^old "/.test(t)) return quoted(t);
  }
  return null;
}
function verify(dir) {
  const report = JSON.parse(readFileSync(join(dir, "A.json"), "utf8"));
  const s = report.summary;
  if (s.errors !== TOTALS.errors || s.warnings !== TOTALS.warnings || s.infos !== TOTALS.infos)
    throw new Error(`totals differ: ${JSON.stringify(s)}`);
  for (const r of BY_RULE) {
    for (const sev of ["error", "warning", "info"]) {
      const n = report.findings.filter((f) => f.rule === r.rule && f.severity === sev).length;
      if (n !== r[sev]) throw new Error(`${r.rule}/${sev}: expected ${r[sev]}, got ${n}`);
    }
  }
  if (BY_RULE.reduce((a, r) => a + r.error + r.warning + r.info, 0) !== report.findings.length) throw new Error("BY_RULE does not cover every finding");
  if (report.tables.length !== NFILES) throw new Error(`files: ${report.tables.length}`);
  const rows = report.tables.reduce((a, t) => a + t.rows, 0);
  if (rows !== ROWS_TOTAL) throw new Error(`rows: ${rows}`);
  for (const [k, f] of Object.entries(FILES)) {
    const t = report.tables.find((x) => x.file.endsWith("/" + f.path.split("/").pop()));
    if (!t || t.rows !== f.rows) throw new Error(`${k}: rows ${t?.rows}`);
  }
  if (ITEMS.length !== report.findings.length) throw new Error("ITEMS must list every finding");
  const fits = (excerpt, full) => excerpt.split("…").filter(Boolean).every((part) => full.includes(part));
  for (const it of ITEMS) {
    const base = FILES[it.file].path.split("/").pop();
    const f = report.findings.find((x) => x.file.endsWith("/" + base) && x.line === it.line && x.rule === it.rule && x.severity === it.severity);
    if (!f) throw new Error(`no finding ${it.file}:${it.line} ${it.rule}`);
    const lines = readFileSync(join(dir, base), "utf8").replace(/^\uFEFF/, "").split("\n");
    const tgt = quoted(lines[it.line - 1]);
    const srcText = sourceFor(lines, it.line);
    if (tgt === null || srcText === null) throw new Error(`cannot read ${it.file}:${it.line}`);
    if (!fits(it.src, srcText)) throw new Error(`source excerpt mismatch at ${it.file}:${it.line}`);
    if (!fits(it.tgt, tgt) || (!it.tgt && tgt !== "")) throw new Error(`target excerpt mismatch at ${it.file}:${it.line}`);
  }
  console.log(`verify: ok (${report.findings.length} findings, ${ITEMS.length} items checked against ${dir})`);
}
// ---------- render ----------
for (const it of ITEMS) {
  if (it.src.length > 120 || it.tgt.length > 120) throw new Error(`excerpt over 120 chars at ${it.file}:${it.line}`);
  if (!RULES[it.rule] || !SEV[it.severity]) throw new Error(`unknown rule/severity at ${it.file}:${it.line}`);
}
if (ITEMS.length !== 11) throw new Error(`expected 11 items, got ${ITEMS.length}`);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const bi = (ja, en, tag = "span", cls = "") => {
  const c = cls ? ` ${cls}` : "";
  return `<${tag} class="t${c}" lang="ja">${ja}</${tag}><${tag} class="t${c}" lang="en">${en}</${tag}>`;
};
const lineUrl = (file, line) => `${REPO}/blob/${SHA}/${FILES[file].path}#L${line}`;
const shortPath = (file) => FILES[file].path.split("/").pop();

const total = TOTALS.errors + TOTALS.warnings + TOTALS.infos;
const rowsTotal = ROWS_TOTAL;
const shownBySev = { error: 0, warning: 0, info: 0 };
for (const it of ITEMS) shownBySev[it.severity]++;
const shownByRule = {};
for (const it of ITEMS) shownByRule[it.rule] = (shownByRule[it.rule] ?? 0) + 1;

function card(it, i) {
  const sev = SEV[it.severity];
  const rule = RULES[it.rule];
  const loc = `${shortPath(it.file)}:${it.line}`;
  const related = it.related?.length
    ? `<p class="related">${bi("同じ問題の行：", "Same issue:")} ${it.related.map((l) => `<a href="${lineUrl(it.file, l)}">L${l}</a>`).join(" ")}</p>`
    : "";
  const tgt = it.tgt ? `<q lang="ja">${esc(it.tgt)}</q>` : `<span class="empty">${bi("（空欄：訳なし）", "(empty: no translation)")}</span>`;
  const fixLabel = it.fixKind === "translate"
    ? bi("修正案（AIによる訳の提案。翻訳者の確認が必要です）", "Suggested fix (an AI-drafted translation for your translator to review)")
    : it.fixKind === "notation"
      ? bi("修正案（AIの提案。表記ルールに合わせて確認してください）", "Suggested fix (AI suggestion; check against your style rules)")
      : bi("修正案（AIの提案。翻訳者の確認が必要です）", "Suggested fix (AI suggestion for your translator to review)");
  return `
    <li class="card sev-${it.severity}">
      <article aria-labelledby="f${i + 1}-h">
        <header class="card-head">
          <span class="num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
          <h3 id="f${i + 1}-h"><span class="sev">${bi(sev.ja, sev.en)}</span> ${bi(rule.ja, rule.en)}</h3>
          <a class="loc" href="${lineUrl(it.file, it.line)}"><span class="sr-only">${bi("GitHub で開く：", "Open on GitHub: ")}</span>${esc(loc)}</a>
        </header>
        <dl class="pair">
          <div><dt>${bi("原文（英語）", "Source (EN)")}</dt><dd><q lang="en">${esc(it.src)}</q></dd></div>
          <div><dt>${bi("訳文（日本語）", "Target (JA)")}</dt><dd>${tgt}</dd></div>
        </dl>
        <p class="what">${bi(esc(it.whatJa), esc(it.whatEn))}</p>
        ${related}
        <div class="fix">
          <p class="fix-label">${fixLabel}</p>
          <p class="fix-text" lang="ja">${esc(it.fix)}</p>
        </div>
      </article>
    </li>`;
}

const ruleRows = BY_RULE.map((r) => {
  const n = r.error + r.warning + r.info;
  const cell = (v) => (v ? fmt(v) : `<span class="zero">–</span>`);
  return `<tr><th scope="row">${bi(RULES[r.rule].ja, RULES[r.rule].en)}</th><td>${cell(r.error)}</td><td>${cell(r.warning)}</td><td>${cell(r.info)}</td><td><b>${fmt(n)}</b></td><td>${cell(shownByRule[r.rule] ?? 0)}</td></tr>`;
}).join("\n            ");

const TITLE_JA = "サンプル監査レポート 2（Ren'Py） — Kotomark（仮称）";
const TITLE_EN = "Sample audit report 2 (Ren'Py) — Kotomark (working name)";
const DESC_JA = `Ren'Py 公式チュートリアルの日本語訳（${fmt(rowsTotal)}件の文字列）を Kotomark で検査した結果のサンプル。指摘${fmt(TOTALS.errors + TOTALS.warnings + TOTALS.infos)}件のすべてを、原文・訳文・修正案付きで掲載。`;
const DESC_EN = `Sample: Kotomark run on the Japanese translation of the Ren'Py tutorial (${fmt(rowsTotal)} strings). All ${fmt(TOTALS.errors + TOTALS.warnings + TOTALS.infos)} findings, each with source, target and a suggested fix.`;

const html = `<!doctype html>
<html lang="ja" class="l-ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(TITLE_JA)}</title>
<meta name="description" content="${esc(DESC_JA)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%231c4a86'/%3E%3Cpath d='M9 8v16M9 16l9-8M12.5 13l6 11' stroke='%23fff' stroke-width='3' fill='none' stroke-linecap='square'/%3E%3Ccircle cx='24' cy='23' r='2.6' fill='%23e0533d'/%3E%3C/svg%3E">
<style>
:root {
  --bg: #f2f3f1; --bg-band: #e8eae7; --surface: #ffffff;
  --ink: #14171c; --ink-2: #3f444d; --ink-3: #5d636d;
  --rule: #d2d5d1; --rule-strong: #14171c;
  --accent: #1c4a86; --accent-hover: #143a6c; --accent-ink: #ffffff; --accent-soft: #e1e8f3;
  --mark: #b8321f; --mark-soft: #f8e3df; --warn: #8a5a00; --warn-soft: #f6ecd6;
  --ok: #2c6a4a; --ok-soft: #dfeee5; --focus: #1c4a86;
  --font-ui: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --radius: 4px; --wrap: 960px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1217; --bg-band: #141820; --surface: #191e27;
    --ink: #e7e9ed; --ink-2: #bcc2cc; --ink-3: #9aa1ad;
    --rule: #2c323d; --rule-strong: #e7e9ed;
    --accent: #8db3ec; --accent-hover: #b0cbf3; --accent-ink: #0f1217; --accent-soft: #1d2a3f;
    --mark: #ff8f7a; --mark-soft: #3a1f1b; --warn: #f0c36a; --warn-soft: #33290f;
    --ok: #82cfa3; --ok-soft: #17301f; --focus: #8db3ec;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1217; --bg-band: #141820; --surface: #191e27; --ink: #e7e9ed; --ink-2: #bcc2cc; --ink-3: #9aa1ad;
  --rule: #2c323d; --rule-strong: #e7e9ed; --accent: #8db3ec; --accent-hover: #b0cbf3; --accent-ink: #0f1217;
  --accent-soft: #1d2a3f; --mark: #ff8f7a; --mark-soft: #3a1f1b; --warn: #f0c36a; --warn-soft: #33290f;
  --ok: #82cfa3; --ok-soft: #17301f; --focus: #8db3ec;
}
.l-ja .t[lang="en"], .l-en .t[lang="ja"] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-ui); font-size: 16px; line-height: 1.75; overflow-wrap: anywhere; }
:lang(en) { line-height: 1.6; }
h1, h2, h3 { line-height: 1.35; margin: 0; }
p, ul, ol, dl, dd { margin: 0; }
a { color: var(--accent); text-underline-offset: 3px; }
a:hover { color: var(--accent-hover); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 2px; }
code, .mono { font-family: var(--font-mono); font-size: .9em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip { position: absolute; left: -9999px; top: 8px; z-index: 10; background: var(--surface); color: var(--ink); padding: 8px 12px; border: 2px solid var(--focus); }
.skip:focus { left: 16px; }
.wrap { max-width: var(--wrap); margin: 0 auto; padding-inline: 24px; }
@media (max-width: 600px) { .wrap { padding-inline: 16px; } }

.site-head { border-bottom: 1px solid var(--rule); background: var(--bg); }
.site-head .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 17px; }
.brand small { font-weight: 400; font-size: 12px; color: var(--ink-3); }
@media (max-width: 420px) { .brand small { display: none; } }
.lang { display: inline-flex; border: 1px solid var(--rule-strong); border-radius: var(--radius); overflow: hidden; }
.lang button { font: inherit; font-size: 13px; line-height: 1; padding: 8px 10px; min-height: 36px; border: 0; cursor: pointer; background: transparent; color: var(--ink); white-space: nowrap; }
.lang button + button { border-left: 1px solid var(--rule-strong); }
.lang button[aria-pressed="true"] { background: var(--ink); color: var(--bg); font-weight: 700; }
.lang button:focus-visible { outline-offset: -3px; }

.intro { padding: 40px 0 32px; }
.eyebrow { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); margin-bottom: 12px; }
.intro h1 { font-size: clamp(24px, 4vw, 34px); }
.lede { margin-top: 16px; font-size: 18px; color: var(--ink-2); max-width: 44em; }
.lede strong { color: var(--ink); }
.facts { margin-top: 20px; font-size: 14px; color: var(--ink-3); }
.facts a { color: inherit; }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 12px; margin-top: 28px; padding: 0; list-style: none; }
.stat { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); padding: 14px 16px; }
.stat .n { display: block; font-family: var(--font-mono); font-size: 28px; line-height: 1.2; font-weight: 500; }
.stat .l { font-size: 13px; color: var(--ink-2); }
.stat.s-error .n { color: var(--mark); }
.stat.s-warning .n { color: var(--warn); }

.band { padding: 40px 0; border-top: 1px solid var(--rule); }
.band.alt { background: var(--bg-band); }
.band h2 { font-size: clamp(20px, 3vw, 26px); margin-bottom: 14px; }
.band > .wrap > p { color: var(--ink-2); max-width: 46em; }
.table-scroll { overflow-x: auto; margin-top: 16px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; background: var(--surface); border: 1px solid var(--rule); }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--rule); text-align: right; }
thead th { font-size: 12px; color: var(--ink-3); font-weight: 500; }
th[scope="row"], thead th:first-child { text-align: left; font-weight: 400; }
td { font-family: var(--font-mono); }
.zero { color: var(--ink-3); }
tfoot td, tfoot th { font-weight: 700; border-bottom: 0; }
.table-note { margin-top: 10px; font-size: 13px; color: var(--ink-3); }

.cards { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--rule); border-left: 4px solid var(--ink-3); border-radius: var(--radius); padding: 16px 18px 18px; }
.card.sev-error { border-left-color: var(--mark); }
.card.sev-warning { border-left-color: var(--warn); }
.card-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; align-items: baseline; }
.card-head .num { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); }
.card-head h3 { font-size: 17px; }
.card-head .loc { grid-column: 2; font-family: var(--font-mono); font-size: 13px; }
.sev { display: inline-block; font-size: 12px; font-weight: 700; padding: 0 8px; border-radius: 2px; margin-right: 6px; vertical-align: 2px; background: var(--bg-band); color: var(--ink-2); }
.sev-error .sev { background: var(--mark-soft); color: var(--mark); }
.sev-warning .sev { background: var(--warn-soft); color: var(--warn); }
.pair { margin-top: 12px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 16px; }
@media (max-width: 640px) { .pair { grid-template-columns: minmax(0, 1fr); } }
.pair > div { border-top: 1px dashed var(--rule); padding-top: 8px; }
.pair dt { font-size: 12px; color: var(--ink-3); }
.pair dd { font-size: 15px; }
.pair q { quotes: "“" "”"; }
.pair q:lang(ja) { quotes: "「" "」"; }
.empty { color: var(--mark); font-size: 14px; }
.what { margin-top: 12px; color: var(--ink-2); font-size: 15px; }
.related { margin-top: 6px; font-size: 13px; color: var(--ink-3); }
.related a { font-family: var(--font-mono); margin-right: 6px; }
.fix { margin-top: 12px; background: var(--ok-soft); border-radius: var(--radius); padding: 10px 12px; }
.fix-label { font-size: 12px; color: var(--ok); font-weight: 700; }
.fix-text { font-size: 15px; }

.method ul { padding-left: 1.2em; display: grid; gap: 8px; max-width: 48em; color: var(--ink-2); font-size: 15px; }
.cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.btn { display: inline-flex; align-items: center; justify-content: center; font: inherit; font-weight: 700; font-size: 16px; text-decoration: none; padding: 12px 20px; min-height: 48px; border-radius: var(--radius); background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); }
.btn:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: var(--accent-ink); }
.btn.ghost { background: transparent; color: var(--ink); border-color: var(--rule-strong); }
.btn.ghost:hover { background: var(--surface); color: var(--ink); }

.site-foot { border-top: 1px solid var(--rule); padding: 28px 0 40px; font-size: 13px; color: var(--ink-3); }
.site-foot .wrap { display: grid; gap: 8px; }
@media print { .lang, .cta, .skip { display: none; } .card { break-inside: avoid; } body { background: #fff; } }
</style>
<script>
(function () {
  var saved = null;
  try { saved = localStorage.getItem("kotomark-lp-lang"); } catch (e) { saved = null; }
  var nav = "";
  try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || ""; } catch (e) { nav = ""; }
  var lang = (saved === "ja" || saved === "en") ? saved : (/^ja\\b/i.test(nav) ? "ja" : "en");
  var root = document.documentElement;
  root.classList.remove("l-ja", "l-en");
  root.classList.add("l-" + lang);
  root.lang = lang;
})();
</script>
</head>
<body>
<a class="skip" href="#main">${bi("本文へ移動", "Skip to content")}</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="../">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="4" fill="currentColor"/><path d="M9 8v16M9 16l9-8M12.5 13l6 11" stroke="var(--bg)" stroke-width="3" fill="none" stroke-linecap="square"/><circle cx="24" cy="23" r="2.6" fill="var(--mark)"/></svg>
      <span>Kotomark <small>${bi("（仮称）", "(working name)")}</small></span>
    </a>
    <div class="lang" role="group" aria-label="Language / 言語">
      <button type="button" data-set-lang="ja" lang="ja" aria-pressed="true">日本語</button>
      <button type="button" data-set-lang="en" lang="en" aria-pressed="false">English</button>
    </div>
  </div>
</header>

<main id="main">
<section class="intro" aria-labelledby="title">
  <div class="wrap">
    <p class="eyebrow">${bi("サンプル監査レポート 2", "Sample audit report 2")} · Ren'Py · EN → JA</p>
    <h1 id="title">${bi(
      `台本形式（Ren'Py）の翻訳ファイルで、直すべき箇所を見つける`,
      `Finding what to fix in a Ren'Py script translation`,
    )}</h1>
    <p class="lede">${bi(
      `Ren'Py 公式チュートリアル（ゲーム形式のデモ）の日本語訳（${NFILES}ファイル・${fmt(rowsTotal)}件の文字列、台詞・選択肢・画面の文字列）を Kotomark で検査すると、<strong>${fmt(total)}件の指摘</strong>（エラー${TOTALS.errors}・警告${TOTALS.warnings}・参考${TOTALS.infos}）が出ました。<strong>全${total}件</strong>を、原文・訳文・修正案付きで掲載します。`,
      `Kotomark run on the Japanese translation of the official Ren'Py tutorial (a game-style demo; ${NFILES} files, ${fmt(rowsTotal)} strings of dialogue, menu choices and screen text) returned <strong>${fmt(total)} findings</strong> (${TOTALS.errors} errors, ${TOTALS.warnings} warnings, ${TOTALS.infos} info). <strong>All ${total}</strong> are shown below, each with source, target and a suggested fix.`,
    )}</p>
    <p class="facts">${bi(
      `対象：<code>${DIR}</code> の ${NFILES} ファイル（${fmt(rowsTotal)}件）。このページで行番号を示すのは <a href="${REPO}/blob/${SHA}/${FILES.common.path}">common.rpy</a>（${FILES.common.ja}、${fmt(FILES.common.rows)}件）と <a href="${REPO}/blob/${SHA}/${FILES.screens.path}">tutorial_screens.rpy</a>（${FILES.screens.ja}、${fmt(FILES.screens.rows)}件）。コミット <code>${SHA.slice(0, 7)}</code>。${RUN_DATE} 実行、既定の設定・用語集なし。`,
      `Files: the ${NFILES} files in <code>${DIR}</code> (${fmt(rowsTotal)} strings). Findings fall in <a href="${REPO}/blob/${SHA}/${FILES.common.path}">common.rpy</a> (${FILES.common.en}, ${fmt(FILES.common.rows)} strings) and <a href="${REPO}/blob/${SHA}/${FILES.screens.path}">tutorial_screens.rpy</a> (${FILES.screens.en}, ${fmt(FILES.screens.rows)} strings). Commit <code>${SHA.slice(0, 7)}</code>. Run on ${RUN_DATE} with default settings and no glossary.`,
    )}</p>
    <ul class="stats" aria-label="${esc("Summary / 概要")}">
      <li class="stat"><span class="n">${fmt(rowsTotal)}</span><span class="l">${bi("検査した文字列", "strings checked")}</span></li>
      <li class="stat s-error"><span class="n">${TOTALS.errors}</span><span class="l">${bi("エラー", "errors")}</span></li>
      <li class="stat s-warning"><span class="n">${TOTALS.warnings}</span><span class="l">${bi("警告", "warnings")}</span></li>
      <li class="stat"><span class="n">${TOTALS.infos}</span><span class="l">${bi("参考", "info")}</span></li>
      <li class="stat"><span class="n">${ITEMS.length}</span><span class="l">${bi("このページに掲載（全件）", "shown here (all)")}</span></li>
    </ul>
  </div>
</section>

<section class="band alt" aria-labelledby="counts-title">
  <div class="wrap">
    <h2 id="counts-title">${bi("指摘の内訳", "Findings by check")}</h2>
    <p>${bi(
      "公式の翻訳だけあって、エラーはありません。残った指摘の大半は、長音の有無による片仮名の表記揺れ（「プロパティ」と「プロパティー」など）です。画面の不具合にはなりませんが、用語集や表記ルールのあるプロジェクトでは、統一の対象になります。",
      "As expected from an official translation, there are no errors. Most of what is left is katakana notation drift caused by the long-vowel mark (「プロパティ」 vs 「プロパティー」). It does not break the screen, but it is what a project with a glossary or style guide would want unified.",
    )}</p>
    <div class="table-scroll" tabindex="0" role="region" aria-labelledby="counts-title">
      <table>
        <thead>
          <tr><th scope="col">${bi("検査", "Check")}</th><th scope="col">${bi("エラー", "Error")}</th><th scope="col">${bi("警告", "Warning")}</th><th scope="col">${bi("参考", "Info")}</th><th scope="col">${bi("計", "Total")}</th><th scope="col">${bi("掲載", "Shown")}</th></tr>
        </thead>
        <tbody>
            ${ruleRows}
        </tbody>
        <tfoot>
          <tr><th scope="row">${bi("合計", "Total")}</th><td>${TOTALS.errors}</td><td>${TOTALS.warnings}</td><td>${TOTALS.infos}</td><td>${fmt(total)}</td><td>${ITEMS.length}</td></tr>
        </tfoot>
      </table>
    </div>
    <p class="table-note">${bi(
      "重大度は Kotomark の既定の区分です。",
      "Severities are Kotomark's defaults.",
    )}</p>
  </div>
</section>

<section class="band" aria-labelledby="top-title">
  <div class="wrap">
    <h2 id="top-title">${bi(`指摘 全${ITEMS.length}件`, `All ${ITEMS.length} findings`)}</h2>
    <p>${bi(
      "選別はせず、出た指摘をすべて載せています。行番号のリンクは固定コミットの GitHub 上の該当行を開きます。原文・訳文は Ren'Py の作者・翻訳者によるもので、短い抜粋として引用しています（MIT ライセンス）。",
      "Nothing is cherry-picked: every finding is listed. Each line link opens that line on GitHub at the pinned commit. Source and target text is by the Ren'Py authors and translators, quoted as short excerpts (MIT license).",
    )}</p>
    <ol class="cards">${ITEMS.map(card).join("")}
    </ol>
  </div>
</section>

<section class="band alt method" aria-labelledby="method-title">
  <div class="wrap">
    <h2 id="method-title">${bi("方法と注意点", "Method and caveats")}</h2>
    <ul>
      <li>${bi(
        `Kotomark のコマンドライン版を既定の設定・用語集なしで実行しました（<code>kotomark check ${NFILES}個の .rpy ファイル --no-glossary</code>、${RUN_DATE}）。用語集を使う検査（用語・敬称など）はこの結果に含まれません。`,
        `Kotomark's command-line tool was run with default settings and no glossary (<code>kotomark check</code> on the ${NFILES} .rpy files with <code>--no-glossary</code>, ${RUN_DATE}). Glossary-based checks (terms, honorifics, etc.) are not part of this result.`,
      )}</li>
      <li>${bi(
        "指摘は Kotomark が出したすべてです。各指摘の一言の説明と修正案は、Kotomark の社内の AI 評価者が原文と訳文を読んで書いたもので、人による確認ではありません。修正案は AI の提案です。訳文の提案は、プロジェクトの用語・文体に合わせて翻訳者が確認してから使ってください。",
        "The findings are everything Kotomark reported. The short explanation and suggested fix for each were written by Kotomark's in-house AI evaluator, which read each source and target; they were not reviewed by a person. Suggested fixes are AI suggestions: have a translator check any suggested translation against the project's terminology and style before using it.",
      )}</li>
      <li>${bi(
        "この結果はこの10ファイルについてのもので、他のプロジェクトでの精度を示すものではありません。数が少ないのは、翻訳が丁寧に作られているためで、見落としがないことを意味しません。このチュートリアルの翻訳ファイルは、Kotomark の調整には使っていません。",
        "These results are about these ten files only and say nothing about accuracy on other projects. The count is small because the translation is carefully made; it does not prove nothing was missed. These tutorial translation files were not used to tune Kotomark.",
      )}</li>
      <li>${bi(
        `データの出典：<a href="${REPO}">Ren'Py</a>、コミット <a href="${REPO}/tree/${SHA}"><code>${SHA}</code></a>、<code>${DIR}</code>。Ren'Py の大部分は MIT ライセンスで、デモの素材も同じ条件と同プロジェクトのライセンス文書に書かれています（<a href="${REPO}/blob/${SHA}/sphinx/source/license.rst">license.rst</a>）。引用した原文・訳文の著作権は Ren'Py の作者・翻訳者にあります。Ren'Py プロジェクトが Kotomark を推奨・承認しているわけではありません。名前は出典を示すためにだけ使っています。`,
        `Data source: <a href="${REPO}">Ren'Py</a>, commit <a href="${REPO}/tree/${SHA}"><code>${SHA}</code></a>, <code>${DIR}</code>. Most of Ren'Py is under the MIT license, and the project's license document says the demo's assets carry the same terms (<a href="${REPO}/blob/${SHA}/sphinx/source/license.rst">license.rst</a>). The copyright in the quoted source and target excerpts belongs to the Ren'Py authors and translators. The Ren'Py project has not endorsed Kotomark; the name is used only to identify the source.`,
      )}</li>
      <li>${bi(
        "Kotomark はソース公開のソフトウェアです（オープンソースではありません）。「Kotomark」は仮称で、名称は変わる可能性があります。",
        "Kotomark is source-available software (it is not open source). “Kotomark” is a working name and may change.",
      )}</li>
    </ul>
    <p>${bi(
      `もう1本のサンプル：<a href="../sample-report/">Battle for Wesnoth の日本語訳で見つかった問題20件</a>（.po 形式）。`,
      `Another sample: <a href="../sample-report/">20 issues found in the Battle for Wesnoth Japanese translation</a> (.po files).`,
    )}</p>
  </div>
</section>

<section class="band" aria-labelledby="cta-title">
  <div class="wrap">
    <h2 id="cta-title">${bi("お手元のファイルで試す", "Try it on your own files")}</h2>
    <p>${bi(
      "ブラウザのデモは、ファイルをどこにも送信せずにその場で検査します。実際の日英台本で試していただける試用協力者も募集しています。",
      "The browser demo checks files right in the page without uploading them. We are also looking for pilot partners to try it on a real JA↔EN script.",
    )}</p>
    <div class="cta">
      <a class="btn" href="../demo/">${bi("デモを試す", "Try the demo")}</a>
      <a class="btn ghost" href="../#pilot">${bi("試用協力について", "About the pilot")}</a>
    </div>
  </div>
</section>
</main>

<footer class="site-foot">
  <div class="wrap">
    <p>${bi(
      "「Kotomark」は仮称です。商標の確認が済んでいないため、名称は変わる可能性があります。Kotomark は独立した製品で、Ren'Py プロジェクトやAI提供元とは提携していません。",
      "“Kotomark” is a working name; the trademark check is not finished, so the name may change. Kotomark is an independent product, not affiliated with the Ren'Py project or any AI provider.",
    )}</p>
    <p><a href="../">${bi("Kotomark のトップページへ", "Back to the Kotomark home page")}</a></p>
  </div>
</footer>

<script>
(function () {
  var KEY = "kotomark-lp-lang";
  var root = document.documentElement;
  var TITLES = { ja: ${JSON.stringify(TITLE_JA)}, en: ${JSON.stringify(TITLE_EN)} };
  var DESCS = { ja: ${JSON.stringify(DESC_JA)}, en: ${JSON.stringify(DESC_EN)} };
  var buttons = document.querySelectorAll("[data-set-lang]");
  var desc = document.querySelector('meta[name="description"]');
  function apply(lang) {
    root.classList.remove("l-ja", "l-en");
    root.classList.add("l-" + lang);
    root.lang = lang;
    document.title = TITLES[lang];
    if (desc) desc.setAttribute("content", DESCS[lang]);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", buttons[i].getAttribute("data-set-lang") === lang ? "true" : "false");
    }
  }
  apply(root.classList.contains("l-en") ? "en" : "ja");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () {
      var lang = this.getAttribute("data-set-lang");
      apply(lang);
      try { localStorage.setItem(KEY, lang); } catch (e) { /* storage unavailable */ }
    });
  }
})();
</script>
</body>
</html>
`;

const vi = process.argv.indexOf("--verify");
if (vi !== -1) {
  const dir = process.argv[vi + 1];
  if (!dir) throw new Error("--verify needs a directory");
  verify(dir);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`sample-report ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB -> ${OUT}`);
