// サンプル監査レポート（営業・連絡用の1ページ）を生成する。
//   node scripts/sample-report.mjs                 → web/sample-report/index.html を書き出す（埋め込みデータから）
//   node scripts/sample-report.mjs --verify <dir>  → 書き出す前に、<dir>/A.json（Kotomark の出力）と
//                                                    <dir>/httt/ja.po・<dir>/lib/ja.po（固定コミットの原本）で
//                                                    件数・各指摘の存在・抜粋の一字一句を確認する
// 公開サイトへは web/build-site.mjs が site/sample-report/index.html にコピーする（CSP もそこで付く）。
//
// データの取り直し（/tmp のみに置く。原本はリポジトリに入れない）:
//   SHA=9ec35a2f4cbaf036dedf9e96272a03387d7bc03a; D=/tmp/kotomark-sample/wesnoth; mkdir -p $D/httt $D/lib
//   curl -sSfL -o $D/httt/ja.po https://raw.githubusercontent.com/wesnoth/wesnoth/$SHA/po/wesnoth-httt/ja.po
//   curl -sSfL -o $D/lib/ja.po  https://raw.githubusercontent.com/wesnoth/wesnoth/$SHA/po/wesnoth-lib/ja.po
//   npx tsx src/cli/index.ts check $D/httt/ja.po $D/lib/ja.po --format json --fail-on never --no-glossary > $D/A.json
//   node scripts/sample-report.mjs --verify $D
//
// 掲載する20件は AI（Kotomark の社内評価者）が原文・訳文を読んで選び、確認したもの。人の確認ではない。
// 抜粋は各120字以内。「…」は省略を表し、それ以外は原本どおり（--verify で照合する）。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "web/sample-report/index.html");

const REPO = "https://github.com/wesnoth/wesnoth";
const SHA = "9ec35a2f4cbaf036dedf9e96272a03387d7bc03a";
const FILES = {
  httt: { path: "po/wesnoth-httt/ja.po", rows: 1230, ja: "キャンペーン「Heir to the Throne」の台詞など", en: "campaign “Heir to the Throne”: dialogue etc." },
  lib: { path: "po/wesnoth-lib/ja.po", rows: 1691, ja: "UI・地形・ヘルプの文字列", en: "UI, terrain and help strings" },
};
const RUN_DATE = "2026-10-09";

// Kotomark の出力（用語集なし・既定設定）の集計。--verify で A.json と照合する。
const TOTALS = { errors: 3, warnings: 211, infos: 4 };
const BY_RULE = [
  { rule: "untranslated.fuzzy", error: 0, warning: 103, info: 0 },
  { rule: "untranslated.empty", error: 0, warning: 97, info: 0 },
  { rule: "notation.katakana", error: 0, warning: 11, info: 0 },
  { rule: "placeholder.mismatch", error: 2, warning: 0, info: 0 },
  { rule: "tag.mismatch", error: 1, warning: 0, info: 0 },
  { rule: "tag.emphasis-dropped", error: 0, warning: 0, info: 2 },
  { rule: "voice.first-person", error: 0, warning: 0, info: 2 },
];

const RULES = {
  "untranslated.fuzzy": { ja: "古い訳のまま（fuzzy）", en: "Stale translation (fuzzy)" },
  "untranslated.empty": { ja: "未翻訳", en: "Untranslated" },
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

const FUZZY_JA = "fuzzy（要確認）の印が付いた訳は、一般的な gettext のビルドでは使われず、画面には英語が出ます。";
const FUZZY_EN = "Entries marked fuzzy are normally skipped by gettext builds, so players see English.";

// 掲載する20件。file/line/rule は Kotomark の指摘そのもの。src/tgt は原本からの抜粋（「…」は省略）。
const ITEMS = [
  {
    file: "lib", line: 7948, rule: "placeholder.mismatch", severity: "error",
    src: "$count/1000 tiles", tgt: "/1000 タイル",
    whatJa: "訳文に変数 $count がありません。数が消えて「/1000 タイル」だけが表示されます（この行は旧原文 “/1000 tiles” の訳で、fuzzy の印も付いています）。",
    whatEn: "The translation has no $count, so the number disappears and only “/1000 タイル” is shown. (It is the translation of the old source “/1000 tiles” and is also marked fuzzy.)",
    fix: "$count/1000 タイル", fixKind: "restore",
  },
  {
    file: "lib", line: 9914, rule: "placeholder.mismatch", severity: "error",
    src: "In section ‘[$section|]’ the mandatory subtag ‘[$tag|]’ is missing.",
    tgt: "「 [$section|] 」セクションにおいて必須のキー「 $key| 」が設定されていません。",
    whatJa: "訳文は旧原文（必須の「キー」が未設定）のままです。原文の $tag がなく、原文にない $key が入っています。表示されるエラーの内容が変わってしまいます。",
    whatEn: "The translation still renders the old message (a missing mandatory key). It drops $tag and uses $key, which is not in the source, so the error message says the wrong thing.",
    fix: "「 [$section|] 」セクションに必須のサブタグ「 [$tag|] 」がありません。", fixKind: "translate",
  },
  {
    file: "lib", line: 4132, rule: "tag.mismatch", severity: "error",
    src: "Gender:", tgt: "<b>性別：</b>",
    whatJa: "原文から太字タグ <b> が外されたのに、訳文に残っています（旧原文 “<b>Gender:</b>” の訳）。",
    whatEn: "The source no longer has the <b> bold tag, but the translation still does (it translates the old source “<b>Gender:</b>”).",
    fix: "性別：", fixKind: "restore",
  },
  {
    file: "lib", line: 4139, rule: "untranslated.fuzzy", severity: "warning",
    src: "gender^Male", tgt: "ランダム",
    whatJa: "「男性」を選ぶ項目に、旧原文 “Random” の訳「ランダム」が残っています。印を外すだけだと誤訳が表示されます。（gender^ は文脈用の接頭辞で、画面には出ません。）",
    whatEn: "The “Male” option still carries 「ランダム」 (“Random”), the translation of an older string. Just clearing the fuzzy mark would ship a wrong label. (gender^ is a context prefix and is not displayed.)",
    fix: "男性", fixKind: "translate",
  },
  {
    file: "lib", line: 2526, rule: "untranslated.fuzzy", severity: "warning",
    src: "Visit the in-game help", tgt: "ゲームを終了します",
    whatJa: "「ゲーム内ヘルプを開く」ボタンの説明に、旧原文 “Quit the game”（ゲームを終了します）の訳が残っています。意味が逆方向です。",
    whatEn: "The tooltip for opening the in-game help still says 「ゲームを終了します」 (“Quit the game”), left over from an older string.",
    fix: "ゲーム内のヘルプを表示します", fixKind: "translate",
  },
  {
    file: "lib", line: 7938, rule: "untranslated.fuzzy", severity: "warning",
    src: "Unsaved changes will be lost. Do you want to leave?",
    tgt: "同じ名前のセーブデータが既に存在しています。上書きしますか？",
    whatJa: "「未保存の変更が失われます。終了しますか？」という確認に、上書き確認の旧訳が残っています。誤った選択につながる種類の誤訳です。",
    whatEn: "A “you will lose unsaved changes” prompt still carries the old “a save with this name exists; overwrite?” translation, which could lead players to the wrong choice.",
    fix: "保存していない変更は失われます。終了しますか？", fixKind: "translate",
  },
  {
    file: "lib", line: 7760, rule: "untranslated.fuzzy", severity: "warning",
    src: "game^Get Add-ons", tgt: "アドオンの削除",
    whatJa: "「アドオンを入手」に、旧原文 “Remove Add-ons” の訳「アドオンの削除」が残っています。意味が逆です。",
    whatEn: "“Get Add-ons” still carries 「アドオンの削除」 (“Remove Add-ons”) from an older string: the opposite meaning.",
    fix: "アドオンの入手", fixKind: "translate",
  },
  {
    file: "lib", line: 3226, rule: "untranslated.fuzzy", severity: "warning",
    src: "Not Completed", tgt: "完了率",
    whatJa: "キャンペーンの絞り込み「未クリア」に、旧原文 “Completed” の訳「完了率」が残っています。同じ旧訳が “Completed: Bronze / Silver / Gold / All” の4件（L3239・3251・3263・3275）にもあります。",
    whatEn: "The campaign filter “Not Completed” still carries 「完了率」 from the old “Completed”. The same leftover appears on “Completed: Bronze / Silver / Gold / All” (L3239, 3251, 3263, 3275).",
    fix: "未完了", fixKind: "translate",
    related: [3239, 3251, 3263, 3275],
  },
  {
    file: "lib", line: 2978, rule: "untranslated.fuzzy", severity: "warning",
    src: "Delete selected add-on (admin)", tgt: "アドオンのバージョンを選択します",
    whatJa: "管理者用の「削除」ボタンの説明が「バージョンを選択します」のままです。隣の “Hide selected add-on (admin)”（L2985）も同じ旧訳です。",
    whatEn: "The admin “delete add-on” button is described as “select the add-on version”. The neighbouring “Hide selected add-on (admin)” (L2985) has the same leftover.",
    fix: "選択したアドオンを削除します（管理者）", fixKind: "translate",
    related: [2985],
  },
  {
    file: "lib", line: 8684, rule: "untranslated.fuzzy", severity: "warning",
    src: "This unit requires no upkeep.", tgt: "忠義ユニットには維持費が必要ありません。",
    whatJa: "原文から “loyal”（忠義）が外れ、忠義以外の理由で維持費が不要なユニットにも使われる文になりました。訳文は「忠義ユニット」と言い切ったままです。",
    whatEn: "The source dropped “loyal”, so the line now covers units that need no upkeep for other reasons too; the translation still says “loyal units”.",
    fix: "このユニットには維持費がかかりません。", fixKind: "translate",
  },
  {
    file: "lib", line: 8446, rule: "untranslated.fuzzy", severity: "warning",
    src: "Scenario not found: ", tgt: "シナリオエディタ",
    whatJa: "エラーメッセージ「シナリオが見つかりません」に、旧原文 “Scenario Editor” の訳が残っています。",
    whatEn: "The “Scenario not found” error still carries 「シナリオエディタ」 (“Scenario Editor”) from an older string.",
    fix: "シナリオが見つかりません：", fixKind: "translate",
  },
  {
    file: "httt", line: 26, rule: "untranslated.fuzzy", severity: "warning",
    src: "Heir to the Throne, Classic", tgt: "王位継承者",
    whatJa: "キャンペーン名に旧版を区別する “Classic” が加わりましたが、訳は「王位継承者」のままです。新しい「Heir to the Throne」と見分けがつかなくなります。",
    whatEn: "The campaign title gained “Classic” to tell it apart from the new “Heir to the Throne”, but the translation is still just 「王位継承者」.",
    fix: "王位継承者（クラシック版）", fixKind: "translate",
  },
  {
    file: "lib", line: 3069, rule: "untranslated.empty", severity: "warning",
    src: "campaign_landing^Welcome to Wesnoth v1.20", tgt: "",
    whatJa: "キャンペーン画面の右側に出る案内文（campaign_landing^ で始まる11件、L3069〜3157）がすべて未翻訳です。プレイヤーが最初に読む画面の一つです。",
    whatEn: "All 11 strings of the campaign-menu welcome panel (campaign_landing^…, L3069–3157) are untranslated. It is one of the first screens a player reads.",
    fix: "Wesnoth v1.20 へようこそ", fixKind: "translate",
  },
  {
    file: "httt", line: 51, rule: "untranslated.empty", severity: "warning",
    src: "This is the original version of this classic campaign, preserved for historical reasons. Also optionally includes…",
    tgt: "",
    whatJa: "キャンペーン選択画面に出る説明文が未翻訳です。",
    whatEn: "The campaign description shown on the campaign selection screen is untranslated.",
    fix: "この名作キャンペーンのオリジナル版で、記録のために残しています。旧チュートリアル <i>Battle Training</i> も選んで遊べます。", fixKind: "translate",
  },
  {
    file: "lib", line: 7386, rule: "untranslated.empty", severity: "warning",
    src: "Completed $count/$total", tgt: "",
    whatJa: "実績画面の進み具合の表示が未翻訳です。訳すときは $count と $total を残す必要があります。",
    whatEn: "The progress counter on the achievements screen is untranslated. A translation must keep $count and $total.",
    fix: "達成 $count/$total", fixKind: "translate",
  },
  {
    file: "httt", line: 1633, rule: "notation.katakana", severity: "warning",
    src: "Ahh, a party of elves approaches. Soon we shall have elven zombies serving us!",
    tgt: "アアア、エルフのパーティーが近づいてきている。我々はすぐにエルフのゾンビを従える事ができるだろう！",
    whatJa: "このファイルでは「パーティ」が13回、「パーティー」はこの1回だけです。",
    whatEn: "This file writes 「パーティ」 13 times and 「パーティー」 only here.",
    fix: "パーティー → パーティ（多数派の表記）", fixKind: "notation",
  },
  {
    file: "lib", line: 3631, rule: "notation.katakana", severity: "warning",
    src: "User Interaction Required", tgt: "ユーザへの操作要求",
    whatJa: "「ユーザー」8回に対し「ユーザ」が7回あり、ほぼ半々に揺れています。同じ「ユーザ」が L3636・5832・5920・6772・6781・8558 にもあります（「ユーザデータ」L4852 も同様）。",
    whatEn: "「ユーザー」 appears 8 times and 「ユーザ」 7 times: an almost even split. 「ユーザ」 also appears at L3636, 5832, 5920, 6772, 6781 and 8558 (and 「ユーザデータ」 at L4852).",
    fix: "ユーザ → ユーザー（多数派の表記。チームの表記ルールがあればそれに合わせる）", fixKind: "notation",
    related: [3636, 5832, 5920, 6772, 6781, 8558, 4852],
  },
  {
    file: "lib", line: 2486, rule: "notation.katakana", severity: "warning",
    src: "Community", tgt: "コミュニティ",
    whatJa: "タイトル画面のタブは「コミュニティ」、ほかの2か所は「コミュニティー」です。",
    whatEn: "The title-screen tab says 「コミュニティ」; the other two occurrences say 「コミュニティー」.",
    fix: "コミュニティ → コミュニティー（多数派の表記）", fixKind: "notation",
  },
  {
    file: "lib", line: 3778, rule: "notation.katakana", severity: "warning",
    src: "…The add-on ID is the folder name in your operating system’s file manager, not the add-on’s name.",
    tgt: "…アドオンの ID とは、アドオンの名称ではなく OS のファイルマネージャーでのアドオンのフォルダ名です。",
    whatJa: "ほかの2か所は「ファイルマネージャ」（長音なし）です。",
    whatEn: "The other two occurrences write 「ファイルマネージャ」 without the long-vowel mark.",
    fix: "ファイルマネージャー → ファイルマネージャ（多数派の表記）", fixKind: "notation",
  },
  {
    file: "httt", line: 505, rule: "voice.first-person", severity: "info",
    src: "I have... have failed in my duty to protect the Prince! I am defeated.",
    tgt: "私は……私は王子を守るという義務を果たす事ができなかった！ 私は敗れてしまった。",
    whatJa: "Delfador の一人称は、一人称のある67行のうち66行が「わし」で、この行だけ「私」です。",
    whatEn: "Delfador says 「わし」 in 66 of his 67 lines with a first-person pronoun; this line alone uses 「私」.",
    fix: "わしは……わしは王子を守るという義務を果たす事ができなかった！ わしは敗れてしまった。", fixKind: "translate",
  },
];

// ---------- verify (optional) ----------
function poEntries(text) {
  // Map: line of msgid/msgctxt → { msgid, msgstr } (strings joined, escapes decoded loosely).
  const lines = text.split("\n");
  const map = new Map();
  const unq = (l) => JSON.parse(l.replace(/^[^"]*/, "").trim());
  for (let i = 0; i < lines.length; i++) {
    if (!/^msgid /.test(lines[i])) continue;
    let j = i;
    let id = unq(lines[j]);
    while (j + 1 < lines.length && /^"/.test(lines[j + 1])) id += unq(lines[++j]);
    let str = "";
    while (j + 1 < lines.length && !/^msgstr/.test(lines[j + 1]) && lines[j + 1].trim() !== "") j++;
    if (j + 1 < lines.length && /^msgstr/.test(lines[j + 1])) {
      str = unq(lines[++j]);
      while (j + 1 < lines.length && /^"/.test(lines[j + 1])) str += unq(lines[++j]);
    }
    map.set(i + 1, { msgid: id, msgstr: str });
  }
  return map;
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
  const rows = Object.fromEntries(report.tables.map((t) => [t.file.includes("/httt/") ? "httt" : "lib", t.rows]));
  for (const k of Object.keys(FILES)) if (rows[k] !== FILES[k].rows) throw new Error(`${k}: rows ${rows[k]}`);
  const po = { httt: poEntries(readFileSync(join(dir, "httt/ja.po"), "utf8")), lib: poEntries(readFileSync(join(dir, "lib/ja.po"), "utf8")) };
  const fits = (excerpt, full) => excerpt.split("…").filter(Boolean).every((part) => full.includes(part));
  for (const it of ITEMS) {
    const f = report.findings.find((x) => x.file.includes(`/${it.file}/`) && x.line === it.line && x.rule === it.rule && x.severity === it.severity);
    if (!f) throw new Error(`no finding ${it.file}:${it.line} ${it.rule}`);
    const e = po[it.file].get(it.line);
    if (!e) throw new Error(`no msgid at ${it.file}:${it.line}`);
    if (!fits(it.src, e.msgid)) throw new Error(`source excerpt mismatch at ${it.file}:${it.line}`);
    if (it.tgt ? !fits(it.tgt, e.msgstr) : e.msgstr !== "") throw new Error(`target excerpt mismatch at ${it.file}:${it.line}`);
  }
  console.log(`verify: ok (${report.findings.length} findings, ${ITEMS.length} items checked against ${dir})`);
}

// ---------- render ----------
for (const it of ITEMS) {
  if (it.src.length > 120 || it.tgt.length > 120) throw new Error(`excerpt over 120 chars at ${it.file}:${it.line}`);
  if (!RULES[it.rule] || !SEV[it.severity]) throw new Error(`unknown rule/severity at ${it.file}:${it.line}`);
}
if (ITEMS.length !== 20) throw new Error(`expected 20 items, got ${ITEMS.length}`);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const bi = (ja, en, tag = "span", cls = "") => {
  const c = cls ? ` ${cls}` : "";
  return `<${tag} class="t${c}" lang="ja">${ja}</${tag}><${tag} class="t${c}" lang="en">${en}</${tag}>`;
};
const lineUrl = (file, line) => `${REPO}/blob/${SHA}/${FILES[file].path}#L${line}`;
const shortPath = (file) => FILES[file].path.replace(/^po\//, "");

const total = TOTALS.errors + TOTALS.warnings + TOTALS.infos;
const rowsTotal = FILES.httt.rows + FILES.lib.rows;
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

const TITLE_JA = "サンプル監査レポート — Kotomark（仮称）";
const TITLE_EN = "Sample audit report — Kotomark (working name)";
const DESC_JA = `Battle for Wesnoth の日本語訳（${fmt(rowsTotal)}件の文字列）を Kotomark で検査した結果のサンプル。直すべき問題20件を、原文・訳文・修正案付きで掲載。`;
const DESC_EN = `Sample: Kotomark run on the Japanese translation of Battle for Wesnoth (${fmt(rowsTotal)} strings). 20 issues worth fixing, with source, target and a suggested fix.`;

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
    <p class="eyebrow">${bi("サンプル監査レポート", "Sample audit report")} · Battle for Wesnoth · EN → JA</p>
    <h1 id="title">${bi(
      `${fmt(rowsTotal)}件の翻訳文字列から、直すべき問題を見つける`,
      `Finding what to fix in ${fmt(rowsTotal)} translated strings`,
    )}</h1>
    <p class="lede">${bi(
      `オープンソースのゲーム <strong>Battle for Wesnoth</strong> の日本語訳（2ファイル・${fmt(rowsTotal)}件の文字列）を Kotomark で検査すると、<strong>${fmt(total)}件の指摘</strong>（エラー${TOTALS.errors}・警告${TOTALS.warnings}・参考${TOTALS.infos}）が出ました。そのうち、ローカライズ責任者がまず見るべき<strong>20件</strong>を、原文・訳文・修正案付きで掲載します。`,
      `Kotomark run on the Japanese translation of the open-source game <strong>Battle for Wesnoth</strong> (2 files, ${fmt(rowsTotal)} strings) returned <strong>${fmt(total)} findings</strong> (${TOTALS.errors} errors, ${TOTALS.warnings} warnings, ${TOTALS.infos} info). Below are the <strong>20</strong> a localization lead should look at first, each with source, target and a suggested fix.`,
    )}</p>
    <p class="facts">${bi(
      `対象：<a href="${REPO}/blob/${SHA}/${FILES.httt.path}">${FILES.httt.path}</a>（${FILES.httt.ja}、${fmt(FILES.httt.rows)}件）・<a href="${REPO}/blob/${SHA}/${FILES.lib.path}">${FILES.lib.path}</a>（${FILES.lib.ja}、${fmt(FILES.lib.rows)}件）、コミット <code>${SHA.slice(0, 7)}</code>。${RUN_DATE} 実行、既定の設定・用語集なし。`,
      `Files: <a href="${REPO}/blob/${SHA}/${FILES.httt.path}">${FILES.httt.path}</a> (${FILES.httt.en}, ${fmt(FILES.httt.rows)} strings) and <a href="${REPO}/blob/${SHA}/${FILES.lib.path}">${FILES.lib.path}</a> (${FILES.lib.en}, ${fmt(FILES.lib.rows)} strings), commit <code>${SHA.slice(0, 7)}</code>. Run on ${RUN_DATE} with default settings and no glossary.`,
    )}</p>
    <ul class="stats" aria-label="${esc("Summary / 概要")}">
      <li class="stat"><span class="n">${fmt(rowsTotal)}</span><span class="l">${bi("検査した文字列", "strings checked")}</span></li>
      <li class="stat s-error"><span class="n">${TOTALS.errors}</span><span class="l">${bi("エラー", "errors")}</span></li>
      <li class="stat s-warning"><span class="n">${TOTALS.warnings}</span><span class="l">${bi("警告", "warnings")}</span></li>
      <li class="stat"><span class="n">${TOTALS.infos}</span><span class="l">${bi("参考", "info")}</span></li>
      <li class="stat"><span class="n">20</span><span class="l">${bi("このページに掲載（確認済み）", "shown here (checked)")}</span></li>
    </ul>
  </div>
</section>

<section class="band alt" aria-labelledby="counts-title">
  <div class="wrap">
    <h2 id="counts-title">${bi("指摘の内訳", "Findings by check")}</h2>
    <p>${bi(
      "大半は未翻訳と「古い訳のまま」（原文が変わったあと訳が更新されていない行）です。表記揺れ・変数・タグの指摘は数こそ少ないものの、画面の不具合や誤訳につながります。",
      "Most findings are untranslated or stale strings (the source changed and the translation was not updated). Notation, placeholder and tag findings are fewer, but they lead to on-screen bugs or wrong text.",
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
          <tr><th scope="row">${bi("合計", "Total")}</th><td>${TOTALS.errors}</td><td>${TOTALS.warnings}</td><td>${TOTALS.infos}</td><td>${fmt(total)}</td><td>20</td></tr>
        </tfoot>
      </table>
    </div>
    <p class="table-note">${bi(
      `重大度は Kotomark の既定の区分です。${FUZZY_JA}`,
      `Severities are Kotomark's defaults. ${FUZZY_EN}`,
    )}</p>
  </div>
</section>

<section class="band" aria-labelledby="top-title">
  <div class="wrap">
    <h2 id="top-title">${bi("直すべき問題 20件", "20 issues worth fixing")}</h2>
    <p>${bi(
      "重大度が高く、判断に迷わないものを、検査の種類が偏らないように選びました。行番号のリンクは固定コミットの GitHub 上の該当行を開きます。原文・訳文は Battle for Wesnoth の作者・翻訳者によるもので、短い抜粋として引用しています（GPL-2.0-or-later）。",
      "Picked for severity and clarity, spread across check types. Each line link opens that line on GitHub at the pinned commit. Source and target text is by the Battle for Wesnoth authors and translators, quoted as short excerpts (GPL-2.0-or-later).",
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
        `Kotomark のコマンドライン版を既定の設定・用語集なしで実行しました（<code>kotomark check httt/ja.po lib/ja.po --no-glossary</code>、${RUN_DATE}）。用語集を使う検査（用語・敬称など）はこの結果に含まれません。`,
        `Kotomark's command-line tool was run with default settings and no glossary (<code>kotomark check httt/ja.po lib/ja.po --no-glossary</code>, ${RUN_DATE}). Glossary-based checks (terms, honorifics, etc.) are not part of this result.`,
      )}</li>
      <li>${bi(
        "掲載した20件は、Kotomark の社内の AI 評価者が原文と訳文を読んで選び、1件ずつ確認したものです。人による確認ではありません。判断に迷うものは外しました。",
        "The 20 issues were picked and checked one by one by Kotomark's in-house AI evaluator, which read each source and target. They were not reviewed by a person. Anything doubtful was left out.",
      )}</li>
      <li>${bi(
        `修正案は AI の提案です。訳文の提案は、プロジェクトの用語・文体に合わせて翻訳者が確認してから使ってください。掲載していない残り${fmt(total - 20)}件は、この資料のためには確認していません。`,
        `Suggested fixes are AI suggestions. Have a translator check any suggested translation against the project's terminology and style before using it. The other ${fmt(total - 20)} findings were not checked for this report.`,
      )}</li>
      <li>${bi(
        "この結果はこの2ファイルについてのもので、他のプロジェクトでの精度を示すものではありません。なお、Battle for Wesnoth の翻訳ファイルは Kotomark の調整（誤検知の修正）に使ったことがあります。",
        "These results are about these two files only and say nothing about accuracy on other projects. Note that Battle for Wesnoth's translation files have been used to tune Kotomark (to fix false positives).",
      )}</li>
      <li>${bi(
        `データの出典：<a href="${REPO}">Battle for Wesnoth</a>、コミット <a href="${REPO}/tree/${SHA}"><code>${SHA}</code></a>。ライセンスは GPL-2.0-or-later です。引用した原文・訳文の著作権は Battle for Wesnoth の作者・翻訳者にあり、同じライセンスで提供されています。Battle for Wesnoth プロジェクトが Kotomark を推奨・承認しているわけではありません。名前は出典を示すためにだけ使っています。`,
        `Data source: <a href="${REPO}">Battle for Wesnoth</a>, commit <a href="${REPO}/tree/${SHA}"><code>${SHA}</code></a>, licensed GPL-2.0-or-later. The quoted source and target excerpts are by the Battle for Wesnoth authors and translators and are available under that license. The Battle for Wesnoth project has not endorsed Kotomark; the name is used only to identify the source.`,
      )}</li>
      <li>${bi(
        "Kotomark はソース公開のソフトウェアです（オープンソースではありません）。「Kotomark」は仮称で、名称は変わる可能性があります。",
        "Kotomark is source-available software (it is not open source). “Kotomark” is a working name and may change.",
      )}</li>
    </ul>
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
      "「Kotomark」は仮称です。商標の確認が済んでいないため、名称は変わる可能性があります。Kotomark は独立した製品で、Battle for Wesnoth プロジェクトやAI提供元とは提携していません。",
      "“Kotomark” is a working name; the trademark check is not finished, so the name may change. Kotomark is an independent product, not affiliated with the Battle for Wesnoth project or any AI provider.",
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
