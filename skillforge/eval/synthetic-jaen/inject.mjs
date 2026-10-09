#!/usr/bin/env node
// Seeded error injector for the synthetic JA→EN script benchmark.
//
//   node eval/synthetic-jaen/inject.mjs [--seed 20261009] [--dir eval/synthetic-jaen]
//
// Reads script_clean.csv + glossary.json, applies ~60 known errors (one per row) and writes
// script_drifted.csv (same rows, same order, same line numbers) and truth.csv (ground truth).
// Every operator is a plain string rewrite; the PRNG only decides which candidate row gets it.
// No dependency on the Kotomark engine, so the injector cannot "know" what the engine detects.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SEED = Number(opt("seed", "20261009"));
const DIR = opt("dir", dirname(fileURLToPath(import.meta.url)));

// ---------- CSV (RFC 4180, no dependency) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const esc = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const toCsv = (rows) => rows.map((r) => r.map((c) => esc(String(c))).join(",")).join("\n") + "\n";

// ---------- PRNG ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const shuffle = (xs) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- data ----------
const [header, ...body] = parseCsv(readFileSync(join(DIR, "script_clean.csv"), "utf8"));
const col = Object.fromEntries(header.map((h, i) => [h, i]));
// Every clean cell is single-line, so the physical CSV line of a row is its index + 2.
const rows = body.map((r, i) => ({ id: r[col.id], speaker: r[col.speaker], ja: r[col.ja], en: r[col.en], max: r[col.max_length], context: r[col.context], line: i + 2 }));
const glossary = JSON.parse(readFileSync(join(DIR, "glossary.json"), "utf8"));
const used = new Set();
const truth = [];

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive EN match that keeps a plural/possessive tail. */
const enWord = (w) => new RegExp(`(?<![A-Za-z])${reEsc(w)}(?=(?:s|'s)?(?![A-Za-z]))`, "i");
const POLITE = /(です|(?<!ます)ます(?!ます)|でした|ました|ません|ましょう|ください|でしょう|ございま)/g;

/**
 * Apply one operator to `count` rows. `pick(row)` returns a mutation {field, value, description} or undefined.
 * `expect` lists the Kotomark rules that would count as finding this error (for the scorer), `gap` notes why an
 * error is expected to be hard for the current rules (author's prediction, recorded before running the engine).
 */
function inject({ category, subtype, count, where = () => true, pick, expect, gap = "" }) {
  let done = 0;
  for (const row of shuffle(rows)) {
    if (done >= count) break;
    if (used.has(row.id) || !where(row)) continue;
    const m = pick(row);
    if (!m || m.value === row[m.field]) continue;
    truth.push({ line: row.line, id: row.id, category, subtype, field: m.field, before: row[m.field], after: m.value, description: m.description, expect: expect.join("|"), predicted_gap: gap });
    row[m.field] = m.value;
    used.add(row.id);
    done++;
  }
  if (done < count) throw new Error(`only ${done}/${count} candidates for ${category}/${subtype}`);
}

// ---------- operators ----------
const terms = glossary.terms;
const termIn = (row) => terms.filter((t) => row.ja.includes(t.source) && enWord(t.target).test(row.en));

// 1. Glossary term: forbidden variant (5) and unlisted variant (5)
inject({
  category: "term", subtype: "forbidden-variant", count: 5, expect: ["term.forbidden", "term.forbidden-stray"],
  where: (r) => termIn(r).some((t) => t.forbidden?.length),
  pick: (r) => {
    const t = termIn(r).find((x) => x.forbidden?.length);
    const bad = t.forbidden[Math.floor(rand() * t.forbidden.length)];
    return { field: "en", value: r.en.replace(enWord(t.target), bad), description: `${t.source}: "${t.target}" → forbidden "${bad}"` };
  },
});
const VARIANT = { Starcrystal: "Star Gem", "Sacred Tree": "Great Tree", "Dragon Vein": "Dragon Pulse", Warpstone: "Warp Crystal", Mistwood: "Misty Woods", Oracle: "Seer", Sealbrand: "Seal Blade", Arcgate: "Arc Portal", "Azure Knights": "Azure Order", fiend: "beast" };
inject({
  category: "term", subtype: "unlisted-variant", count: 5, expect: ["term.missing"],
  where: (r) => termIn(r).some((t) => VARIANT[t.target]),
  pick: (r) => {
    const t = termIn(r).find((x) => VARIANT[x.target]);
    return { field: "en", value: r.en.replace(enWord(t.target), VARIANT[t.target]), description: `${t.source}: "${t.target}" → unlisted "${VARIANT[t.target]}"` };
  },
});

// 2. Katakana notation variant in the Japanese source (one per word)
for (const [from, to] of [["エーテルランプ", "エーテル・ランプ"], ["アークゲート", "アーク・ゲート"], ["ヴァルハイト", "バルハイト"], ["グリフォン", "グリフォーン"], ["リーヴェン", "リーベン"]]) {
  inject({
    category: "notation", subtype: "katakana-variant", count: 1, expect: ["notation.katakana"],
    where: (r) => r.ja.includes(from),
    pick: (r) => ({ field: "ja", value: r.ja.replace(from, to), description: `JA ${from} → ${to}` }),
  });
}

// 3. Character names in English: near-miss, forbidden, too-short near-miss; JA katakana name variant
const nameOp = (subtype, from, to, expect, gap = "") =>
  inject({
    category: "name", subtype, count: 1, expect, gap,
    where: (r) => new RegExp(`(?<![A-Za-z])${from}(?![A-Za-z])`).test(r.en) && !/-(sama|san|dono|senpai)/.test(r.en),
    pick: (r) => ({ field: "en", value: r.en.replace(new RegExp(`(?<![A-Za-z])${from}(?![A-Za-z])`), to), description: `EN name ${from} → ${to}` }),
  });
nameOp("near-miss", "Ceres", "Ceris", ["name.near-miss", "name.missing"]);
nameOp("near-miss", "Gald", "Gaid", ["name.near-miss", "name.missing"]);
nameOp("near-miss", "Zeno", "Zeeno", ["name.near-miss", "name.missing"]);
nameOp("near-miss-short", "Mio", "Mia", ["name.near-miss", "name.missing"], "3-letter name: near-miss scan needs length ≥ 4; name.missing is info only");
nameOp("forbidden", "Ceres", "Seres", ["name.forbidden"]);
nameOp("forbidden", "Hayate", "Hayato", ["name.forbidden"]);
inject({
  category: "name", subtype: "ja-katakana-variant", count: 1, expect: ["notation.katakana", "name.forbidden"],
  where: (r) => r.ja.includes("セレス") && r.speaker !== "セレス",
  pick: (r) => ({ field: "ja", value: r.ja.replace("セレス", "セレース"), description: "JA name セレス → セレース" }),
});

// 4. Speaker label variants
const speakerOp = (from, to, expect, gap = "") =>
  inject({
    category: "speaker", subtype: "label-variant", count: 1, expect, gap,
    where: (r) => r.speaker === from,
    pick: () => ({ field: "speaker", value: to, description: `speaker ${from} → ${to}` }),
  });
speakerOp("セレス", "Ceres", ["name.speaker-label"]);
speakerOp("ミオ", "MIO", ["name.speaker-label"]);
speakerOp("ハヤテ", "ハヤト", ["name.speaker-unknown", "name.speaker-label"]);
speakerOp("ガルド", "ガルド（騎士長）", ["name.speaker-label", "name.speaker-unknown"], "label with a title in brackets does not resolve to the character");
speakerOp("リン", "りん", ["name.speaker-label", "name.speaker-unknown"], "hiragana label is not folded to katakana");

// 5. Honorifics (policy: localize)
const honOp = (subtype, speaker, from, to, expect, gap = "", field = "en") =>
  inject({
    category: "honorific", subtype, count: 1, expect, gap,
    where: (r) => r.speaker === speaker && r[field].includes(from),
    pick: (r) => ({ field, value: r[field].replace(from, to), description: `${speaker}: ${field.toUpperCase()} "${from}" → "${to}"` }),
  });
honOp("policy-romanized", "ハヤテ", "Lady Ceres", "Ceres-sama", ["honorific.policy"]);
honOp("policy-romanized", "ミオ", "Rin", "Rin-senpai", ["honorific.policy"]);
honOp("policy-romanized", "ハヤテ", "Sir Gald", "Gald-dono", ["honorific.policy", "honorific.drift"]);
honOp("drift", "ミオ", "Lady Ceres", "Ceres", ["honorific.drift"]);
honOp("drift", "ハヤテ", "Sir Gald", "Gald", ["honorific.drift"]);
honOp("drift-title-only", "ミオ", "Lady Ceres", "Your Highness", ["honorific.drift"], "name dropped, so there is no EN rendering to compare (name.missing info at most)");
honOp("source-shift", "ミオ", "セレス様", "セレスさん", ["honorific.source-shift"], "", "ja");

// 6. First-person pronoun swaps in the Japanese source
const pronOp = (speaker, from, to, gap = "") =>
  inject({
    category: "pronoun", subtype: "first-person-swap", count: 1, expect: ["voice.first-person"], gap,
    where: (r) => r.speaker === speaker && r.ja.includes(from),
    pick: (r) => ({ field: "ja", value: r.ja.replace(from, to), description: `${speaker}: ${from} → ${to}` }),
  });
pronOp("ガルド", "俺", "僕");
pronOp("セレス", "わたくし", "わたし");
pronOp("ミオ", "あたし", "私");
pronOp("ハヤテ", "拙者", "僕");
pronOp("ガルド", "俺", "余", "余 is not in the first-person pronoun list");

// 7. Politeness flips in the Japanese source
const polOp = (speaker, re, to, gap = "", single = true) =>
  inject({
    category: "politeness", subtype: single ? "polite→plain" : "plain→polite", count: 1, expect: ["voice.politeness"], gap,
    where: (r) => r.speaker === speaker && re.test(r.ja) && (!single || (r.ja.match(POLITE) ?? []).length === 1),
    pick: (r) => ({ field: "ja", value: r.ja.replace(re, to), description: `${speaker}: "${r.ja.match(re)[0]}" → "${r.ja.match(re)[0].replace(re, to)}"` }),
  });
polOp("セレス", /です([。！ね])/, "だ$1");
polOp("リン", /です([。！])/, "だ$1");
polOp("セレス", /ています([。！])/, "ている$1", "plain dictionary-form ending (〜ている。) is not in PLAIN_END, so the line reads as neither polite nor plain");
polOp("ガルド", /だ([。！])/, "です$1", "", false);

// 8. Contractions for no-contraction characters
const CONTRACT = [["I am", "I'm"], ["do not", "don't"], ["It is", "It's"], ["it is", "it's"], ["That is", "That's"], ["that is", "that's"], ["Let us", "Let's"], ["let us", "let's"], ["I will", "I'll"], ["cannot", "can't"]];
for (const [speaker, n] of [["セレス", 2], ["ハヤテ", 2]]) {
  inject({
    category: "contraction", subtype: "no-contraction-character", count: n, expect: ["voice.contraction"],
    where: (r) => r.speaker === speaker && CONTRACT.some(([a]) => r.en.includes(a)),
    pick: (r) => {
      const [a, b] = CONTRACT.find(([x]) => r.en.includes(x));
      return { field: "en", value: r.en.replace(a, b), description: `${speaker}: "${a}" → "${b}"` };
    },
  });
}

// 9. Avoided words
const AVOID = [["セレス", /^Yes([,.])/, "Yeah$1"], ["セレス", /^Very well\./, "Okay."], ["ハヤテ", /^(\.\.\.)?Understood/, "$1Okay"]];
for (const [speaker, re, to] of AVOID) {
  inject({
    category: "avoid", subtype: "avoided-word", count: 1, expect: ["voice.avoid"],
    where: (r) => r.speaker === speaker && re.test(r.en),
    pick: (r) => ({ field: "en", value: r.en.replace(re, to), description: `${speaker}: avoided word "${to.replace(/^\$1/, "").replace(/\$1$/, "")}"` }),
  });
}

// 10. Placeholders
const phOp = (subtype, re, to) =>
  inject({
    category: "placeholder", subtype, count: 1, expect: ["placeholder.mismatch"],
    where: (r) => re.test(r.en),
    pick: (r) => ({ field: "en", value: r.en.replace(re, to), description: `EN ${r.en.match(re)[0].trim()} → ${to.trim() || "(dropped)"}` }),
  });
phOp("dropped", / ?×?\{0\}/, "");
phOp("dropped", /\{0\} (?=[A-Z])/, "some ");
phOp("translated", /\[PLAYER\]/, "Player");
phOp("renamed", /\[PLAYER\]/, "[PLAYER_NAME]");

// 11. Tags (all three tagged rows)
const tagOp = (re, to, what) =>
  inject({
    category: "tag", subtype: what, count: 1, expect: ["tag.mismatch", "tag.unbalanced"],
    where: (r) => re.test(r.en),
    pick: (r) => ({ field: "en", value: r.en.replace(re, to), description: `EN tag ${what}` }),
  });
tagOp(/<\/color>/, "", "closing </color> dropped");
tagOp(/<color=[^>]+>([^<]*)<\/color>/, "$1", "color markup dropped");
tagOp(/<\/i>/, "<i>", "closing </i> typed as <i>");

// 12. Length overflow (rewrites that exceed max_length)
const LONGER = {
  "▶ Protect Ceres": "▶ Stand between Ceres and the griffin",
  "▶ Charge the griffin": "▶ Charge straight at the raging griffin",
  "Aether Lamp": "Aether Lamp of the Mist",
  "Starcrystal": "Starcrystal (Unrefined)",
  "[Location] Royal City of Lieven": "[Location] The Royal Capital City of Lieven",
  "▶ I could use some rest": "▶ I could really use some rest first",
};
inject({
  category: "length", subtype: "over-limit", count: 3, expect: ["length.limit"],
  where: (r) => r.max && LONGER[r.en],
  pick: (r) => ({ field: "en", value: LONGER[r.en], description: `EN ${LONGER[r.en].length} chars > limit ${r.max}` }),
});

// 13. Ruby
inject({
  category: "ruby", subtype: "kanji-in-reading", count: 1, expect: ["ruby.reading"],
  where: (r) => /\{巫女\|みこ\}/.test(r.ja),
  pick: (r) => ({ field: "ja", value: r.ja.replace("{巫女|みこ}", "{巫女|巫こ}"), description: "JA ruby reading contains kanji" }),
});
inject({
  category: "ruby", subtype: "leak-into-en", count: 1, expect: ["ruby.leak"],
  where: (r) => /^\{聖樹\|せいじゅ\}よ/.test(r.ja),
  pick: (r) => ({ field: "en", value: r.en.replace("Sacred Tree", "{Sacred Tree|せいじゅ}"), description: "JA ruby markup copied into EN" }),
});

// ---------- write ----------
const out = [header, ...rows.map((r) => [r.id, r.speaker, r.ja, r.en, r.max, r.context])];
writeFileSync(join(DIR, "script_drifted.csv"), toCsv(out));
truth.sort((a, b) => a.line - b.line);
const tcols = ["line", "id", "category", "subtype", "field", "description", "expect", "predicted_gap"];
writeFileSync(join(DIR, "truth.csv"), toCsv([tcols, ...truth.map((t) => tcols.map((c) => t[c]))]));
console.error(`seed ${SEED}: ${truth.length} injected errors in ${rows.length} rows → script_drifted.csv, truth.csv`);
