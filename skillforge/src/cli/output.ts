// Output renderers for `kotomark check` besides Markdown and JUnit (see src/core/junit.ts).
import { CATEGORY_ORDER } from "../core/engine.js";
import { atOrAbove } from "../core/junit.js";
import { reportLabels } from "../core/i18n.js";
import type { Category, CheckResult, Locale, Severity } from "../core/types.js";

export interface Summary {
  errors: number;
  warnings: number;
  infos: number;
  byCategory: Partial<Record<Category, { errors: number; warnings: number; infos: number }>>;
}

export function summarize(r: CheckResult): Summary {
  const s: Summary = { errors: 0, warnings: 0, infos: 0, byCategory: {} };
  const key = { error: "errors", warning: "warnings", info: "infos" } as const;
  for (const f of r.findings) {
    s[key[f.severity]]++;
    const c = (s.byCategory[f.category] ??= { errors: 0, warnings: 0, infos: 0 });
    c[key[f.severity]]++;
  }
  return s;
}

/** Keep only findings at or above `min`. Usage tallies and review packets are left as they are. */
export function filterBySeverity(r: CheckResult, min: Severity): CheckResult {
  return { ...r, findings: r.findings.filter((f) => atOrAbove(f.severity, min)) };
}

// GitHub Actions workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
// Message data escapes %, CR, LF; property values additionally escape ":" and ",".
export const ghData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
export const ghProp = (s: string) => ghData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

const GH_LEVEL: Record<Severity, string> = { error: "error", warning: "warning", info: "notice" };

export function renderGithub(r: CheckResult, opts: { locale?: Locale } = {}): string {
  const titles = reportLabels(opts.locale).titles;
  const order = (c: Category) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  const fs = [...r.findings].sort((a, b) => order(a.category) - order(b.category) || a.file.localeCompare(b.file) || a.line - b.line);
  const lines = fs.map((f) => {
    const title = `Kotomark ${f.rule} — ${titles[f.category] ?? f.category}`;
    return `::${GH_LEVEL[f.severity]} file=${ghProp(f.file)},line=${f.line},title=${ghProp(title)}::${ghData(`[${f.id}] ${f.message}`)}`;
  });
  const s = summarize(r);
  lines.push(`Kotomark: ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info.`);
  return lines.join("\n");
}
