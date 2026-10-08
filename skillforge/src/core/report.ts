import { CATEGORY_ORDER } from "./engine.js";
import { countBy } from "./text.js";
import type { Category, CheckResult, Finding, Severity } from "./types.js";

const TITLES: Record<Category, string> = {
  term: "Glossary term drift / 用語の訳揺れ",
  notation: "Katakana notation drift / 表記揺れ",
  name: "Character name drift / キャラ名の揺れ",
  honorific: "Honorific drift / 敬称の揺れ",
  voice: "Voice drift / 口調の揺れ",
  placeholder: "Placeholders (bonus)",
  tag: "Tags (bonus)",
  ruby: "Ruby (bonus)",
  length: "Length limits (bonus)",
};
const ICON: Record<Severity, string> = { error: "❌", warning: "⚠️", info: "ℹ️" };
const CORE: Category[] = ["term", "notation", "name", "honorific", "voice"];

const loc = (f: Finding) => `\`${f.file}:${f.line}\``;
const usageLine = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`)
    .join(" · ");

export function renderMarkdown(r: CheckResult, opts: { includeInfo?: boolean; includePackets?: boolean } = {}): string {
  const includeInfo = opts.includeInfo ?? true;
  const findings = includeInfo ? r.findings : r.findings.filter((f) => f.severity !== "info");
  const out: string[] = [];
  out.push("# Script consistency report", "");
  for (const t of r.tables) out.push(`- **${t.file}** — ${t.format.toUpperCase()}, ${t.rows} rows, ${t.sourceLang} → ${t.targetLang}`);
  out.push(`- Glossary: ${r.glossary.terms} terms, ${r.glossary.characters} characters`, "");

  out.push("| Check | ❌ error | ⚠️ warning | ℹ️ info |", "|---|---:|---:|---:|");
  for (const c of CATEGORY_ORDER) {
    const fs = r.findings.filter((f) => f.category === c);
    if (!fs.length && !CORE.includes(c)) continue;
    const n = (s: Severity) => fs.filter((f) => f.severity === s).length;
    out.push(`| ${TITLES[c]} | ${n("error")} | ${n("warning")} | ${n("info")} |`);
  }
  out.push("");
  if (!findings.length) out.push("No issues found.", "");

  for (const c of CATEGORY_ORDER) {
    const fs = findings.filter((f) => f.category === c);
    const usage = r.usage.filter((u) => u.category === c && Object.keys(u.counts).length > 1);
    if (!fs.length) continue;
    out.push(`## ${TITLES[c]}`, "");
    for (const [group, list] of countBy(fs, (f) => f.group ?? "")) {
      if (group) out.push(`### ${group}`);
      const u = usage.find((x) => x.group === group);
      if (u) out.push(`Usage: ${usageLine(u.counts)}`);
      if (group || u) out.push("");
      for (const f of list) out.push(`- ${ICON[f.severity]} ${loc(f)} \`${f.id}\` (${f.side}) — ${f.message}`);
      out.push("");
    }
  }

  if (opts.includePackets !== false && r.reviewPackets.length) {
    out.push("## Needs judgement (review packets)", "");
    out.push(`${r.reviewPackets.length} packet(s) for the reviewer: ` + r.reviewPackets.map((p) => `${p.kind} — ${p.subject} (${p.lines.length} lines)`).join("; "), "");
  }
  return out.join("\n");
}
