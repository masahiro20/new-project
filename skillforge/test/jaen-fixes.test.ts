// Regressions from the JA→EN evaluation (eval/synthetic-jaen/fixes.md, eval/misskey/fp-patterns.md).
// All fixtures are small hand-written lines, not copies of the evaluated data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlossary, runChecks, type Glossary, type Row, type Table } from "../src/core/index.js";
import { containsPhrase } from "../src/core/text.js";
import { findCharacter } from "../src/core/checks/names.js";
import { firstPersonPronouns, politeness } from "../src/core/checks/voice.js";

function table(rows: [string | undefined, string, string][], file = "script.csv"): Table {
  const rs: Row[] = rows.map(([speaker, source, target], i) => ({ file, line: i + 2, id: `l${i}`, speaker, source, target }));
  return { file, format: "csv", sourceLang: "ja", targetLang: "en", rows: rs };
}

const glossary = (g: object): Glossary => parseGlossary(JSON.stringify(g));
const run = (rows: [string | undefined, string, string][], g: Glossary) => runChecks([table(rows)], g).findings;
const lines = (fs: ReturnType<typeof run>, rule: string, severity?: string) =>
  fs.filter((f) => f.rule === rule && (!severity || f.severity === severity)).map((f) => f.line);

const CHARS = {
  honorificPolicy: "localize",
  terms: [],
  characters: [
    { id: "ceres", ja: "セレス", en: "Ceres", voice: { ja: { firstPerson: ["わたくし"], politeness: "polite" } } },
    { id: "gald", ja: "ガルド", en: "Gald", voice: { ja: { firstPerson: ["俺"], politeness: "plain" } } },
    { id: "rin", ja: "リン", en: "Rin" },
    { id: "mio", ja: "ミオ", en: "Mio" },
    { id: "zeno", ja: "ゼノ", en: "Zeno", voice: { ja: { firstPerson: ["余"] } } },
  ],
};

// ---------- 1. English inflection on the translation side ----------

test("term matching (EN target): plural folds both ways and verb forms of the last word count", () => {
  const yes: [string, string][] = [
    ["Note black hole", "notes"], ["Renoted.", "Renote"], ["can't be renoted", "Renote"], ["Renoting", "Renote"],
    ["reacted", "reaction"], ["React on a note", "reaction"], ["Federating", "federation"],
    ["reactions", "react"], ["deletion", "Delete"], ["banned", "ban"], ["detailed", "details"], ["Sacred Trees", "Sacred Tree"],
  ];
  for (const [text, term] of yes) assert.ok(containsPhrase(text, term, "en", false, true), `${term} ~ ${text}`);
  const no: [string, string][] = [["Stoner", "Stone"], ["Reactor", "react"], ["notably", "note"], ["state", "station"], ["Renotes", "Note"]];
  for (const [text, term] of no) assert.ok(!containsPhrase(text, term, "en", false, true), `${term} !~ ${text}`);
  // Strict matching (source side, forbidden variants, names) is unchanged.
  assert.ok(!containsPhrase("Renoted.", "Renote", "en"));
});

test("term.missing: inflected renderings pass; a forbidden variant that inflects the approved one is still caught", () => {
  const g = glossary({
    terms: [
      { source: "リノート", target: "Renote" },
      { source: "連合", target: "federation" },
      { source: "封印", target: "seal", forbidden: ["sealed"] },
    ],
  });
  const f = run([
    [undefined, "リノートしました。", "Renoted."],
    [undefined, "連合しています", "Federating"],
    [undefined, "封印を解く", "Break the sealed one"],
    [undefined, "封印", "Seals"],
  ], g);
  assert.deepEqual(lines(f, "term.missing"), []);
  assert.deepEqual(lines(f, "term.forbidden"), [4]);
});

// ---------- 2. Speaker labels ----------

test("speaker labels: bracketed titles and hiragana resolve to the character and report as speaker-label", () => {
  const g = glossary(CHARS);
  for (const label of ["ガルド（騎士長）", "ガルド(騎士長)", "ガルド【騎士長】", "Gald (armored)"]) assert.equal(findCharacter(g, label)?.id, "gald", label);
  assert.equal(findCharacter(g, "りん")?.id, "rin");
  assert.equal(findCharacter(g, "（騎士長）"), undefined);
  const f = run([
    ["ガルド", "行くぞ。", "Let's go."],
    ["ガルド", "下がれ。", "Stand back."],
    ["ガルド（騎士長）", "任せろ。", "Leave it to me."],
    ["リン", "はい。", "Yes."],
    ["リン", "了解です。", "Understood."],
    ["りん", "見てください。", "Look."],
    ["せれず", "見てください。", "Look."],
  ], g);
  assert.deepEqual(lines(f, "name.speaker-label").sort(), [4, 7]);
  // せれず is not a character but one kana from セレス after the hiragana fold.
  assert.deepEqual(lines(f, "name.speaker-unknown"), [8]);
});

test("speaker labels: numbered generic speakers are not merged by the title strip", () => {
  const f = run([
    ["兵士（A）", "止まれ。", "Halt."],
    ["兵士（B）", "通せ。", "Let them pass."],
  ], glossary(CHARS));
  assert.deepEqual(lines(f, "name.speaker-label"), []);
});

// ---------- 3. First-person pronouns ----------

test("first person: 余 / 我 / 吾 are detected, lookalikes are not", () => {
  assert.deepEqual(firstPersonPronouns("余が先頭だ。"), ["余"]);
  assert.deepEqual(firstPersonPronouns("我は王なり。"), ["我"]);
  assert.deepEqual(firstPersonPronouns("吾は行く。"), ["吾"]);
  for (const s of ["余計なことを言うな。", "余裕だな。", "余りものだ。", "我慢しろ。", "我々の勝ちだ。", "我が国を守れ。", "我らの手で。", "十余の兵が来た。", "10余、残っている。"]) {
    assert.deepEqual(firstPersonPronouns(s), [], s);
  }
});

test("first person: わたくし / わたし / あたし after an attributive ending, without kana lookalikes", () => {
  assert.deepEqual(firstPersonPronouns("巫女であるわたくしが参ります。"), ["わたくし"]);
  assert.deepEqual(firstPersonPronouns("巫女であるわたしが参ります。"), ["わたし"]);
  assert.deepEqual(firstPersonPronouns("戦うあたしを見て！"), ["あたし"]);
  assert.deepEqual(firstPersonPronouns("弱いわたしを笑え。"), ["わたし"]);
  for (const s of ["橋を渡しておいた。", "私服で来た。", "見わたしても誰もいない。", "まあたしかにそうだ。", "いたします。"]) {
    assert.deepEqual(firstPersonPronouns(s), [], s);
  }
});

test("first person: a pronoun named only in a profile is always detected", () => {
  assert.deepEqual(firstPersonPronouns("朕が許す。"), []);
  assert.deepEqual(firstPersonPronouns("朕が許す。", ["朕"]), ["朕"]);
  const f = run([
    ["ガルド", "余が先頭だ。", "I'll take point."],
    ["ゼノ", "余に従え。", "Follow me."],
  ], glossary(CHARS));
  assert.deepEqual(lines(f, "voice.first-person"), [2]);
});

// ---------- 4. Politeness ----------

test("politeness: plain verb endings count only for characters whose profile sets politeness", () => {
  assert.equal(politeness("道が途切れている。"), undefined);
  assert.equal(politeness("道が途切れている。", true), "plain");
  assert.equal(politeness("もう行った。", true), "plain");
  assert.equal(politeness("誰もいない。", true), "plain");
  assert.equal(politeness("道が途切れています。", true), "polite");
  for (const s of ["ありがとう。", "おはよう。", "あなた。", "また。", "そう。"]) assert.equal(politeness(s, true), undefined, s);
  const f = run([
    ["セレス", "道が途切れている。", "The path ends here."],
    ["セレス", "参りましょう。", "Let us go."],
    ["ミオ", "道が途切れている。", "The path ends here."],
  ], glossary(CHARS));
  assert.deepEqual(lines(f, "voice.politeness"), [2]);
});

// ---------- 5. Honorifics ----------

test("honorific.drift: policy-violating forms never set the majority; a tie names no majority", () => {
  const g = glossary(CHARS);
  // Rin → Gald (さん): Sir Gald ×1, Gald ×1, Gald-san ×1 (policy error). No majority: info only, no advice.
  const tie = run([
    ["リン", "ガルドさん、行きましょう。", "Sir Gald, let's go."],
    ["リン", "ガルドさん、お願いします。", "Gald, please."],
    ["リン", "ガルドさん、ありがとう。", "Thank you, Gald-san."],
  ], g);
  assert.deepEqual(lines(tie, "honorific.policy"), [4]);
  assert.deepEqual(lines(tie, "honorific.drift", "warning"), []);
  assert.deepEqual(lines(tie, "honorific.drift", "info").sort(), [2, 3]);
  assert.ok(tie.every((x) => x.rule !== "honorific.drift" || x.expected === undefined));
  // With a real majority the violating form still gets pointed at it.
  const maj = run([
    ["リン", "ガルドさん、行きましょう。", "Sir Gald, let's go."],
    ["リン", "ガルドさん、お願いします。", "Sir Gald, please."],
    ["リン", "ガルドさん、ありがとう。", "Thank you, Gald-san."],
    ["リン", "ガルドさん、待って。", "Gald, wait."],
  ], g);
  assert.deepEqual(lines(maj, "honorific.drift", "warning"), [4, 5]);
  assert.ok(lines(maj, "honorific.drift").length === 2);
  assert.ok(maj.filter((x) => x.rule === "honorific.drift").every((x) => x.expected === "Sir Gald"));
});

test("honorific.drift: a name dropped in English (title-only address) is info next to name.missing", () => {
  const f = run([
    ["ミオ", "セレス様、こちらです。", "This way, Lady Ceres."],
    ["ミオ", "セレス様、大丈夫？", "Lady Ceres, are you okay?"],
    ["ミオ", "セレス様、見て！", "Look, Lady Ceres!"],
    ["ミオ", "セレス様、お下がりください。", "Please stand back, Your Highness."],
    ["ミオ", "セレス様、ごめん。", "Sorry, Lady Ceris."],
  ], glossary(CHARS));
  assert.deepEqual(lines(f, "honorific.drift", "info"), [5]);
  assert.equal(f.find((x) => x.rule === "honorific.drift")!.expected, "Lady Ceres");
  assert.deepEqual(lines(f, "name.missing"), [5, 6]);
  // Plain addresses (呼び捨て) never trigger it.
  const plain = run([
    ["ガルド", "セレス、行くぞ。", "Ceres, let's go."],
    ["ガルド", "セレス、下がれ。", "Ceres, stand back."],
    ["ガルド", "セレス、待て。", "Wait, my lady."],
  ], glossary(CHARS));
  assert.deepEqual(lines(plain, "honorific.drift"), []);
});
