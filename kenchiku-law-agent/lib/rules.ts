// Deterministic pre-check: evaluates every rule against the plan and returns
// the triggered ones grouped by severity. This runs before the model so the
// obvious obligations are never missed and always come with a citation.

import { CATEGORY_ORDER, RULES, STAGE_ORDER, type Category, type Rule, type Severity, type Stage } from "./knowledge";
import { LAWS, articleLabel } from "./laws";
import { lawUrl } from "./egov";
import type { PlanInput } from "./plan";

export type Finding = { rule: Rule; severity: Severity };

export const SEVERITY_LABEL: Record<Severity, string> = {
  required: "該当（法令上の義務・許可が必要）",
  likely: "該当の可能性が高い",
  check: "要確認（入力不足または条例依存）",
};

const SEVERITY_RANK: Record<Severity, number> = { required: 0, likely: 1, check: 2 };

export function runRules(plan: PlanInput): Finding[] {
  const out: Finding[] = [];
  for (const rule of RULES) {
    const severity = rule.when(plan);
    if (severity) out.push({ rule, severity });
  }
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      CATEGORY_ORDER.indexOf(a.rule.category) - CATEGORY_ORDER.indexOf(b.rule.category),
  );
}

export function groupByCategory(findings: Finding[]): { category: Category; items: Finding[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, items: findings.filter((f) => f.rule.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}

export const SEVERITY_SHORT: Record<Severity, string> = { required: "必須", likely: "可能性高", check: "要確認" };

/**
 * Splits findings the way people read them:
 * - specific: what makes *this* lot / plan different (must not be missed)
 * - checks:   things to confirm at the counter (input missing or ordinance-dependent)
 * - routine:  obligations every new house has (folded in the UI)
 */
export function splitFindings(findings: Finding[]): { specific: Finding[]; checks: Finding[]; routine: Finding[] } {
  const routine = findings.filter((f) => f.rule.routine);
  const rest = findings.filter((f) => !f.rule.routine);
  return { specific: rest.filter((f) => f.severity !== "check"), checks: rest.filter((f) => f.severity === "check"), routine };
}

export function groupByStage(findings: Finding[]): { stage: Stage; items: Finding[] }[] {
  return STAGE_ORDER.map((stage) => ({ stage, items: findings.filter((f) => f.rule.stage === stage) })).filter((g) => g.items.length > 0);
}

/** Pre-construction consultations: one row per counter, most severe first. */
export function groupByAgency(findings: Finding[]): { agency: string; items: Finding[] }[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.rule.stage !== "計画段階" && f.severity === "check") continue;
    map.set(f.rule.agency, [...(map.get(f.rule.agency) ?? []), f]);
  }
  return [...map.entries()]
    .map(([agency, items]) => ({ agency, items }))
    .sort((a, b) => Math.min(...a.items.map((f) => SEVERITY_RANK[f.severity])) - Math.min(...b.items.map((f) => SEVERITY_RANK[f.severity])) || b.items.length - a.items.length);
}

export function citeLabel(c: Rule["cites"][number]): string {
  return `${LAWS[c.law].title}${articleLabel(c.article)}${c.note ? `（${c.note}）` : ""}`;
}

export function citeUrl(c: Rule["cites"][number]): string {
  return lawUrl(LAWS[c.law].id, c.article);
}

/** Markdown summary of the pre-check, handed to the model as verified ground truth. */
export function findingsToMarkdown(findings: Finding[]): string {
  if (findings.length === 0) return "（ルールベースの該当なし）";
  const lines: string[] = [];
  const { specific, checks, routine } = splitFindings(findings);
  const sections: [string, Finding[]][] = [
    ["A. この敷地・計画に固有の論点（必ず回答に反映する）", specific],
    ["B. 窓口で確認が必要な点（入力不足・条例依存）", checks],
    ["C. 通常の新築で毎回必要な手続き（回答では手続きの流れに簡潔に入れる程度でよい）", routine],
  ];
  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`## ${title}`);
    for (const { rule, severity } of items) {
      lines.push(`### [${SEVERITY_LABEL[severity]}] ${rule.title}（段階：${rule.stage}／窓口：${rule.agency}）`);
      lines.push(rule.summary);
      lines.push(`対応：${rule.action}`);
      lines.push(`根拠：${rule.cites.map((c) => `${citeLabel(c)}（${citeUrl(c)}）`).join("、")}`);
      if (rule.refs?.length) lines.push(`参考：${rule.refs.map((r) => `${r.label}（${r.url}）`).join("、")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
