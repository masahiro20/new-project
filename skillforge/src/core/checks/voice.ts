import { findCharacter } from "./names.js";
import { countBy, escapeRegExp, ref, visibleText } from "../text.js";
import type { Finding, Glossary, ReviewPacket, Row, Side, Table, UsageSummary, VoiceProfile } from "../types.js";

// ---------- honorifics ----------

// Longer forms first so 殿下 (a title, not a suffix to romanize) wins over 殿.
const JA_HONORIFICS = ["殿下", "陛下", "様", "さま", "さん", "くん", "君", "ちゃん", "先輩", "せんぱい", "殿", "先生", "氏", "たん"];
const SUFFIX_FOR: Record<string, string> = {
  様: "-sama", さま: "-sama", さん: "-san", くん: "-kun", 君: "-kun", ちゃん: "-chan",
  先輩: "-senpai", せんぱい: "-senpai", 殿: "-dono", 先生: "-sensei", たん: "-tan",
};
const EN_TITLE_WORDS = ["Lady", "Lord", "Sir", "Dame", "Miss", "Mr\\.?", "Mrs\\.?", "Ms\\.?", "Master", "Mistress", "Princess", "Prince", "Captain", "Professor", "Doctor", "Dr\\.?", "Sister", "Brother", "Father", "Mother", "Senpai"];
// Titles match in either case ("my lady Lisette"); the name itself is case-sensitive.
const EN_TITLES = EN_TITLE_WORDS.map((w) => `[${w[0]}${w[0]!.toLowerCase()}]${w.slice(1)}`).join("|");
const EN_SUFFIX = "-(?:sama|san|kun|chan|senpai|sempai|sensei|dono|tan)";

const speakerKey = (g: Glossary, r: Row) => findCharacter(g, r.speaker)?.id ?? r.speaker ?? "(no speaker)";

/** How a character's name is dressed in English, e.g. "Lady {name}", "{name}-sama", "{name}". */
function enRendering(en: string, names: string[]): string | undefined {
  for (const n of names) {
    const m = new RegExp(`(?:\\b(${EN_TITLES})\\s+)?\\b${escapeRegExp(n)}(${EN_SUFFIX})?(?![A-Za-z])`).exec(en);
    if (m) {
      const title = m[1] ? m[1][0]!.toUpperCase() + m[1].slice(1) : "";
      return `${title ? `${title} ` : ""}{name}${m[2] ? m[2].toLowerCase() : ""}`;
    }
  }
  return undefined;
}

export function checkHonorifics(tables: Table[], g: Glossary): { findings: Finding[]; usage: UsageSummary[] } {
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  type Hit = { row: Row; enSide: Side; jaSide: Side; speaker: string; char: string; jaHon: string; rendering?: string };
  const hits: Hit[] = [];
  const policy = g.honorificPolicy;

  const nameRes = g.characters.map((c) => {
    const jaNames = [c.ja, ...(c.aliases?.ja ?? [])].sort((a, b) => b.length - a.length);
    return { c, re: new RegExp(`(${jaNames.map(escapeRegExp).join("|")})(${JA_HONORIFICS.map(escapeRegExp).join("|")})?`) };
  });
  for (const t of tables) {
    if (t.sourceLang === t.targetLang) continue;
    const jaSide: Side = t.sourceLang === "ja" ? "source" : "target";
    const enSide: Side = jaSide === "source" ? "target" : "source";
    for (const row of t.rows) {
      if (!row.target.trim()) continue;
      const ja = visibleText(row[jaSide]);
      const en = visibleText(row[enSide]);
      for (const { c, re } of nameRes) {
        const m = re.exec(ja);
        if (!m) continue;
        const jaHon = m[2] ?? "(呼び捨て)";
        const rendering = enRendering(en, [c.en, ...(c.aliases?.en ?? [])]);
        hits.push({ row, enSide, jaSide, speaker: speakerKey(g, row), char: c.en, jaHon, rendering });

        if (rendering && (policy === "drop" || policy === "localize") && /-\w+$/.test(rendering)) {
          findings.push({
            category: "honorific", severity: "error", rule: "honorific.policy", group: `${row.speaker ?? "?"} → ${c.en} (${jaHon})`,
            file: row.file, line: row.line, id: row.id, side: enSide,
            message: `Romanized honorific "${rendering.replace("{name}", c.en)}" but the project policy is "${policy}".`,
            found: rendering.replace("{name}", c.en),
          });
        }
        if (rendering && policy === "keep" && m[2] && SUFFIX_FOR[m[2]] && !rendering.endsWith(SUFFIX_FOR[m[2]]!)) {
          findings.push({
            category: "honorific", severity: "warning", rule: "honorific.policy", group: `${row.speaker ?? "?"} → ${c.en} (${jaHon})`,
            file: row.file, line: row.line, id: row.id, side: enSide,
            message: `Policy is "keep" but "${c.ja}${m[2]}" is rendered "${rendering.replace("{name}", c.en)}" (expected "${c.en}${SUFFIX_FOR[m[2]]}").`,
            found: rendering.replace("{name}", c.en), expected: `${c.en}${SUFFIX_FOR[m[2]]}`,
          });
        }
      }
    }
  }

  // Same speaker, same addressee, same Japanese honorific → the English should be dressed the same way.
  for (const [, group] of countBy(hits.filter((h) => h.rendering), (h) => `${h.speaker}\u0000${h.char}\u0000${h.jaHon}`)) {
    const first = group[0]!;
    const label = `${first.row.speaker ?? "?"} → ${first.char} (${first.jaHon})`;
    const forms = countBy(group, (h) => h.rendering!);
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    usage.push({ category: "honorific", group: label, counts: Object.fromEntries(ranked.map(([k, v]) => [k.replace("{name}", first.char), v.length])) });
    if (forms.size < 2) continue;
    const majority = ranked[0]![0].replace("{name}", first.char);
    for (const [form, list] of ranked.slice(1)) {
      for (const h of list) {
        findings.push({
          category: "honorific", severity: "warning", rule: "honorific.drift", group: label,
          file: h.row.file, line: h.row.line, id: h.row.id, side: h.enSide,
          message: `"${form.replace("{name}", first.char)}" here, but this speaker's "${first.jaHon}" is rendered "${majority}" in ${forms.get(ranked[0]![0])!.length} other lines.`,
          found: form.replace("{name}", first.char), expected: majority,
        });
      }
    }
  }

  // Japanese side: a speaker switching how they address someone (様 → さん). Often intentional, so info only.
  for (const [, group] of countBy(hits, (h) => `${h.speaker}\u0000${h.char}`)) {
    const forms = countBy(group, (h) => h.jaHon);
    if (forms.size < 2) continue;
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    if (ranked[0]![1].length < 2) continue;
    for (const [hon, list] of ranked.slice(1)) {
      for (const h of list) {
        findings.push({
          category: "honorific", severity: "info", rule: "honorific.source-shift", group: `${h.row.speaker ?? "?"} → ${h.char}`,
          file: h.row.file, line: h.row.line, id: h.row.id, side: h.jaSide,
          message: `In Japanese this speaker uses "${hon}" here but "${ranked[0]![0]}" in ${ranked[0]![1].length} other lines. Confirm it is an intentional shift (and that the English reflects it).`,
          found: hon, expected: ranked[0]![0],
        });
      }
    }
  }
  return { findings, usage };
}

// ---------- voice (first-person pronoun, politeness, contractions) ----------

const AFTER = "(?=[はがのをにもとだっ、。！？…!?\\s」』]|たち|達|ら|$)";
const KANJI_PRONOUN = new RegExp(`(?<![\\u4e00-\\u9fff])(私|僕|俺|儂|拙者|我輩|吾輩|妾|某)${AFTER}`, "g");
// Multi-mora kana pronouns may follow a particle (だからぼくは); short/ambiguous ones (わし, うち) must not follow kana (こわし, まわし).
const KANA_PRONOUN = new RegExp(
  `(?:(?<![ぁ-ゖ])|(?<=[をはがにもとらてでどねよさ]))(わたくし|わたし|あたし|あたい|ぼく|おれ|わらわ|それがし|オレ|ボク|ワタシ|ウチ)${AFTER}|(?<![ぁ-ゖ])(わし|うち)(?=[はがもの、]|ら)`,
  "g",
);
const POLITE = /(です|(?<!ます)ます(?!ます)|でした|ました|ません|ましょう|ください|でしょう|ございま)/;
const PLAIN_END = /(だ|だろ|だろう|じゃねえ|じゃない|ぞ|ぜ|んだ|かよ|ねえか|よな|よ|ね|わ|な|か|かい|だい|さ|ろ|しろ|てやる|てろ)[。、！？!?…」』\s]*$/;

export function firstPersonPronouns(ja: string): string[] {
  return [...new Set([...ja.matchAll(KANJI_PRONOUN), ...ja.matchAll(KANA_PRONOUN)].map((m) => (m[1] ?? m[2])!))];
}

export function politeness(ja: string): "polite" | "plain" | undefined {
  if (POLITE.test(ja)) return "polite";
  const sentences = ja.split(/(?<=[。、！？!?])/);
  return sentences.some((s) => PLAIN_END.test(s.trim())) ? "plain" : undefined;
}

const CONTRACTION = /\b(?:[A-Za-z]+n['’]t|(?:I|you|we|they|he|she|it|that|there|who|what|where|here|let)['’](?:s|re|ve|ll|d|m)|I['’]m|[A-Za-z]+['’](?:ll|ve|re))\b/gi;

export function checkVoice(tables: Table[], g: Glossary, minLines = 3): { findings: Finding[]; usage: UsageSummary[]; packets: ReviewPacket[] } {
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  const packets: ReviewPacket[] = [];
  type L = { row: Row; jaSide?: Side; enSide?: Side };
  const lines: L[] = tables.flatMap((t) =>
    t.rows
      .filter((r) => r.speaker && r.target.trim())
      .map((row) => ({
        row,
        jaSide: t.sourceLang === "ja" ? ("source" as const) : t.targetLang === "ja" ? ("target" as const) : undefined,
        enSide: t.targetLang === "en" ? ("target" as const) : t.sourceLang === "en" ? ("source" as const) : undefined,
      })),
  );

  for (const [key, group] of countBy(lines, (l) => speakerKey(g, l.row))) {
    const ch = findCharacter(g, group[0]!.row.speaker);
    const profile: VoiceProfile = ch?.voice ?? {};
    const name = ch ? `${ch.ja} / ${ch.en}` : key;
    const flagged = new Map<Row, string[]>();
    const flag = (f: Finding, row: Row) => {
      findings.push(f);
      flagged.set(row, [...(flagged.get(row) ?? []), f.message]);
    };

    // First-person pronoun
    const pron = group.filter((l) => l.jaSide).map((l) => ({ l, p: firstPersonPronouns(visibleText(l.row[l.jaSide!])) })).filter((x) => x.p.length);
    if (pron.length) {
      const tally: Record<string, number> = {};
      pron.forEach((x) => x.p.forEach((p) => (tally[p] = (tally[p] ?? 0) + 1)));
      usage.push({ category: "voice", group: `${name}: first-person pronoun`, counts: tally });
      const expected = profile.ja?.firstPerson;
      const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      const total = pron.length;
      const majority = ranked[0]!;
      const useMajority = !expected && total >= 3 && majority[1] / total >= 2 / 3;
      for (const { l, p } of pron) {
        const odd = expected ? p.filter((x) => !expected.includes(x)) : useMajority ? p.filter((x) => x !== majority[0]) : [];
        if (!odd.length) continue;
        flag(
          {
            category: "voice", severity: expected ? "warning" : "info", rule: "voice.first-person", group: name,
            file: l.row.file, line: l.row.line, id: l.row.id, side: l.jaSide!,
            message: expected
              ? `${name} uses "${odd.join(", ")}" but their profile says "${expected.join(", ")}".`
              : `${name} uses "${odd.join(", ")}" here but "${majority[0]}" in ${majority[1]} of ${total} lines.`,
            found: odd.join(", "), expected: expected?.join(", ") ?? majority[0],
          },
          l.row,
        );
      }
    }

    // Politeness level
    const pol = group.filter((l) => l.jaSide).map((l) => ({ l, p: politeness(visibleText(l.row[l.jaSide!])) })).filter((x) => x.p);
    if (pol.length) {
      const polite = pol.filter((x) => x.p === "polite").length;
      usage.push({ category: "voice", group: `${name}: politeness`, counts: { polite, plain: pol.length - polite } });
      const expected = profile.ja?.politeness;
      const majority = polite >= pol.length - polite ? "polite" : "plain";
      const ratio = Math.max(polite, pol.length - polite) / pol.length;
      const want = expected ?? (pol.length >= 4 && ratio >= 0.75 ? majority : undefined);
      if (want) {
        for (const { l, p } of pol) {
          if (p === want) continue;
          flag(
            {
              category: "voice", severity: expected ? "warning" : "info", rule: "voice.politeness", group: name,
              file: l.row.file, line: l.row.line, id: l.row.id, side: l.jaSide!,
              message: expected
                ? `${name} is written ${expected} but this line is ${p}.`
                : `This line is ${p}; ${name} is ${want} in ${want === "polite" ? polite : pol.length - polite} of ${pol.length} lines.`,
              found: p, expected: want,
            },
            l.row,
          );
        }
      }
    }

    // English: contractions and words the character avoids
    const enProfile = profile.en;
    for (const l of group) {
      if (!l.enSide) continue;
      const en = visibleText(l.row[l.enSide]);
      if (enProfile?.contractions === "never") {
        const c = [...new Set(en.match(CONTRACTION) ?? [])];
        if (c.length)
          flag(
            {
              category: "voice", severity: "warning", rule: "voice.contraction", group: name,
              file: l.row.file, line: l.row.line, id: l.row.id, side: l.enSide,
              message: `${name} never uses contractions, but this line has "${c.join('", "')}".`,
              found: c.join(", "),
            },
            l.row,
          );
      }
      const avoid = (enProfile?.avoid ?? []).filter((w) => new RegExp(`(?<![A-Za-z])${escapeRegExp(w)}(?![A-Za-z])`, "i").test(en));
      if (avoid.length)
        flag(
          {
            category: "voice", severity: "warning", rule: "voice.avoid", group: name,
            file: l.row.file, line: l.row.line, id: l.row.id, side: l.enSide,
            message: `${name} should not say "${avoid.join('", "')}".`,
            found: avoid.join(", "),
          },
          l.row,
        );
    }

    if (group.length >= minLines) {
      const ordered = [...group].sort((a, b) => Number(flagged.has(b.row)) - Number(flagged.has(a.row)));
      packets.push({
        kind: "voice",
        subject: name,
        profile: ch?.voice,
        instructions:
          `Judge whether each English line keeps ${name}'s voice consistent with the Japanese and with the profile ` +
          `(register, politeness, how they address others, verbal tics). Lines marked "flagged" were caught by rules; ` +
          `confirm or dismiss them, and report any other line that drifts. Answer per ref with: ok | drift (why) | suggested fix.`,
        lines: ordered.slice(0, 30).map(({ row }) => ({
          ref: ref(row), id: row.id, speaker: row.speaker, source: row.source, target: row.target,
          flagged: flagged.get(row)?.join(" / "),
        })),
      });
    }
  }
  return { findings, usage, packets };
}
