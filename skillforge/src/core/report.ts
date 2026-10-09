import { CATEGORY_ORDER } from "./engine.js";
import { countBy } from "./text.js";
import { reportLabels } from "./i18n.js";
import type { Category, CheckResult, Finding, Locale, Severity } from "./types.js";

const ICON: Record<Severity, string> = { error: "❌", warning: "⚠️", info: "ℹ️" };
const CORE: Category[] = ["term", "notation", "name", "honorific", "voice"];

// ---- Escaping of untrusted values (file names, ids, group names, script text) ----
// The report is pasted into trackers and wikis, some of which render raw HTML, so no value may open an HTML tag,
// a link, a code span or emphasis, or start a new block. Ordinary values (no markup characters) come out unchanged.

/** One line: CR/LF and other C0 controls would start a new Markdown block, so fold them to spaces. */
const oneLine = (s: string) => s.replace(/\r\n|[\u0000-\u001f\u007f\u2028\u2029]/g, " ");

/**
 * Inline text, never inside a table (so `|` is left as is). Entities for `<` `>` (safe even in renderers without
 * backslash escapes for them), `&` only where it would read as an entity, backslash escapes for the rest (CommonMark).
 * `_` inside a word cannot open emphasis, so `player_name` stays as is.
 */
export function mdText(s: string): string {
  return oneLine(s)
    .replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\")
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[`*~]/g, "\\$&")
    // A link or image needs `](` (Markdown.pl also allows spaces between); `[PLAYER]` alone stays readable.
    .replace(/\](?=\s*\()/g, "\\]")
    .replace(/_/g, (m, i: number, str: string) => (/[\p{L}\p{N}]/u.test(str[i - 1] ?? "") && /[\p{L}\p{N}]/u.test(str[i + 1] ?? "") ? m : "\\_"));
}

/** Heading text: as mdText, plus `#` (a trailing run would be read as the closing sequence). */
const mdHeading = (s: string) => mdText(s).replace(/#/g, "\\#");

/** Code span: a backtick fence longer than any run in the value (CommonMark), padded when the value would lose its edges. */
export function mdCode(s: string): string {
  const v = oneLine(s);
  const longest = Math.max(0, ...(v.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  const pad = /^`|`$/.test(v) || (/^ .*[^ ].* $/.test(v)) ? " " : "";
  return `${fence}${pad}${v}${pad}${fence}`;
}

const loc = (f: Finding) => mdCode(`${f.file}:${f.line}`);
const usageLine = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${mdText(k)} ×${n}`)
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
  for (const t of r.tables) out.push(L.tableLine(mdText(t.file), t.format.toUpperCase(), t.rows, t.sourceLang, t.targetLang));
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
      if (group) out.push(`### ${mdHeading(group)}`);
      const u = usage.find((x) => x.group === group);
      if (u) out.push(`${L.usage}: ${usageLine(u.counts)}`);
      if (group || u) out.push("");
      for (const f of list) out.push(`- ${ICON[f.severity]} ${loc(f)} ${mdCode(f.id)} (${L.side[f.side]}) — ${mdText(f.message)}`);
      out.push("");
    }
  }

  if (opts.includePackets !== false && r.reviewPackets.length) {
    out.push(`## ${L.packetsHeading}`, "");
    out.push(L.packetsIntro(r.reviewPackets.length) + r.reviewPackets.map((p) => L.packetItem(p.kind, mdText(p.subject), p.lines.length)).join(L.packetSep), "");
  }
  return out.join("\n");
}
