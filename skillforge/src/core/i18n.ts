import type { Category, Locale, ReviewPacket, Side } from "./types.js";

/**
 * Finding messages and report labels per locale. The "en" entries are the original strings and must
 * stay byte-identical (tests, CLI and MCP output depend on them). Japanese entries quote with 「」.
 */
export interface Messages {
  termForbidden(source: string, found: string, target: string): string;
  termMissing(source: string, target: string): string;
  termForbiddenStray(found: string, target: string, source: string): string;
  termDirection(sourceLang: string, targetLang: string, glossaryDir: string): string;
  notationKatakana(surface: string, majority: string, count: number): string;
  nameForbidden(found: string, approved: string): string;
  nameMissing(ja: string, enNames: string[]): string;
  nameNearMiss(token: string, close: string): string;
  nameSpeakerLabel(label: string, majority: string, count: number): string;
  nameSpeakerUnknown(label: string): string;
  honorificPolicyRomanized(found: string, policy: string): string;
  honorificPolicyKeep(jaWithHonorific: string, found: string, expected: string): string;
  honorificDrift(form: string, jaHon: string, majority: string, count: number): string;
  honorificSourceShift(hon: string, majority: string, count: number): string;
  /** JA→EN: the forms used for one speaker → addressee + honorific are tied, so there is no majority to follow. */
  honorificSplit(jaHon: string, split: string): string;
  /** JA→EN: the Japanese has name + honorific but the English drops the name (title-only address). */
  honorificNameDropped(jaForm: string, majority: string, count: number): string;
  /** EN→JA: the same English form is dressed with a different Japanese honorific. */
  honorificTargetDrift(jaHon: string, enForm: string, majority: string, count: number): string;
  voiceFirstPersonProfile(name: string, odd: string[], expected: string[]): string;
  voiceFirstPersonMajority(name: string, odd: string[], majority: string, count: number, total: number): string;
  voicePolitenessProfile(name: string, expected: "polite" | "plain", actual: "polite" | "plain"): string;
  voicePolitenessMajority(name: string, actual: "polite" | "plain", want: "polite" | "plain", count: number, total: number): string;
  voiceContraction(name: string, found: string[]): string;
  voiceAvoid(name: string, found: string[]): string;
  /** placeholder.mismatch and tag.mismatch. */
  mismatch(missing: string[], extra: string[]): string;
  tagUnbalanced(tags: string[]): string;
  tagEmphasisDropped(tags: string[]): string;
  rubyReading(reading: string, base: string): string;
  rubyMalformed(): string;
  rubyLeak(): string;
  lengthLimit(length: number, max: number, wideAsTwo: boolean): string;
  untranslatedEmpty(): string;
  untranslatedCopy(): string;
  untranslatedFuzzy(): string;
  /** JA→EN: the English column holds Japanese text (copied source or never translated). */
  untranslatedJapanese(): string;
  /** The translation repeats the previous row's translation although the sources differ. */
  untranslatedDuplicate(prevLine: number, prevId: string): string;
  /** A plain-speech character uses polite forms in a line addressed to a teacher / senior. */
  voicePolitenessToSuperior(name: string, title: string): string;
  /** A Japanese glossary term only occurs inside a longer kanji compound the glossary does not list. */
  termMissingCompound(source: string, target: string, compound: string): string;
  /** Katakana spelling that differs from the glossary's spelling of the same word. */
  notationGlossary(surface: string, expected: string): string;
  /** A hiragana character inside or at the end of a katakana word (ルーぺ for ルーペ). */
  notationKanaMix(surface: string, hiragana: string, expected: string): string;
  /** Broken ruby markup other than <ruby>/<rt> tag counts: unclosed brackets, empty reading, stray separators. */
  rubyBroken(kind: RubyProblem, snippet: string): string;
}

/** What is wrong with a ruby annotation (ruby.malformed). */
export type RubyProblem = "unclosed" | "empty-reading" | "empty-base" | "fullwidth-bar" | "stray-separator";
const RUBY_PROBLEM_EN: Record<RubyProblem, string> = {
  unclosed: "the bracket is not closed",
  "empty-reading": "the reading is empty",
  "empty-base": "the base text is empty",
  "fullwidth-bar": "full-width ｜ inside {base|reading} (use ASCII |)",
  "stray-separator": "a ｜ separator with no 《reading》 after it",
};
const RUBY_PROBLEM_JA: Record<RubyProblem, string> = {
  unclosed: "括弧が閉じていません",
  "empty-reading": "読みが空です",
  "empty-base": "親文字が空です",
  "fullwidth-bar": "{親文字|読み} の区切りが全角の ｜ です（半角の | を使ってください）",
  "stray-separator": "区切りの ｜ の後に《読み》がありません",
};

const en: Messages = {
  termForbidden: (s, f, t) => `"${s}" is rendered as forbidden variant "${f}"; glossary says "${t}".`,
  termMissing: (s, t) => `Source contains "${s}" but the translation does not use "${t}".`,
  termForbiddenStray: (f, t, s) => `Forbidden variant "${f}" appears (glossary term "${t}") although the source has no "${s}".`,
  termDirection: (sl, tl, gd) =>
    `This table is ${sl}→${tl} but the glossary terms are ${gd}; term checks were skipped for it. Check the column order or use a matching glossary.`,
  notationKatakana: (s, m, n) => `Katakana spelling "${s}" differs from the majority form "${m}" (${n}×).`,
  nameForbidden: (f, a) => `Character name written as "${f}"; the approved spelling is "${a}".`,
  nameMissing: (ja, names) => `"${ja}" appears in the Japanese but "${names.join('" / "')}" does not appear in the English (fine if replaced by a pronoun).`,
  nameNearMiss: (t, c) => `"${t}" looks like a misspelling of "${c}". Add it to ignoreWords if it is a real word.`,
  nameSpeakerLabel: (l, m, n) => `Speaker label "${l}" differs from "${m}" used in ${n} other rows.`,
  nameSpeakerUnknown: (l) => `Speaker "${l}" is not in the character sheet and is one edit away from a known character.`,
  honorificPolicyRomanized: (f, p) => `Romanized honorific "${f}" but the project policy is "${p}".`,
  honorificPolicyKeep: (ja, f, e) => `Policy is "keep" but "${ja}" is rendered "${f}" (expected "${e}").`,
  honorificDrift: (form, jaHon, m, n) => `"${form}" here, but this speaker's "${jaHon}" is rendered "${m}" in ${n} other lines.`,
  honorificSplit: (jaHon, split) => `This speaker's "${jaHon}" is rendered inconsistently with no majority (${split}). Pick one form.`,
  honorificNameDropped: (ja, m, n) =>
    `"${ja}" is rendered without the name here, but as "${m}" in ${n} other lines by this speaker. Confirm the title-only address is intended.`,
  honorificSourceShift: (h, m, n) =>
    `In Japanese this speaker uses "${h}" here but "${m}" in ${n} other lines. Confirm it is an intentional shift (and that the English reflects it).`,
  honorificTargetDrift: (h, e, m, n) => `"${e}" is rendered with "${h}" here, but with "${m}" in ${n} other lines by this speaker.`,
  voiceFirstPersonProfile: (name, odd, exp) => `${name} uses "${odd.join(", ")}" but their profile says "${exp.join(", ")}".`,
  voiceFirstPersonMajority: (name, odd, m, n, total) => `${name} uses "${odd.join(", ")}" here but "${m}" in ${n} of ${total} lines.`,
  voicePolitenessProfile: (name, exp, p) => `${name} is written ${exp} but this line is ${p}.`,
  voicePolitenessMajority: (name, p, want, n, total) => `This line is ${p}; ${name} is ${want} in ${n} of ${total} lines.`,
  voiceContraction: (name, c) => `${name} never uses contractions, but this line has "${c.join('", "')}".`,
  voiceAvoid: (name, a) => `${name} should not say "${a.join('", "')}".`,
  mismatch: (missing, extra) =>
    [missing.length && `missing ${missing.join(" ")}`, extra.length && `unexpected ${extra.join(" ")}`].filter(Boolean).join("; "),
  tagUnbalanced: (tags) => `Unbalanced tags: ${tags.join(" ")}`,
  tagEmphasisDropped: (tags) => `Emphasis markup dropped in the translation: ${tags.join(" ")} (common in Japanese; check it is intended).`,
  rubyReading: (r, b) => `Ruby reading "${r}" for "${b}" is not kana.`,
  rubyMalformed: () => "Malformed <ruby>/<rt> markup.",
  rubyLeak: () => "Ruby markup copied into the English text.",
  lengthLimit: (n, max, wide) => `Length ${n} exceeds the limit of ${max}${wide ? " (wide chars count 2)" : ""}.`,
  untranslatedEmpty: () => "The translation is empty.",
  untranslatedCopy: () => "The translation is identical to the source text (left untranslated?).",
  untranslatedFuzzy: () => "Fuzzy (draft) translation: gettext ignores it until it is reviewed and the fuzzy flag is removed.",
  untranslatedJapanese: () => "The English translation is Japanese text (left untranslated?).",
  untranslatedDuplicate: (l, id) => `The translation is identical to the previous row's (line ${l}, ${id}) although the sources differ (copied from the neighbouring row?).`,
  voicePolitenessToSuperior: (name, t) =>
    `${name} is written plain but this line is polite. It addresses "${t}", and a switch to keigo toward a teacher or senior is often intended; confirm it.`,
  termMissingCompound: (s, t, c) =>
    `Source contains "${s}" only inside the longer word "${c}", which the glossary does not list; the translation does not use "${t}". Fine if "${c}" is a different word.`,
  notationGlossary: (s, e) => `Katakana spelling "${s}" differs from the glossary spelling "${e}".`,
  notationKanaMix: (s, h, e) => `"${s}" has the hiragana "${h}" inside a katakana word (did you mean "${e}"?).`,
  rubyBroken: (k, x) => `Broken ruby markup "${x}": ${RUBY_PROBLEM_EN[k]}.`,
};

const POLITENESS_JA = { polite: "丁寧体", plain: "常体" } as const;
const POLICY_JA: Record<string, string> = { keep: "「keep」（ローマ字で残す）", drop: "「drop」（敬称を訳さない）", localize: "「localize」（英語の敬称に置き換える）" };
const q = (xs: string[]) => xs.map((x) => `「${x}」`).join("");

const ja: Messages = {
  termForbidden: (s, f, t) => `「${s}」が禁止訳「${f}」で訳されています。用語集の訳は「${t}」です。`,
  termMissing: (s, t) => `原文に「${s}」がありますが、訳文で「${t}」が使われていません。`,
  termForbiddenStray: (f, t, s) => `原文に「${s}」がないのに、禁止訳「${f}」が使われています（用語集の訳は「${t}」）。`,
  termDirection: (sl, tl, gd) =>
    `このファイルは${sl}→${tl}ですが、用語集は${gd}のため、用語チェックを省略しました。列の順序を確認するか、方向の合う用語集を使ってください。`,
  notationKatakana: (s, m, n) => `カタカナ表記「${s}」が、多数派の表記「${m}」（${n}件）と異なります。`,
  nameForbidden: (f, a) => `キャラ名が「${f}」と表記されています。正しい表記は「${a}」です。`,
  nameMissing: (jaName, names) => `日本語に「${jaName}」がありますが、英語に${q(names)}がありません（代名詞に置き換えている場合は問題ありません）。`,
  nameNearMiss: (t, c) => `「${t}」は「${c}」の誤記の可能性があります。実在の単語なら ignoreWords に追加してください。`,
  nameSpeakerLabel: (l, m, n) => `話者ラベル「${l}」が、他の${n}行で使われている「${m}」と異なります。`,
  nameSpeakerUnknown: (l) => `話者「${l}」はキャラクター表になく、既知のキャラ名と1文字違いです。`,
  honorificPolicyRomanized: (f, p) => `ローマ字の敬称「${f}」が使われていますが、プロジェクトの敬称方針は${POLICY_JA[p] ?? `「${p}」`}です。`,
  honorificPolicyKeep: (jaName, f, e) => `敬称方針は「keep」（ローマ字で残す）ですが、「${jaName}」が「${f}」と訳されています（期待される訳は「${e}」）。`,
  honorificDrift: (form, jaHon, m, n) => `ここでは「${form}」ですが、この話者の「${jaHon}」は他の${n}行で「${m}」と訳されています。`,
  honorificSplit: (jaHon, split) => `この話者の「${jaHon}」の訳し方が揃っておらず、多数派がありません（${split}）。どれかに統一してください。`,
  honorificNameDropped: (ja, m, n) =>
    `「${ja}」がここでは名前なしで訳されていますが、この話者の他の${n}行では「${m}」です。名前を省いた呼び方が意図どおりか確認してください。`,
  honorificSourceShift: (h, m, n) =>
    `日本語でこの話者はここで「${h}」を使っていますが、他の${n}行では「${m}」です。意図的な変化か（英語にも反映されているか）確認してください。`,
  honorificTargetDrift: (h, e, m, n) => `「${e}」がここでは「${h}」付きで訳されていますが、この話者の他の${n}行では「${m}」です。`,
  voiceFirstPersonProfile: (name, odd, exp) => `${name} が一人称${q(odd)}を使っていますが、プロフィールでは${q(exp)}です。`,
  voiceFirstPersonMajority: (name, odd, m, n, total) => `${name} はここで一人称${q(odd)}を使っていますが、${total}行中${n}行では「${m}」です。`,
  voicePolitenessProfile: (name, exp, p) => `${name} は${POLITENESS_JA[exp]}で話すキャラですが、この行は${POLITENESS_JA[p]}です。`,
  voicePolitenessMajority: (name, p, want, n, total) =>
    `この行は${POLITENESS_JA[p]}です。${name} は${total}行中${n}行が${POLITENESS_JA[want]}です。`,
  voiceContraction: (name, c) => `${name} は短縮形を使わない設定ですが、この行に${q(c)}があります。`,
  voiceAvoid: (name, a) => `${name} が使わないはずの${q(a)}が含まれています。`,
  mismatch: (missing, extra) =>
    [missing.length && `不足: ${missing.join(" ")}`, extra.length && `余分: ${extra.join(" ")}`].filter(Boolean).join("／"),
  tagUnbalanced: (tags) => `タグの開始と終了が対応していません: ${tags.join(" ")}`,
  tagEmphasisDropped: (tags) => `訳文で強調タグが省かれています: ${tags.join(" ")}（日本語では一般的です。意図どおりか確認してください）`,
  rubyReading: (r, b) => `「${b}」のルビ「${r}」がかなではありません。`,
  rubyMalformed: () => "<ruby>/<rt> のマークアップが不正です。",
  rubyLeak: () => "ルビのマークアップが英語テキストに混入しています。",
  lengthLimit: (n, max, wide) => `文字数${n}が上限${max}を超えています${wide ? "（全角は2文字として計算）" : ""}。`,
  untranslatedEmpty: () => "訳文が空です。",
  untranslatedCopy: () => "訳文が原文と同じです（未翻訳の可能性があります）。",
  untranslatedFuzzy: () => "fuzzy（仮訳）です。fuzzy フラグを外すまで gettext はこの訳を使いません。",
  untranslatedJapanese: () => "英語の訳文が日本語のままです（未翻訳の可能性があります）。",
  untranslatedDuplicate: (l, id) => `原文が異なるのに、訳文が直前の行（${l}行目、${id}）と同じです（隣の行の訳をコピーした可能性があります）。`,
  voicePolitenessToSuperior: (name, t) =>
    `${name} は常体で話すキャラですが、この行は丁寧体です。「${t}」への呼びかけがあり、先生や先輩にだけ敬語を使うのは自然な場合が多いので、意図どおりか確認してください。`,
  termMissingCompound: (s, t, c) =>
    `原文の「${s}」は、用語集にない長い語「${c}」の一部としてだけ出てきます。訳文に「${t}」がありません（「${c}」が別の語なら問題ありません）。`,
  notationGlossary: (s, e) => `カタカナ表記「${s}」が、用語集の表記「${e}」と異なります。`,
  notationKanaMix: (s, h, e) => `「${s}」のカタカナ語の中にひらがなの「${h}」が混じっています（「${e}」の誤りでは？）。`,
  rubyBroken: (k, x) => `ルビの記法「${x}」が壊れています（${RUBY_PROBLEM_JA[k]}）。`,
};

const MESSAGES: Record<Locale, Messages> = { en, ja };

export function messages(locale: Locale = "en"): Messages {
  return MESSAGES[locale] ?? en;
}

// ---------- Markdown report labels ----------

export interface ReportLabels {
  heading: string;
  titles: Record<Category, string>;
  tableLine(file: string, format: string, rows: number, sourceLang: string, targetLang: string): string;
  glossaryLine(terms: number, characters: number): string;
  summaryHeader: string;
  noIssues: string;
  usage: string;
  side: Record<Side, string>;
  packetsHeading: string;
  packetsIntro(n: number): string;
  packetItem(kind: ReviewPacket["kind"], subject: string, lines: number): string;
  packetSep: string;
}

const reportEn: ReportLabels = {
  heading: "Script consistency report",
  titles: {
    term: "Glossary term drift / 用語の訳揺れ",
    notation: "Katakana notation drift / 表記揺れ",
    name: "Character name drift / キャラ名の揺れ",
    honorific: "Honorific drift / 敬称の揺れ",
    voice: "Voice drift / 口調の揺れ",
    placeholder: "Placeholders (bonus)",
    tag: "Tags (bonus)",
    ruby: "Ruby (bonus)",
    length: "Length limits (bonus)",
    untranslated: "Untranslated (bonus) / 未翻訳",
  },
  tableLine: (f, fmt, n, sl, tl) => `- **${f}** — ${fmt}, ${n} rows, ${sl} → ${tl}`,
  glossaryLine: (t, c) => `- Glossary: ${t} terms, ${c} characters`,
  summaryHeader: "| Check | ❌ error | ⚠️ warning | ℹ️ info |",
  noIssues: "No issues found.",
  usage: "Usage",
  side: { source: "source", target: "target" },
  packetsHeading: "Needs judgement (review packets)",
  packetsIntro: (n) => `${n} packet(s) for the reviewer: `,
  packetItem: (k, s, n) => `${k} — ${s} (${n} lines)`,
  packetSep: "; ",
};

const reportJa: ReportLabels = {
  heading: "台本一貫性レポート",
  titles: {
    term: "用語の訳揺れ",
    notation: "表記揺れ",
    name: "キャラ名の揺れ",
    honorific: "敬称の揺れ",
    voice: "口調の揺れ",
    placeholder: "プレースホルダー",
    tag: "タグ",
    ruby: "ルビ",
    length: "文字数制限",
    untranslated: "未翻訳",
  },
  tableLine: (f, fmt, n, sl, tl) => `- **${f}** — ${fmt}、${n}行、${sl} → ${tl}`,
  glossaryLine: (t, c) => `- 用語集: 用語${t}件、キャラクター${c}名`,
  summaryHeader: "| チェック | ❌ エラー | ⚠️ 警告 | ℹ️ 情報 |",
  noIssues: "問題は見つかりませんでした。",
  usage: "使用状況",
  side: { source: "原文", target: "訳文" },
  packetsHeading: "要判断（レビューパケット）",
  packetsIntro: (n) => `レビュー用パケット${n}件: `,
  packetItem: (k, s, n) => `${k === "voice" ? "口調" : "未登録用語"} — ${s}（${n}行）`,
  packetSep: "、",
};

export function reportLabels(locale: Locale = "en"): ReportLabels {
  return locale === "ja" ? reportJa : reportEn;
}
