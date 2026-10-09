// Shared helpers for the human review kit (scripts/human-review.mjs, scripts/human-review-score.mjs; docs/human-review.md):
// CSV in/out, a seeded PRNG, the stratified sample, and the statistics (Wilson interval, Cohen's kappa, reweighting by rule).
// No dependencies, so the scoring runs anywhere Node runs.

// ---------- CSV ----------

/** RFC 4180 CSV → array of records (arrays of strings). Accepts \n or \r\n, quoted fields with "" escapes, and a BOM. */
export function parseCsv(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** CSV with a header line → array of objects keyed by the header (trimmed, lower-cased). */
export function parseCsvObjects(text) {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

export function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- seeded randomness and the sample ----------

/** mulberry32: small, fast, reproducible across platforms (the browser sheet and Node give the same numbers). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates on a copy. */
export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const isUntranslated = (rule) => rule.startsWith("untranslated.");

/**
 * Picks the review sample from the labeled findings ({project, finding, rule, sample, …}). The AI verdicts are never
 * looked at, so the draw is blind to them.
 *  - Eligible: warning/error rows (sample = warning_error or census_extra); info rows only with includeInfo.
 *  - Every non-untranslated.* row is taken (there are few of them, and they are the rows the AI number says least about).
 *  - The rest of the size is drawn from the untranslated.* rows, split across projects in proportion to their labeled
 *    counts (largest remainder), at random within each project.
 * Returns the chosen rows in a shuffled presentation order.
 */
export function stratifiedSample(labels, { size = 100, seed = 20261009, includeInfo = false } = {}) {
  const rnd = mulberry32(seed);
  const eligible = labels.filter((l) => l.sample === "warning_error" || l.sample === "census_extra" || (includeInfo && l.sample === "info"));
  const others = eligible.filter((l) => !isUntranslated(l.rule));
  const untr = eligible.filter((l) => isUntranslated(l.rule));
  let chosen;
  if (others.length >= size) chosen = shuffle(others, rnd).slice(0, size);
  else {
    const k = Math.min(size - others.length, untr.length);
    const byProject = new Map();
    for (const l of untr) byProject.set(l.project, [...(byProject.get(l.project) ?? []), l]);
    const projects = [...byProject.keys()].sort();
    const quota = projects.map((p) => ({ p, exact: (k * byProject.get(p).length) / untr.length }));
    for (const q of quota) q.n = Math.floor(q.exact);
    let left = k - quota.reduce((s, q) => s + q.n, 0);
    for (const q of [...quota].sort((a, b) => (b.exact - b.n) - (a.exact - a.n) || a.p.localeCompare(b.p))) {
      if (left <= 0) break;
      q.n++;
      left--;
    }
    chosen = [...others];
    for (const q of quota) chosen.push(...shuffle(byProject.get(q.p), rnd).slice(0, q.n));
  }
  return shuffle(chosen, rnd);
}

// ---------- statistics ----------

/** Wilson score interval for k successes in n trials (z = 1.96 → 95%). null when n = 0. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null;
  return wilsonP(k / n, n, z);
}

/** Wilson interval for a proportion p observed on an (effective) sample size n. */
export function wilsonP(p, n, z = 1.96) {
  if (!(n > 0)) return null;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Cohen's kappa for two raters over the same items. a, b: arrays of category labels (same length).
 * Returns { n, observed, expected, kappa }; kappa is null when expected agreement is 1 (both raters used one and the
 * same category for everything — kappa is undefined there, report raw agreement instead).
 */
export function cohenKappa(a, b) {
  if (a.length !== b.length) throw new Error("cohenKappa: arrays differ in length");
  const n = a.length;
  if (!n) return { n: 0, observed: null, expected: null, kappa: null };
  const cats = [...new Set([...a, ...b])];
  let agree = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  let pe = 0;
  for (const c of cats) pe += (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n);
  const kappa = pe >= 1 - 1e-12 ? null : (po - pe) / (1 - pe);
  return { n, observed: po, expected: pe, kappa };
}

/**
 * Precision reweighted by stratum (rule). strata: [{ key, weight, tp, fp }] where weight is the stratum's share (or
 * count) in the population the estimate is for, and tp/fp are the reviewed counts in that stratum (unsure excluded).
 * Strata with no decisive verdict are dropped and the rest renormalised; they are listed in `missing`.
 * Variance: Σ w² p(1−p)/n (stratified sampling, independent strata). The 95% interval is Wilson's on the effective
 * sample size n_eff = p(1−p)/variance; when the variance is 0 (every stratum all-TP or all-FP) n_eff falls back to the
 * total decisive count.
 */
export function stratifiedPrecision(strata, z = 1.96) {
  const used = strata.filter((s) => s.tp + s.fp > 0 && s.weight > 0);
  const missing = strata.filter((s) => !(s.tp + s.fp > 0) && s.weight > 0).map((s) => s.key);
  const W = used.reduce((t, s) => t + s.weight, 0);
  if (!used.length || W <= 0) return { estimate: null, ci: null, nEff: 0, n: 0, missing, coveredWeight: 0 };
  const totalW = strata.reduce((t, s) => t + (s.weight > 0 ? s.weight : 0), 0);
  let p = 0;
  let v = 0;
  let n = 0;
  for (const s of used) {
    const w = s.weight / W;
    const ns = s.tp + s.fp;
    const ps = s.tp / ns;
    p += w * ps;
    v += (w * w * ps * (1 - ps)) / ns;
    n += ns;
  }
  const nEff = v > 0 ? (p * (1 - p)) / v : n;
  return { estimate: p, ci: wilsonP(p, nEff, z), nEff, n, missing, coveredWeight: W / totalW };
}

// ---------- verdicts ----------

export const VERDICTS = ["correct", "false_positive", "cant_tell"];
/** AI label (labels.csv) → the sheet's verdict codes. */
export const AI_TO_VERDICT = { TP: "correct", FP: "false_positive", unsure: "cant_tell" };

/** Normalises a reviewer's verdict cell (codes, the Japanese button labels, or TP/FP/unsure). */
export function normVerdict(v) {
  const s = String(v ?? "").trim();
  const low = s.toLowerCase();
  if (["correct", "tp", "true_positive", "正しい指摘"].includes(low) || s === "正しい指摘") return "correct";
  if (["false_positive", "fp", "誤検知"].includes(low) || s === "誤検知") return "false_positive";
  if (["cant_tell", "unsure", "判断できない"].includes(low) || s === "判断できない") return "cant_tell";
  return "";
}
