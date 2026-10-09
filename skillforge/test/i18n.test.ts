import { test } from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { parseGlossary, parseTable, renderMarkdown, runChecks, type CheckResult, type Locale } from "../src/core/index.js";
import { messages, type Messages } from "../src/core/i18n.js";
import { find, read } from "./helpers.js";

const JAPANESE = /[ぁ-ゖァ-ヺ一-鿿]/;
const ENGLISH_TEMPLATE = /rendered as|glossary says|does not use|appears in|differs from|looks like|is not in|policy is|uses "|this line|never uses|should not say|missing |unexpected |Unbalanced|exceeds|Malformed|copied into|is not kana|wide chars/i;

function run(tables: string[], glossary: string, locale?: Locale, wideAsTwo?: boolean): CheckResult {
  return runChecks(
    tables.map((t) => parseTable(read(t), basename(t))),
    parseGlossary(read(glossary), glossary),
    { locale, wideAsTwo },
  );
}

/** Everything except the localized text: messages and the voice packets' `flagged` notes (which reuse them). */
const strip = (r: CheckResult) => ({
  ...r,
  findings: r.findings.map(({ message: _m, ...rest }) => rest),
  reviewPackets: r.reviewPackets.map((p) => ({ ...p, lines: p.lines.map(({ flagged: _f, ...l }) => ({ ...l, flagged: !!_f })) })),
});

const SETS: [string[], string][] = [
  [["samples/ja-en/script.csv", "samples/ja-en/ch2.json"], "samples/ja-en/glossary.json"],
  [["samples/en-ja/ui.xlf"], "samples/en-ja/glossary.json"],
];

for (const [tables, glossary] of SETS) {
  for (const wide of [false, true]) {
    test(`locale ja: ${tables.join(" + ")}${wide ? " (wide)" : ""} has the same findings, only messages differ`, () => {
      const en = run(tables, glossary, undefined, wide);
      const enExplicit = run(tables, glossary, "en", wide);
      const ja = run(tables, glossary, "ja", wide);
      assert.deepEqual(enExplicit, en);
      assert.deepEqual(strip(ja), strip(en));
      assert.ok(ja.findings.length > 0);
      for (const f of ja.findings) {
        assert.match(f.message, JAPANESE, `${f.rule}: ${f.message}`);
        assert.doesNotMatch(f.message, ENGLISH_TEMPLATE, `${f.rule}: ${f.message}`);
      }
      // Voice packets' flagged notes are the (localized) messages.
      const flagged = ja.reviewPackets.flatMap((p) => p.lines.map((l) => l.flagged)).filter(Boolean);
      for (const n of flagged) assert.match(n!, JAPANESE);
    });
  }
}

test("locale ja: exact wording for term.forbidden and length", () => {
  const ja = run(["samples/ja-en/script.csv"], "samples/ja-en/glossary.json", "ja", true);
  assert.equal(find(ja, "term.forbidden")[0]!.message, "「魔導石」が禁止訳「Magic Stone」で訳されています。用語集の訳は「Mana Stone」です。");
  assert.match(find(ja, "length.limit")[0]!.message, /^文字数\d+が上限30を超えています（全角は2文字として計算）。$/);
});

test("every ja message template is Japanese and free of English template words", () => {
  const ja = messages("ja");
  const en = messages("en");
  const calls: Record<keyof Messages, (m: Messages) => string> = {
    termForbidden: (m) => m.termForbidden("魔導石", "Magic Stone", "Mana Stone"),
    termMissing: (m) => m.termMissing("魔導石", "Mana Stone"),
    termForbiddenStray: (m) => m.termForbiddenStray("Magic Stone", "Mana Stone", "魔導石"),
    termDirection: (m) => m.termDirection("en", "ja", "ja→en"),
    notationKatakana: (m) => m.notationKatakana("サーバ", "サーバー", 2),
    nameForbidden: (m) => m.nameForbidden("Lizette", "Lisette"),
    nameMissing: (m) => m.nameMissing("リゼット", ["Lisette", "Lise"]),
    nameNearMiss: (m) => m.nameNearMiss("Lisete", "Lisette"),
    nameSpeakerLabel: (m) => m.nameSpeakerLabel("MINA", "ミナ", 9),
    nameSpeakerUnknown: (m) => m.nameSpeakerUnknown("Minna"),
    honorificPolicyRomanized: (m) => m.honorificPolicyRomanized("Lisette-sama", "drop"),
    honorificPolicyKeep: (m) => m.honorificPolicyKeep("リゼット様", "Lady Lisette", "Lisette-sama"),
    honorificDrift: (m) => m.honorificDrift("Lisette", "様", "Lady Lisette", 3),
    honorificSourceShift: (m) => m.honorificSourceShift("さん", "様", 4),
    honorificSplit: (m) => m.honorificSplit("様", "Lady Lisette ×1 / Lisette ×1"),
    honorificNameDropped: (m) => m.honorificNameDropped("リゼット様", "Lady Lisette", 4),
    voiceFirstPersonProfile: (m) => m.voiceFirstPersonProfile("トビアス / Tobias", ["僕"], ["俺"]),
    voiceFirstPersonMajority: (m) => m.voiceFirstPersonMajority("トビアス / Tobias", ["僕"], "俺", 5, 6),
    voicePolitenessProfile: (m) => m.voicePolitenessProfile("リゼット / Lisette", "polite", "plain"),
    voicePolitenessMajority: (m) => m.voicePolitenessMajority("リゼット / Lisette", "plain", "polite", 7, 8),
    voiceContraction: (m) => m.voiceContraction("リゼット / Lisette", ["I'm", "we're"]),
    voiceAvoid: (m) => m.voiceAvoid("リゼット / Lisette", ["gonna"]),
    mismatch: (m) => m.mismatch(["{0}"], ["[PLAYER]"]),
    tagUnbalanced: (m) => m.tagUnbalanced(["<color>"]),
    rubyReading: (m) => m.rubyReading("ma", "魔"),
    rubyMalformed: (m) => m.rubyMalformed(),
    rubyLeak: (m) => m.rubyLeak(),
    lengthLimit: (m) => m.lengthLimit(40, 30, true),
    honorificTargetDrift: (m) => m.honorificTargetDrift("様", "Kalenz", "殿", 3),
    tagEmphasisDropped: (m) => m.tagEmphasisDropped(["<i>", "</i>"]),
    untranslatedEmpty: (m) => m.untranslatedEmpty(),
    untranslatedCopy: (m) => m.untranslatedCopy(),
    untranslatedFuzzy: (m) => m.untranslatedFuzzy(),
  };
  assert.deepEqual(Object.keys(calls).sort(), Object.keys(ja).sort());
  for (const [key, call] of Object.entries(calls)) {
    const s = call(ja);
    assert.match(s, JAPANESE, key);
    assert.doesNotMatch(s, ENGLISH_TEMPLATE, `${key}: ${s}`);
    assert.doesNotMatch(s, /"/, `${key} should quote with 「」: ${s}`);
    assert.notEqual(s, call(en), key);
  }
  assert.equal(ja.voicePolitenessProfile("X", "polite", "plain"), "X は丁寧体で話すキャラですが、この行は常体です。");
  assert.equal(ja.mismatch(["{0}"], []), "不足: {0}");
  assert.equal(en.mismatch(["{0}"], ["{1}"]), "missing {0}; unexpected {1}");
});

test("renderMarkdown locale ja: Japanese headings and labels; en unchanged", () => {
  const r = run(["samples/ja-en/script.csv", "samples/ja-en/ch2.json"], "samples/ja-en/glossary.json", "ja");
  const md = renderMarkdown(r, { locale: "ja" });
  assert.match(md, /^# 台本一貫性レポート\n/);
  for (const title of ["## 用語の訳揺れ", "## 表記揺れ", "## キャラ名の揺れ", "## 敬称の揺れ", "## 口調の揺れ", "## プレースホルダー", "## タグ", "## ルビ", "## 文字数制限"]) {
    assert.ok(md.includes(title), title);
  }
  assert.ok(md.includes("| チェック | ❌ エラー | ⚠️ 警告 | ℹ️ 情報 |"));
  assert.ok(md.includes("- 用語集: 用語5件、キャラクター3名"));
  assert.ok(md.includes("使用状況: "));
  assert.ok(md.includes("(訳文) — "));
  assert.ok(md.includes("## 要判断（レビューパケット）"));
  assert.doesNotMatch(md, /Script consistency report|Glossary:|Usage:|\(target\)|Needs judgement/);

  const en = run(["samples/ja-en/script.csv", "samples/ja-en/ch2.json"], "samples/ja-en/glossary.json");
  assert.equal(renderMarkdown(en, { locale: "en" }), renderMarkdown(en));
  assert.match(renderMarkdown(en), /^# Script consistency report\n/);
});

test("TSV tables report format tsv (by extension or explicit format) and the report shows TSV", () => {
  const tsv = "id\tspeaker\tsource\ttarget\nl1\tミナ\t魔導石だ。\tA Magic Stone.\n";
  const byName = parseTable(tsv, "lines.tsv");
  const byFormat = parseTable(tsv, "lines.txt", { format: "tsv" });
  assert.equal(byName.format, "tsv");
  assert.equal(byFormat.format, "tsv");
  assert.equal(parseTable("id,source,target\nl1,魔導石,Mana Stone\n", "lines.csv").format, "csv");
  const r = runChecks([byName], parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json"));
  assert.equal(r.tables[0]!.format, "tsv");
  assert.ok(renderMarkdown(r).includes("- **lines.tsv** — TSV, 1 rows, ja → en"));
  assert.equal(find(r, "term.forbidden").length, 1);
});

test("MCP check(): options.locale ja localizes messages, default stays en", async () => {
  const { check, devContext } = await import("../src/server/tools.js");
  const args = {
    tables: [{ filename: "script.csv", content: read("samples/ja-en/script.csv") }],
    glossary: { filename: "glossary.json", content: read("samples/ja-en/glossary.json") },
  };
  const en = await check(devContext(), args);
  const ja = await check(devContext(), { ...args, options: { locale: "ja" } });
  assert.match(find(en, "term.forbidden")[0]!.message, /glossary says/);
  assert.match(find(ja, "term.forbidden")[0]!.message, /用語集の訳は/);
  assert.deepEqual(strip(ja), strip(en));
});
