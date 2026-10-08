import { checkHonorifics, checkVoice } from "./checks/voice.js";
import { checkNames } from "./checks/names.js";
import { checkRules } from "./checks/rules.js";
import { checkNotation, checkTerms, glossaryDirection, unglossariedTermPackets } from "./checks/terms.js";
import { EMPTY_GLOSSARY } from "./glossary.js";
import type { Category, CheckOptions, CheckResult, Finding, Glossary, Severity, Table } from "./types.js";

export const CATEGORY_ORDER: Category[] = ["term", "notation", "name", "honorific", "voice", "placeholder", "tag", "ruby", "length"];
const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export function runChecks(tables: Table[], glossary: Glossary = EMPTY_GLOSSARY, opts: CheckOptions = {}): CheckResult {
  const terms = checkTerms(tables, glossary);
  const notation = checkNotation(tables);
  const names = checkNames(tables, glossary);
  const honorifics = checkHonorifics(tables, glossary);
  const voice = checkVoice(tables, glossary, opts.minLinesForVoice ?? 3);
  const rules = opts.rules === false ? [] : checkRules(tables, { wideAsTwo: opts.wideAsTwo });

  const findings: Finding[] = [...glossaryDirection(tables, glossary), ...terms.findings, ...notation.findings, ...names.findings, ...honorifics.findings, ...voice.findings, ...rules];
  findings.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      (a.group ?? "").localeCompare(b.group ?? "") ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return {
    tables: tables.map((t) => ({ file: t.file, format: t.format, rows: t.rows.length, sourceLang: t.sourceLang, targetLang: t.targetLang })),
    glossary: { terms: glossary.terms.length, characters: glossary.characters.length },
    findings,
    usage: [...terms.usage, ...notation.usage, ...names.usage, ...honorifics.usage, ...voice.usage],
    reviewPackets: [...voice.packets, ...unglossariedTermPackets(tables, glossary)],
  };
}
