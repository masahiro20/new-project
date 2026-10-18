// Deterministic pre-check: evaluates every rule against the plan and returns
// the triggered ones grouped by severity. This runs before the model so the
// obvious obligations are never missed and always come with a citation.

import { CATEGORY_ORDER, RULES, type Category, type Rule, type Severity } from "./knowledge";
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
  for (const { category, items } of groupByCategory(findings)) {
    lines.push(`## ${category}`);
    for (const { rule, severity } of items) {
      lines.push(`### [${SEVERITY_LABEL[severity]}] ${rule.title}`);
      lines.push(rule.summary);
      lines.push(`対応：${rule.action}`);
      lines.push(`根拠：${rule.cites.map((c) => `${citeLabel(c)}（${citeUrl(c)}）`).join("、")}`);
      if (rule.refs?.length) lines.push(`参考：${rule.refs.map((r) => `${r.label}（${r.url}）`).join("、")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
