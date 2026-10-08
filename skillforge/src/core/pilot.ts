import { parseCsvRecords } from "./parsers/csv.js";
import type { CheckResult, Table } from "./types.js";

/**
 * Pilot measurement helpers: export findings to a labeling sheet, then score the labeled sheet.
 * precision = TP / (TP + FP) per category and rule; recall needs a list of known issues
 * (e.g. the bugs a human LQA pass filed on the same build).
 */

export const LABEL_COLUMNS = ["finding", "file", "line", "string_id", "category", "rule", "severity", "side", "message", "source", "target", "verdict", "note"] as const;

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function findingsToLabelCsv(result: CheckResult, tables: Table[]): string {
  const rows = new Map(tables.flatMap((t) => t.rows.map((r) => [`${r.file}\u0000${r.id}`, r] as const)));
  const out = [LABEL_COLUMNS.join(",")];
  result.findings.forEach((f, i) => {
    const row = rows.get(`${f.file}\u0000${f.id}`);
    out.push(
      [`F${String(i + 1).padStart(4, "0")}`, f.file, f.line, f.id, f.category, f.rule, f.severity, f.side, f.message, row?.source ?? "", row?.target ?? "", "", ""]
        .map(csvCell)
        .join(","),
    );
  });
  return out.join("\n") + "\n";
}

export interface Score {
  key: string;
  tp: number;
  fp: number;
  unsure: number;
  unlabeled: number;
  precision: number | null;
}

export interface ScoreReport {
  byCategory: Score[];
  byRule: Score[];
  total: Score;
  recall?: { known: number; found: number; recall: number; missed: { string_id: string; category: string }[] };
}

type Labeled = Record<(typeof LABEL_COLUMNS)[number], string>;

function readCsv(text: string): Record<string, string>[] {
  const recs = parseCsvRecords(text);
  const header = recs.shift()?.cells.map((h) => h.trim().toLowerCase()) ?? [];
  return recs.map((r) => Object.fromEntries(header.map((h, i) => [h, (r.cells[i] ?? "").trim()])));
}

const verdictOf = (v: string): "tp" | "fp" | "unsure" | "unlabeled" => {
  const x = v.trim().toLowerCase();
  if (["tp", "ok", "true", "y", "yes", "正", "正解", "○"].includes(x)) return "tp";
  if (["fp", "false", "n", "no", "誤", "誤検出", "×"].includes(x)) return "fp";
  if (x) return "unsure";
  return "unlabeled";
};

function tally(key: string, items: Labeled[]): Score {
  const s: Score = { key, tp: 0, fp: 0, unsure: 0, unlabeled: 0, precision: null };
  for (const it of items) s[verdictOf(it.verdict)]++;
  s.precision = s.tp + s.fp ? s.tp / (s.tp + s.fp) : null;
  return s;
}

const group = (items: Labeled[], k: keyof Labeled) => {
  const m = new Map<string, Labeled[]>();
  items.forEach((it) => m.set(it[k], [...(m.get(it[k]) ?? []), it]));
  return [...m].map(([key, list]) => tally(key, list)).sort((a, b) => a.key.localeCompare(b.key));
};

/**
 * Score a labeled sheet. `knownCsv` (optional) lists issues found by a human pass, with columns
 * string_id and category; an issue counts as found when a finding of that category hits that string.
 */
export function scoreLabels(labelCsv: string, knownCsv?: string): ScoreReport {
  const items = readCsv(labelCsv) as Labeled[];
  const report: ScoreReport = { byCategory: group(items, "category"), byRule: group(items, "rule"), total: tally("total", items) };
  if (knownCsv) {
    const known = readCsv(knownCsv).filter((k) => k.string_id);
    const hit = new Set(items.map((i) => `${i.string_id}\u0000${i.category}`));
    const missed = known.filter((k) => !hit.has(`${k.string_id}\u0000${k.category}`)).map((k) => ({ string_id: k.string_id!, category: k.category ?? "" }));
    report.recall = { known: known.length, found: known.length - missed.length, recall: known.length ? (known.length - missed.length) / known.length : 0, missed };
  }
  return report;
}

export function renderScore(r: ScoreReport): string {
  const pct = (p: number | null) => (p === null ? "—" : `${(p * 100).toFixed(1)}%`);
  const table = (title: string, rows: Score[]) => [
    `## ${title}`, "", "| | TP | FP | unsure | unlabeled | precision |", "|---|---:|---:|---:|---:|---:|",
    ...rows.map((s) => `| ${s.key} | ${s.tp} | ${s.fp} | ${s.unsure} | ${s.unlabeled} | ${pct(s.precision)} |`), "",
  ];
  const out = ["# Pilot score", "", `Overall precision: **${pct(r.total.precision)}** (${r.total.tp} TP / ${r.total.fp} FP, ${r.total.unsure} unsure, ${r.total.unlabeled} unlabeled)`, ""];
  out.push(...table("By category", r.byCategory), ...table("By rule", r.byRule));
  if (r.recall) {
    out.push("## Recall against known issues", "", `${r.recall.found} / ${r.recall.known} found (**${pct(r.recall.recall)}**)`, "");
    if (r.recall.missed.length) out.push("Missed:", ...r.recall.missed.map((m) => `- ${m.string_id} (${m.category})`), "");
  }
  return out.join("\n");
}
