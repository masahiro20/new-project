import { CATEGORY_ORDER } from "./engine.js";
import { countBy } from "./text.js";
import { reportLabels } from "./i18n.js";
import type { Category, CheckResult, Finding, Locale, Severity } from "./types.js";

const ICON: Record<Severity, string> = { error: "❌", warning: "⚠️", info: "ℹ️" };
const CORE: Category[] = ["term", "notation", "name", "honorific", "voice"];

const loc = (f: Finding) => `\`${f.file}:${f.line}\``;
const usageLine = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`)
    .join(" · ");

/**
 * `licensedTo`: the licensee name from a valid license key (CLI only). Shown under the heading so a report traces back
 * to its license; the key itself never appears in any report.
 */
export function renderMarkdown(r: CheckResult, opts: { includeInfo?: boolean; includePackets?: boolean; locale?: Locale; licensedTo?: string } = {}): string {
  const L = reportLabels(opts.locale);
  const TITLES = L.titles;
  const includeInfo = opts.includeInfo ?? true;
  const findings = includeInfo ? r.findings : r.findings.filter((f) => f.severity !== "info");
  const out: string[] = [];
  out.push(`# ${L.heading}`, "");
  if (opts.licensedTo) out.push(`Licensed to ${opts.licensedTo.replace(/[\u0000-\u001f\u007f`*_<>[\]|\\]/g, "").slice(0, 100)}`, "");
  for (const t of r.tables) out.push(L.tableLine(t.file, t.format.toUpperCase(), t.rows, t.sourceLang, t.targetLang));
  out.push(L.glossaryLine(r.glossary.terms, r.glossary.characters), "");

  out.push(L.summaryHeader, "|---|---:|---:|---:|");
  for (const c of CATEGORY_ORDER) {
    const fs = r.findings.filter((f) => f.category === c);
    if (!fs.length && !CORE.includes(c)) continue;
    const n = (s: Severity) => fs.filter((f) => f.severity === s).length;
    out.push(`| ${TITLES[c]} | ${n("error")} | ${n("warning")} | ${n("info")} |`);
  }
  out.push("");
  if (!findings.length) out.push(L.noIssues, "");

  for (const c of CATEGORY_ORDER) {
    const fs = findings.filter((f) => f.category === c);
    const usage = r.usage.filter((u) => u.category === c && Object.keys(u.counts).length > 1);
    if (!fs.length) continue;
    out.push(`## ${TITLES[c]}`, "");
    for (const [group, list] of countBy(fs, (f) => f.group ?? "")) {
      if (group) out.push(`### ${group}`);
      const u = usage.find((x) => x.group === group);
      if (u) out.push(`${L.usage}: ${usageLine(u.counts)}`);
      if (group || u) out.push("");
      for (const f of list) out.push(`- ${ICON[f.severity]} ${loc(f)} \`${f.id}\` (${L.side[f.side]}) — ${f.message}`);
      out.push("");
    }
  }

  if (opts.includePackets !== false && r.reviewPackets.length) {
    out.push(`## ${L.packetsHeading}`, "");
    out.push(L.packetsIntro(r.reviewPackets.length) + r.reviewPackets.map((p) => L.packetItem(p.kind, p.subject, p.lines.length)).join(L.packetSep), "");
  }
  return out.join("\n");
}
