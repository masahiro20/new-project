#!/usr/bin/env node
// Deterministic error injector for synthetic benchmark #2 (JA→EN school-mystery VN script).
//
//   node eval/synthetic-jaen-2/inject.mjs
//
// Reads script_clean.csv, applies the INJECTIONS below (one per line, plain string edits) and writes
// script_drifted.csv (same rows, same order, same line numbers) and truth.csv.
// The seed only decides which of the listed alternative spellings is used where a spec has `alts`;
// everything else is fixed. Written blind: the author has not read the engine source (src/, test/).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SEED = 20261010;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const qAlways = (s) => `"${s.replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------------------------
// Injected errors. field: ja | en | speaker. Either {from,to} (first occurrence replaced; `alts`
// = alternative `to` values chosen by the seeded RNG), {set} (whole cell) or {copyFrom} (EN of another id).
// ---------------------------------------------------------------------------------------------
const INJECTIONS = [
  // term — EN term drift (forbidden variants and unlisted variants)
  { id: "s1_010", cat: "term", field: "en", from: "Mystery Research Club", to: "Mystery Club", d: "ミステリー研究会: forbidden 'Mystery Club'" },
  { id: "s2_004", cat: "term", field: "en", from: "calling card", to: "notice letter", d: "予告状: forbidden 'notice letter'" },
  { id: "s2_005", cat: "term", field: "en", from: "school festival", to: "culture festival", d: "文化祭: forbidden 'culture festival'" },
  { id: "s3_002", cat: "term", field: "en", from: "Old Wing", to: "old school building", d: "旧校舎: forbidden 'old school building'" },
  { id: "s3_037", cat: "term", field: "en", from: "clock tower", to: "bell tower", d: "時計塔: forbidden 'bell tower'" },
  { id: "s4_001", cat: "term", field: "en", from: "clubroom", to: "club room", d: "部室: forbidden spelling 'club room'" },
  { id: "s5_018", cat: "term", field: "en", from: "Phantom Thief Crow", to: "Phantom Crow", d: "怪盗クロウ: forbidden 'Phantom Crow'" },
  { id: "s6_017", cat: "term", field: "en", from: "board of directors", to: "board of trustees", d: "理事会: unlisted 'board of trustees' (contains allowed 'board' — expected gap)" },
  { id: "s7_001", cat: "term", field: "en", from: "Chronograph", to: "Chronometer", d: "クロノグラフ: unlisted 'Chronometer'" },
  { id: "s6_015", cat: "term", field: "en", from: "secretary", to: "clerk", d: "書記: unlisted 'clerk'" },

  // katakana — spelling variants, JA side and EN side
  { id: "s3_017", cat: "katakana", field: "ja", from: "フィルムカメラ", to: "フイルムカメラ", d: "JA: フィルムカメラ → フイルムカメラ (small-kana variant)" },
  { id: "s3_013", cat: "katakana", field: "ja", from: "ルーペ", to: "ルーぺ", d: "JA: ルーペ → ルーぺ (hiragana ぺ mixed into katakana)" },
  { id: "s3_022", cat: "katakana", field: "ja", from: "サーバールーム", to: "サーバルーム", d: "JA: サーバールーム → サーバルーム (long vowel dropped)" },
  { id: "s3_010", cat: "katakana", field: "ja", from: "クロノグラフ", to: "クロノ・グラフ", d: "JA: クロノグラフ → クロノ・グラフ (middle dot)" },
  { id: "s3_025", cat: "katakana", field: "ja", from: "カードキー", to: "カード・キー", d: "JA: カードキー → カード・キー (middle dot)" },
  { id: "s5_017", cat: "katakana", field: "ja", from: "ステンドグラス", to: "ステインドグラス", d: "JA: ステンドグラス → ステインドグラス" },
  { id: "s3_009", cat: "katakana", field: "en", from: "Chronograph", to: "Kronograph", alts: ["Kronograph", "Cronograph"], d: "EN: Chronograph → misspelled transliteration" },
  { id: "s9_017", cat: "katakana", field: "en", from: "Loupe", to: "Lupe", d: "EN: Loupe → Lupe (forbidden)" },
  { id: "s3_026", cat: "katakana", field: "en", from: "keycard", to: "key card", d: "EN: keycard → 'key card' (unlisted spacing variant)" },

  // name — EN misspellings, JA wrong/variant kanji
  { id: "s1_016", cat: "name", field: "en", from: "Kanade Miyaji", to: "Kanade Miyagi", d: "EN: Miyaji → Miyagi (surname alias misspelled)" },
  { id: "s4_008", cat: "name", field: "en", from: "Shirasagi", to: "Shirasaki", d: "EN: Shirasagi → Shirasaki (surname alias misspelled)" },
  { id: "s3_007", cat: "name", field: "en", from: "Koharu", to: "Koharo", d: "EN: Koharu → Koharo" },
  { id: "s5_008", cat: "name", field: "en", from: "Gennosuke Furukawa", to: "Gennousuke Furukawa", d: "EN: Gennosuke → Gennousuke (forbidden)" },
  { id: "s6_009", cat: "name", field: "en", from: "Kuroha", to: "Kuroba", d: "EN: Kuroha → Kuroba" },
  { id: "s7_009", cat: "name", field: "en", from: "Shiori", to: "Shiory", d: "EN: Shiori → Shiory (forbidden)" },
  { id: "s6_010", cat: "name", field: "ja", from: "黒羽さん", to: "黒葉さん", d: "JA: 黒羽 → 黒葉 (same reading, forbidden kanji)" },
  { id: "s4_027", cat: "name", field: "ja", from: "湊先輩って", to: "港先輩って", d: "JA: 湊 → 港 (same reading, forbidden kanji)" },
  { id: "s6_022", cat: "name", field: "ja", from: "詩織", to: "詩緒", d: "JA: 詩織 → 詩緒 (forbidden kanji)" },

  // speaker — label variants
  { id: "s2_015", cat: "speaker", field: "speaker", set: "朝霧", d: "speaker 湊 → 朝霧 (surname alias instead of the label used elsewhere)" },
  { id: "s3_035", cat: "speaker", field: "speaker", set: "宮地奏", d: "speaker 奏 → 宮地奏 (full name)" },
  { id: "s4_011", cat: "speaker", field: "speaker", set: "しおり", d: "speaker 詩織 → しおり (hiragana)" },
  { id: "s5_009", cat: "speaker", field: "speaker", set: "奏(二年)", d: "speaker 奏 → 奏(二年) (annotation in label)" },
  { id: "s6_014", cat: "speaker", field: "speaker", set: "黒羽雫", d: "speaker 黒羽 → 黒羽雫 (full name)" },
  { id: "s7_005", cat: "speaker", field: "speaker", set: "源之介", d: "speaker 源之助 → 源之介 (wrong kanji)" },

  // honorific — keep-policy violations and drift
  { id: "s1_012", cat: "honorific", field: "en", from: "Minato-senpai", to: "Minato", d: "EN: 湊先輩 → 'Minato' (honorific dropped under keep policy)" },
  { id: "s2_011", cat: "honorific", field: "en", from: "Minato-senpai", to: "Minato-sempai", d: "EN: -senpai → -sempai (romanization drift)" },
  { id: "s4_029", cat: "honorific", field: "en", from: "Minato-senpai's", to: "Senpai's", d: "EN: 'Minato-senpai' → 'Senpai' (name dropped)" },
  { id: "s2_013", cat: "honorific", field: "en", from: "Asagiri-san", to: "Mr. Asagiri", d: "EN: 朝霧さん → 'Mr. Asagiri' (localized under keep policy)" },
  { id: "s2_009", cat: "honorific", field: "en", from: "Shiori-dono", to: "Lady Shiori", d: "EN: 詩織殿 → 'Lady Shiori' (localized under keep policy)" },
  { id: "s6_011", cat: "honorific", field: "en", from: "Asagiri-senpai", to: "Asagiri-san", d: "EN: 朝霧先輩 → 'Asagiri-san' (wrong honorific)" },
  { id: "s5_021", cat: "honorific", field: "ja", from: "湊先輩！　湊先輩、", to: "湊さん！　湊先輩、", d: "JA: 湊先輩 → 湊さん (source honorific changed; EN still -senpai)" },
  { id: "s2_026", cat: "honorific", field: "en", from: "Asagiri-kun", to: "Asagiri", d: "EN: 朝霧くん → 'Asagiri' (honorific dropped)" },
  { id: "s6_025", cat: "honorific", field: "en", from: "Narumi-sensei", to: "Mr. Narumi", d: "EN: 鳴海先生 → 'Mr. Narumi' (localized under keep policy)" },

  // pronoun — JA first-person swaps
  { id: "s1_013", cat: "pronoun", field: "ja", from: "俺は", to: "僕は", d: "湊: 俺 → 僕" },
  { id: "s1_029", cat: "pronoun", field: "ja", from: "わたくし、", to: "わたし、", d: "詩織: わたくし → わたし" },
  { id: "s4_028", cat: "pronoun", field: "ja", from: "あたしが", to: "私が", d: "小春: あたし → 私" },
  { id: "s1_015", cat: "pronoun", field: "ja", from: "うちは", to: "あたしは", d: "奏: うち → あたし" },
  { id: "s3_006", cat: "pronoun", field: "ja", from: "拙者は", to: "俺は", d: "源之助: 拙者 → 俺" },
  { id: "s4_019", cat: "pronoun", field: "ja", from: "私が", to: "あたしが", d: "黒羽: 私 → あたし" },
  { id: "s2_024", cat: "pronoun", field: "ja", from: "僕は", to: "俺は", d: "鳴海: 僕 → 俺" },

  // politeness — JA keigo/plain flips
  { id: "s2_007", cat: "politeness", field: "ja", from: "学園の宝です。星見祭で百年ぶりに一般公開する予定なのです。", to: "学園の宝だ。星見祭で百年ぶりに一般公開する予定なんだ。", d: "詩織 (polite) → plain" },
  { id: "s4_018", cat: "politeness", field: "ja", from: "皆さん……ありがとうございます。生徒会も全面的に協力いたします。", to: "みんな……ありがとう。生徒会も全面的に協力するわ。", d: "詩織 (polite) → plain" },
  { id: "s3_024", cat: "politeness", field: "ja", from: "どういたしまして。でも、ここで見たことは内緒にしてくださいね。", to: "どういたしまして。でも、ここで見たことは内緒にしてね。", d: "黒羽 (polite) → plain" },
  { id: "s1_011", cat: "politeness", field: "ja", from: "連れてきたのか。", to: "連れてきたんですか。", d: "湊 (plain) → polite to a junior" },
  { id: "s3_028", cat: "politeness", field: "ja", from: "ほな、誰かが先生のカードを使うたってことか。", to: "では、誰かが先生のカードを使ったということですか。", d: "奏 (plain, Kansai) → standard polite" },

  // contraction — EN contractions for no-contraction characters
  { id: "s2_008", cat: "contraction", field: "en", from: "it is just a prank, but I cannot believe that", to: "it's just a prank, but I can't believe that", d: "詩織: it's / can't" },
  { id: "s4_010", cat: "contraction", field: "en", from: "there is something I must tell you", to: "there's something I've got to tell you", d: "詩織: there's / I've" },
  { id: "s5_026", cat: "contraction", field: "en", from: "You will not escape! I am waiting", to: "You won't escape! I'm waiting", d: "源之助: won't / I'm" },
  { id: "s1_020", cat: "contraction", field: "en", from: "I am Gennosuke", to: "I'm Gennosuke", d: "源之助: I'm" },

  // avoid-word — words the character would never say
  { id: "s4_007", cat: "avoid-word", field: "en", from: "Excuse me. Has anyone", to: "Hey guys. Has anyone", d: "詩織: 'guys'" },
  { id: "s6_013", cat: "avoid-word", field: "en", from: "What...!", to: "Whoa, dude...!", d: "源之助: 'dude'" },
  { id: "s7_011", cat: "avoid-word", field: "en", from: "Hehe. Then", to: "Yeah, okay. Then", d: "詩織: 'yeah' / 'okay'" },

  // placeholder
  { id: "s3_020", cat: "placeholder", field: "en", from: " ×{0}", to: "", d: "EN: {0} dropped" },
  { id: "s1_014", cat: "placeholder", field: "en", from: "Sorry about this, [PLAYER].", to: "Sorry about this.", d: "EN: [PLAYER] dropped" },
  { id: "s9_008", cat: "placeholder", field: "en", from: "%s's", to: "%d's", d: "EN: %s → %d" },
  { id: "s4_022", cat: "placeholder", field: "en", from: "{0},", to: "{1},", d: "EN: {0} → {1}" },
  { id: "s3_041", cat: "placeholder", field: "en", from: "[PLAYER]", to: "[Player]", d: "EN: [PLAYER] → [Player] (case)" },

  // ruby
  { id: "s1_009", cat: "ruby", field: "ja", from: "{旧校舎|きゅうこうしゃ}", to: "{旧校舎|きゅうこうしゃ", d: "JA: ruby not closed" },
  { id: "s6_012", cat: "ruby", field: "ja", from: "{怪盗|かいとう}", to: "{怪盗｜かいとう}", d: "JA: full-width bar in ruby" },
  { id: "s2_030", cat: "ruby", field: "ja", from: "{黒羽|くろは}", to: "{黒羽|}", d: "JA: empty ruby reading" },

  // length
  { id: "s2_017", cat: "length", field: "en", from: "▶ Offer to help", to: "▶ Offer to help with the investigation into the phantom thief", d: "EN over max_length 40" },
  { id: "s9_009", cat: "length", field: "en", from: "Auto Mode", to: "Automatic Text Advance Mode", d: "EN over max_length 16" },
  { id: "s9_013", cat: "length", field: "en", from: "Film Camera", to: "Grandma's Vintage Film Camera", d: "EN over max_length 20" },

  // untranslated
  { id: "s3_031", cat: "untranslated", field: "en", set: "女子……？", d: "EN = JA source (untranslated)" },
  { id: "s9_011", cat: "untranslated", field: "en", set: "バックログ", d: "EN = JA source (untranslated UI)" },
  { id: "s5_032", cat: "untranslated", field: "en", set: "", d: "EN empty" },

  // copy — EN pasted from a neighbouring line
  { id: "s3_019", cat: "copy", field: "en", copyFrom: "s3_018", d: "EN copied from s3_018" },
  { id: "s5_030", cat: "copy", field: "en", copyFrom: "s5_029", d: "EN copied from s5_029 ('Bong...')" },
];

// Lines that are correct as written but look suspicious. Not modified; recorded with expected=none.
const TRICKY = [
  { id: "s1_017", cat: "tricky:nickname", d: "奏 calls 小春 'こはるん' → 'Koharun' (nickname listed as alias)" },
  { id: "s1_021", cat: "tricky:nickname", d: "奏 calls 源之助 'ゲンちゃん' → 'Gen-chan' (nickname)" },
  { id: "s1_025", cat: "tricky:uchi-our", d: "湊 says 'うちの部' = 'our club' (not a first-person pronoun)" },
  { id: "s2_025", cat: "tricky:title", d: "校長先生 → 'the principal' (a title, not name+honorific; keep policy does not apply)" },
  { id: "s2_027", cat: "tricky:register", d: "湊 (plain) speaks polite to a teacher: 'わかってますよ、先生' — natural register shift" },
  { id: "s3_005", cat: "tricky:dialect", d: "奏 (Kansai) EN uses 'gonna' / 'y'know' — allowed for her (avoid-list belongs to other characters)" },
  { id: "s3_040", cat: "tricky:generic-term", d: "'chronograph' used generically for a wristwatch, lower-case, next to the proper 'the Chronograph'" },
  { id: "s4_013", cat: "tricky:quote", d: "黒羽 quotes Crow's card 『僕は約束を守る』 — 僕 is inside a quotation" },
  { id: "s4_014", cat: "tricky:quote", d: "小春 quotes 『僕』 — meta-mention of the pronoun" },
  { id: "s4_016", cat: "tricky:quote", d: "奏 mentions 『俺』 — meta-mention of the pronoun" },
  { id: "s5_005b", cat: "tricky:compound-term", d: "部室棟 (club building) contains 部室 but is a different word; 'clubroom' is correctly absent" },
  { id: "s6_021", cat: "tricky:marked-register-break", d: "詩織's polite speech intentionally breaks (scene marks it in s6_022); EN keeps no contractions" },
  { id: "s6_029", cat: "tricky:marked-honorific-drop", d: "小春 calls 湊 without 先輩, marked by narration s6_030; EN 'Minato!' matches" },
  { id: "s6_033", cat: "tricky:identical", d: "'Q.E.D.' identical in JA and EN — intentional" },
  { id: "s7_005b", cat: "tricky:quote", d: "小春 quotes 源之助's line 『拙者が…』 — 拙者 inside a quotation" },
  { id: "s7_008", cat: "tricky:marked-honorific-shift", d: "詩織 slips to 湊さん then corrects to 朝霧さん; marked by narration s7_009; EN mirrors it" },
  { id: "s9_006", cat: "tricky:placeholder-order", d: "{1}個の{0} → 'Obtained {0} ×{1}' — reordered, same placeholder set" },
  { id: "s9_012", cat: "tricky:length-boundary", d: "'Return to Title' is exactly max_length 15" },
];

// ---------------------------------------------------------------------------------------------
const rows = parseCsv(readFileSync(join(DIR, "script_clean.csv"), "utf8"));
const header = rows[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const body = rows.slice(1).filter((r) => r.length > 1);
const byId = new Map(body.map((r, i) => [r[col.id], { r, line: i + 2 }]));
const cleanEn = new Map(body.map((r) => [r[col.id], r[col.en]]));

const seen = new Set();
const truth = [];
for (const inj of INJECTIONS) {
  const hit = byId.get(inj.id);
  if (!hit) throw new Error(`unknown id ${inj.id}`);
  if (seen.has(inj.id)) throw new Error(`two injections on ${inj.id}`);
  seen.add(inj.id);
  const c = col[inj.field];
  if (inj.set !== undefined) hit.r[c] = inj.set;
  else if (inj.copyFrom) hit.r[c] = cleanEn.get(inj.copyFrom);
  else {
    if (!hit.r[c].includes(inj.from)) throw new Error(`${inj.id}: '${inj.from}' not in ${inj.field}`);
    const to = inj.alts ? pick(inj.alts) : inj.to;
    hit.r[c] = hit.r[c].replace(inj.from, to);
    inj.d = inj.d + (inj.alts ? ` [chose '${to}']` : "");
  }
  truth.push({ line: hit.line, id: inj.id, category: inj.cat, expected: "flag", description: `${inj.field}: ${inj.d}` });
}
for (const t of TRICKY) {
  const hit = byId.get(t.id);
  if (!hit) throw new Error(`unknown tricky id ${t.id}`);
  if (seen.has(t.id)) throw new Error(`tricky ${t.id} collides with an injection`);
  truth.push({ line: hit.line, id: t.id, category: t.cat, expected: "none", description: t.d });
}
truth.sort((a, b) => a.line - b.line);

const out = [header.join(",")];
for (const r of body) out.push([r[col.id], q(r[col.speaker]), qAlways(r[col.ja]), qAlways(r[col.en]), r[col.max_length]].join(","));
writeFileSync(join(DIR, "script_drifted.csv"), out.join("\n") + "\n");
writeFileSync(
  join(DIR, "truth.csv"),
  ["line,id,category,expected,description", ...truth.map((t) => [t.line, t.id, q(t.category), t.expected, q(t.description)].join(","))].join("\n") + "\n",
);
console.error(`injected ${INJECTIONS.length} errors, ${TRICKY.length} tricky-correct lines → script_drifted.csv, truth.csv (seed ${SEED})`);
