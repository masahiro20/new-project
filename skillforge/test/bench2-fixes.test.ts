// Regressions for the gaps found by synthetic benchmark #2 (eval/synthetic-jaen-2/fixes.md).
// Every fixture is a small hand-written line; none is copied from the benchmark, which stays a held-out test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlossary, runChecks, type Glossary, type Row, type Table } from "../src/core/index.js";
import { findCharacter } from "../src/core/checks/names.js";
import { rubyProblems } from "../src/core/checks/rules.js";
import { kanaMix } from "../src/core/checks/terms.js";
import { firstPersonPronouns, superiorAddressed, withoutQuotations } from "../src/core/checks/voice.js";

type R = [string | undefined, string, string];

function table(rows: R[], sourceLang: "ja" | "en" = "ja", file = "script.csv"): Table {
  const rs: Row[] = rows.map(([speaker, source, target], i) => ({ file, line: i + 2, id: `l${i}`, speaker, source, target }));
  return { file, format: "csv", sourceLang, targetLang: sourceLang === "ja" ? "en" : "ja", rows: rs };
}
const glossary = (g: object): Glossary => parseGlossary(JSON.stringify(g));
const run = (rows: R[], g: Glossary = glossary({}), sourceLang: "ja" | "en" = "ja") => runChecks([table(rows, sourceLang)], g).findings;
const at = (fs: ReturnType<typeof run>, rule: string, severity?: string) =>
  fs.filter((f) => f.rule === rule && (!severity || f.severity === severity)).map((f) => f.line);

const CAST = {
  honorificPolicy: "keep",
  terms: [
    { source: "図書室", target: "library" },
    { source: "ヘッドフォン", target: "headphones" },
  ],
  characters: [
    { id: "taiga", ja: "大河", en: "Taiga", voice: { ja: { firstPerson: ["俺"], politeness: "plain" } } },
    { id: "nozomi", ja: "希", en: "Nozomi", voice: { ja: { firstPerson: ["うち"], politeness: "plain" } } },
    { id: "akane", ja: "茜", en: "Akane", voice: { ja: { firstPerson: ["あたし"] } } },
    { id: "saeki", ja: "佐伯", en: "Saeki" },
    { id: "tsumugi", ja: "紬", en: "Tsumugi", reading: "つむぎ" },
  ],
};
const cast = glossary(CAST);

// ---------- 1. first-person pronouns: quotations and うちの ----------

test("withoutQuotations: quotes inside a line are removed, a line that is one quotation is unwrapped", () => {
  assert.equal(withoutQuotations("手紙に『俺が勝つ』と書いてあった。"), "手紙に〓と書いてあった。");
  assert.equal(withoutQuotations("「あいつ、『僕』って言ったの？」って聞かれた。"), "〓って聞かれた。");
  assert.equal(withoutQuotations("「俺が行く」"), "俺が行く");
  assert.equal(withoutQuotations("大河「俺が行く」。"), "大河 俺が行く");
  assert.equal(withoutQuotations("“僕”なんて柄じゃない。"), "〓なんて柄じゃない。");
  // A quote continued from the previous row (no opening bracket) is left alone.
  assert.equal(withoutQuotations("俺が行くって言ってるだろ」"), "俺が行くって言ってるだろ」");
});

test("voice.first-person: pronouns quoted or mentioned as words are not the speaker's", () => {
  const fs = run([
    ["大河", "あいつのメモには『僕は先に帰る』としか書いてない。", "His note just says 'I'm heading home first.'"],
    ["大河", "『私』って書く男子もいるだろ。", "Some guys write 'watashi' too."],
    ["茜", "先輩、さっき『わし』って言いました？", "Did you just say 'washi'?"],
    ["大河", "僕が行くよ。", "I'll go."],
  ], cast);
  assert.deepEqual(at(fs, "voice.first-person"), [5]);
});

test("voice.first-person: うちの + noun is possessive (our club), うちは / うちが is the pronoun", () => {
  assert.deepEqual(firstPersonPronouns("うちの図書室は狭いからな。"), []);
  assert.deepEqual(firstPersonPronouns("今度うちに来いよ。"), []);
  assert.deepEqual(firstPersonPronouns("うちは平気やで。"), ["うち"]);
  assert.deepEqual(firstPersonPronouns("うちら、もう帰るわ。"), ["うち"]);
  const fs = run([
    ["大河", "うちのクラス、今日は早上がりだ。", "Our class gets out early today."],
    ["希", "うちが先に見つけたんや。", "I found it first."],
    ["希", "うちの部、ほんまにおもろいわ。", "Our club's a riot."],
  ], cast);
  // Taiga's うちの is not checked against his 俺 profile, Nozomi's うちが matches hers.
  assert.deepEqual(at(fs, "voice.first-person"), []);
});

// ---------- 2. politeness toward a teacher / senior ----------

test("voice.politeness: a plain speaker's keigo to a teacher or senior is info, other polite lines stay warnings", () => {
  assert.equal(superiorAddressed("はい、わかりました、先生。"), "先生");
  assert.equal(superiorAddressed("先輩方、お疲れさまです。"), "先輩");
  assert.equal(superiorAddressed("佐伯先生の車ですか。"), undefined);
  assert.equal(superiorAddressed("そうですか。", "部長"), "部長");
  const fs = run([
    ["大河", "はい、わかりましたよ、先生。", "Yes, I got it, Sensei."],
    ["大河", "佐伯先生の車が停まってますね。", "Saeki-sensei's car is parked there."],
    ["大河", "それ、俺がやっとくよ。", "I'll take care of it."],
  ], cast);
  assert.deepEqual(at(fs, "voice.politeness", "info"), [2]);
  assert.deepEqual(at(fs, "voice.politeness", "warning"), [3]);
});

// ---------- 3. glossary term inside a longer kanji compound ----------

test("term.missing: a term found only inside a longer kanji compound is info; on its own it stays a warning", () => {
  const fs = run([
    [undefined, "図書室棟の裏で待ち合わせた。", "We met behind the library annex."],
    [undefined, "図書室長に挨拶した。", "I greeted the head librarian."],
    [undefined, "図書室で本を読んだ。", "I read a book in the reading room."],
    [undefined, "図書室長が図書室にいた。", "The head librarian was in the reading room."],
  ], cast);
  assert.deepEqual(at(fs, "term.missing", "info"), [3]);
  assert.deepEqual(at(fs, "term.missing", "warning"), [4, 5]);
});

// ---------- 4. honorific tie under "keep" ----------

test("honorific.drift: under keep, the policy form wins a tie and its lines are never reported", () => {
  const fs = run([
    ["茜", "佐伯先生、おはようございます！", "Good morning, Saeki-sensei!"],
    ["茜", "佐伯先生、待ってください！", "Wait, Mr. Saeki!"],
  ], cast);
  assert.deepEqual(at(fs, "honorific.policy"), [3]);
  assert.ok(!at(fs, "honorific.drift").includes(2), "the conforming line is not drift");
  // Without a policy the 1-vs-1 split is still reported on both lines (info).
  const free = run([
    ["茜", "佐伯先生、おはようございます！", "Good morning, Saeki-sensei!"],
    ["茜", "佐伯先生、待ってください！", "Wait, Mr. Saeki!"],
  ], glossary({ ...CAST, honorificPolicy: undefined }));
  assert.deepEqual(at(free, "honorific.drift", "info"), [2, 3]);
});

// ---------- 5. broken ruby ----------

test("ruby.malformed: unclosed brackets, empty readings and stray or full-width separators in every ruby syntax", () => {
  const kinds = (s: string) => rubyProblems(s).map(([k]) => k);
  assert.deepEqual(kinds("{雷鳴|らいめい}が響いた。"), []);
  assert.deepEqual(kinds("{雷鳴|らいめいが響いた。"), ["unclosed"]);
  assert.deepEqual(kinds("{雷鳴|}が響いた。"), ["empty-reading"]);
  assert.deepEqual(kinds("{|らいめい}が響いた。"), ["empty-base"]);
  assert.deepEqual(kinds("{雷鳴｜らいめい}が響いた。"), ["fullwidth-bar"]);
  assert.deepEqual(kinds("｜雷鳴《らいめい》が響いた。"), []);
  assert.deepEqual(kinds("雷鳴《らいめい》が響いた。"), []);
  assert.deepEqual(kinds("｜雷鳴《らいめいが響いた。"), ["unclosed"]);
  assert.deepEqual(kinds("｜雷鳴《》が響いた。"), ["empty-reading"]);
  assert.deepEqual(kinds("｜雷鳴が響いた。｜稲妻《いなずま》も。"), ["stray-separator"]);
  assert.deepEqual(kinds("ファイル｜編集"), [], "a ｜ on a line without 《》 is a divider, not ruby");
  assert.deepEqual(kinds("<ruby>雷鳴<rt></rt></ruby>"), ["empty-reading"]);
  assert.deepEqual(kinds("{rb}雷鳴{/rb}{rt}{/rt}"), ["empty-reading"]);
  assert.deepEqual(kinds("{0}と{name}を足す"), [], "placeholders are not ruby");

  const fs = run([
    [undefined, "{雷鳴|らいめいが響いた。", "Thunder rolled."],
    [undefined, "<ruby>雷鳴<rt>らいめい</ruby>が響いた。", "Thunder rolled."],
    [undefined, "{雷鳴|らいめい}が響いた。", "Thunder rolled."],
  ]);
  assert.deepEqual(at(fs, "ruby.malformed", "error"), [2, 3]);
});

// ---------- 6. untranslated: Japanese in the English column, neighbour copies ----------

test("untranslated.copy (JA→EN): an English column holding Japanese text is a warning; Latin text equal to the source is not", () => {
  const fs = run([
    [undefined, "放課後……？", "放課後……？"],
    [undefined, "設定", "せってい"],
    [undefined, "OK", "OK"],
    [undefined, "Q.E.D.", "Q.E.D."],
    [undefined, "「図書室」へ行く", "Go to the library (図書室)"],
  ]);
  assert.deepEqual(at(fs, "untranslated.copy", "warning"), [2, 3]);
});

test("untranslated.duplicate: a translation repeating the previous row's for a different source; short and stock lines are skipped", () => {
  const fs = run([
    [undefined, "雨が強くなってきたな。", "The rain's getting heavier."],
    [undefined, "傘を持ってくればよかった。", "The rain's getting heavier."],
    [undefined, "はい。", "Yes."],
    [undefined, "了解です。", "Yes."],
    [undefined, "……", "..."],
    [undefined, "……。", "..."],
    [undefined, "雨が強くなってきたなあ。", "It's really coming down now, isn't it."],
    [undefined, "雨が強くなってきたなぁ。", "It's really coming down now, isn't it."],
  ]);
  assert.deepEqual(at(fs, "untranslated.duplicate", "warning"), [3]);
});

// ---------- 7. katakana: small kana, glossary spelling, hiragana mixed in ----------

test("notation.katakana: a 1-vs-1 tie is settled by the standalone word; the glossary spelling wins when listed", () => {
  const a = run([
    [undefined, "ヘッドフォンを外した。", "I took off the headphones."],
    [undefined, "ヘッドホンをつけた。", "I put on the headphones."],
    [undefined, "ヴァイオリンケースを開けた。", "I opened the violin case."],
    [undefined, "バイオリンケースを閉じた。", "I closed the violin case."],
    [undefined, "古いバイオリンだ。", "An old violin."],
  ]);
  // Without a glossary ヘッドフォン / ヘッドホン are different keys (フォ ≠ ホ), so only the violin case is a group;
  // the standalone バイオリン decides it.
  assert.deepEqual(at(a, "notation.katakana"), [4]);

  const g = run([
    [undefined, "ヘッドフォーンを外した。", "I took off the headphones."],
    [undefined, "ヘッドフオンを外した。", "I took off the headphones."],
    [undefined, "ヘッドホンを外した。", "I took off the headphones."],
  ], cast);
  // Long-mark and small-vowel variants of the glossary's ヘッドフォン, even with no correct spelling in the script.
  // ヘッドホン (フォ → ホ) is a different spelling key and is not folded.
  assert.deepEqual(at(g, "notation.katakana"), [2, 3]);
  assert.match(g.find((f) => f.rule === "notation.katakana")!.message, /glossary spelling "ヘッドフォン"/);
});

test("notation.kana-mix: one hiragana inside or at the end of a katakana word; particles between katakana words are fine", () => {
  assert.deepEqual(kanaMix("ケーぶルを繋いだ。").map(([s, , e]) => [s, e]), [["ケーぶル", "ケーブル"]]);
  assert.deepEqual(kanaMix("ランプです。").length, 0);
  assert.deepEqual(kanaMix("ランぷです。").map(([, h]) => h), ["ぷ"]);
  for (const ok of ["ゲームとアニメ", "パンやケーキ", "メールをチェック", "ホテルへ行く", "ドンっ！", "三ヶ月", "ゲームしよう"]) {
    assert.deepEqual(kanaMix(ok), [], ok);
  }
  const fs = run([[undefined, "新しいスリッぱを買った。", "I bought new slippers."]]);
  assert.deepEqual(at(fs, "notation.kana-mix", "warning"), [2]);
});

// ---------- 8. kana speaker label through the reading ----------

test("speaker labels: a kana label resolves to a kanji-named character through `reading`", () => {
  assert.equal(findCharacter(cast, "つむぎ")?.id, "tsumugi");
  assert.equal(findCharacter(cast, "ツムギ")?.id, "tsumugi");
  assert.equal(findCharacter(glossary({ characters: [{ id: "t", ja: "紬", en: "Tsumugi" }] }), "つむぎ"), undefined);
  const fs = run([
    ["紬", "行こう。", "Let's go."],
    ["紬", "待って。", "Wait."],
    ["つむぎ", "ここだよ。", "Over here."],
  ], cast);
  assert.deepEqual(at(fs, "name.speaker-label"), [4]);
});
