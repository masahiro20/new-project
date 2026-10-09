#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadInputs, parseGlossary, renderMarkdown, runChecks, type ColumnMap, type Format, type Glossary, type Locale, type Severity, type Table } from "../core/index.js";
import { draftGlossary } from "../core/draft.js";
import { atOrAbove, renderJUnit } from "../core/junit.js";
import { findingsToLabelCsv, renderScore, scoreLabels } from "../core/pilot.js";
import { PLANS, tokenStoreFromEnv, type Plan } from "../server/auth.js";
import { discoverGlossary, expandArgs, readInputs, UsageError } from "./inputs.js";
import { filterBySeverity, renderGithub, summarize } from "./output.js";

const USAGE = `Usage:
  kotomark check <file|dir>... [options]                                  consistency check (CI-ready)
  kotomark draft <file|dir>... [--glossary existing.json] [--max-terms N] [--out draft.json]
  kotomark labels <file|dir>... [--glossary g.json] --out labels.csv      export findings as a labeling sheet
  kotomark score <labels.csv> [--known known.csv] [--out score.md]       precision (and recall) from a labeled sheet
  kotomark token create <user> [--plan solo|studio] [--label text]        prints the token once
  kotomark token list | kotomark token revoke <user|token-prefix>

check options:
  -g, --glossary <file>        glossary (JSON or CSV). Default: ./kotomark.glossary.json, ./glossary.json
                               or ./kotomark.glossary.csv if present. --no-glossary disables the lookup.
  --format md|json|junit|github  report format (default md). --json = --format json.
  --input-format <fmt>         force the input format (csv|tsv|json|xliff|xlsx|po|i18n-json|
                               unity-csv|unreal-csv); default: detected from extension + content.
                               (Legacy: --format <input format other than json> still sets the input format.)
  --columns k=v,...            CSV/TSV/XLSX column override, e.g. source=原文,target=訳文,speaker=話者
  --sheet <name|number>        XLSX sheet name or 1-based number (default: first sheet with text)
  --fail-on error|warning|never  exit 1 when findings at/above this severity exist (default error)
  --min-severity info|warning|error  hide findings below this severity in the output (default info)
  --junit-fail-on error|warning|info|never  severities that become <failure> in JUnit
                               (default: same as --fail-on, or warning when --fail-on never)
  --locale en|ja               language of messages and labels (default en)
  --no-rules                   skip placeholder/tag/ruby/length/untranslated rules
  --no-info                    same as --min-severity warning
  --wide                       count East Asian wide characters as 2 for length limits
  -o, --out <file>             write the report to a file instead of stdout

Directories are searched recursively for .csv .tsv .json .xlf .xliff .xlsx .po .pot
(skipping node_modules, .git, files with "glossary" in the name, package.json/tsconfig.json).

check exit code: 0 = passed, 1 = findings at/above --fail-on, 2 = bad input or usage.`;

const OUTPUT_FORMATS = ["md", "markdown", "json", "junit", "github"] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];
const INPUT_FORMATS: Format[] = ["csv", "tsv", "json", "xliff", "xlsx", "po", "i18n-json", "unity-csv", "unreal-csv"];
const SEVERITIES: Severity[] = ["info", "warning", "error"];

function emit(text: string, out?: string) {
  if (out) writeFileSync(out, text.endsWith("\n") ? text : text + "\n");
  else process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

function oneOf<T extends string>(flag: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new UsageError(`Unknown ${flag} "${value}" (${allowed.join(" | ")})`);
  return value as T;
}

function parseColumns(spec: string | undefined): ColumnMap | undefined {
  if (!spec) return undefined;
  const keys = ["id", "source", "target", "speaker", "addressee", "context", "maxLength"];
  const map: Record<string, string> = {};
  for (const part of spec.split(",")) {
    const i = part.indexOf("=");
    const k = part.slice(0, i).trim();
    if (i < 1 || !keys.includes(k)) throw new UsageError(`Bad --columns entry "${part}" (keys: ${keys.join(", ")})`);
    map[k] = part.slice(i + 1).trim();
  }
  return map as ColumnMap;
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      glossary: { type: "string", short: "g" },
      "no-glossary": { type: "boolean" },
      format: { type: "string", short: "f" },
      "input-format": { type: "string" },
      columns: { type: "string" },
      sheet: { type: "string" },
      json: { type: "boolean" },
      "fail-on": { type: "string" },
      "min-severity": { type: "string" },
      "junit-fail-on": { type: "string" },
      "no-rules": { type: "boolean" },
      "no-info": { type: "boolean" },
      wide: { type: "boolean" },
      locale: { type: "string" },
      out: { type: "string", short: "o" },
      known: { type: "string" },
      plan: { type: "string" },
      label: { type: "string" },
      "max-terms": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...args] = positionals;
  if (values.help || !cmd) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }

  // --format is the report format; input-format values other than "json" keep their old meaning.
  let outputFormat: OutputFormat = values.json ? "json" : "md";
  let inputFormat = values["input-format"];
  if (values.format !== undefined) {
    if ((OUTPUT_FORMATS as readonly string[]).includes(values.format)) outputFormat = values.format as OutputFormat;
    else if ((INPUT_FORMATS as string[]).includes(values.format)) {
      inputFormat ??= values.format;
      console.error(`note: --format ${values.format} sets the input format; use --input-format ${values.format} (--format now selects the report format).`);
    } else throw new UsageError(`Unknown --format "${values.format}" (report: ${OUTPUT_FORMATS.join(" | ")}; input: use --input-format)`);
  }
  if (inputFormat !== undefined && !(INPUT_FORMATS as string[]).includes(inputFormat)) throw new UsageError(`Unknown --input-format "${inputFormat}" (${INPUT_FORMATS.join(" | ")})`);
  const locale = oneOf<Locale>("--locale", values.locale, ["en", "ja"], "en");
  const sheet = values.sheet === undefined ? undefined : /^\d+$/.test(values.sheet) ? Number(values.sheet) : values.sheet;

  const glossaryPath = (): string | undefined => {
    if (values.glossary) return values.glossary;
    if (values["no-glossary"] || cmd !== "check") return undefined;
    const found = discoverGlossary();
    if (found) console.error(`note: using glossary ${found} (found in the working directory; --no-glossary to skip)`);
    return found;
  };
  const gPath = cmd === "check" || cmd === "draft" || cmd === "labels" ? glossaryPath() : undefined;
  const loadGlossary = (): Glossary | undefined => (gPath ? parseGlossary(readFileSync(gPath, "utf8"), gPath) : undefined);
  const loadTables = (): Table[] => {
    const files = expandArgs(args, gPath ? [gPath] : []);
    const { tables, notes } = loadInputs(readInputs(files), { format: inputFormat as Format | undefined, columns: parseColumns(values.columns), sheet });
    for (const n of notes) console.error(`note: ${n}`);
    if (!tables.length) throw new UsageError("No tables could be read from the inputs.");
    return tables;
  };

  switch (cmd) {
    case "check": {
      if (!args.length) break;
      const failOn = oneOf<Severity | "never">("--fail-on", values["fail-on"], ["error", "warning", "never"], "error");
      const minSeverity = values["no-info"] && !values["min-severity"] ? "warning" : oneOf<Severity>("--min-severity", values["min-severity"], SEVERITIES, "info");
      const junitFailOn = oneOf<Severity | "never">("--junit-fail-on", values["junit-fail-on"], [...SEVERITIES, "never"], failOn === "never" ? "warning" : failOn);
      const tables = loadTables();
      const full = runChecks(tables, loadGlossary(), { rules: !values["no-rules"], wideAsTwo: values.wide, locale });
      const shown = filterBySeverity(full, minSeverity);
      let text: string;
      switch (outputFormat) {
        case "json":
          text = JSON.stringify({ ...shown, summary: summarize(shown) }, null, 2);
          break;
        case "junit":
          text = renderJUnit(shown, { failOn: junitFailOn, locale, timestamp: new Date().toISOString() });
          break;
        case "github":
          text = renderGithub(shown, { locale });
          break;
        default:
          text = renderMarkdown(shown, { locale });
      }
      emit(text, values.out);
      // Gating looks at every finding, not only the ones shown by --min-severity.
      const s = summarize(full);
      const failed = full.findings.some((f) => atOrAbove(f.severity, failOn));
      if (values.out || outputFormat !== "md") {
        console.error(`kotomark: ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info — ${failed ? `FAILED (--fail-on ${failOn})` : "passed"}`);
      }
      return failed ? 1 : 0;
    }
    case "draft": {
      if (!args.length) break;
      const max = values["max-terms"] ? Number.parseInt(values["max-terms"], 10) : undefined;
      const draft = draftGlossary(loadTables(), loadGlossary(), { maxTerms: max });
      emit(JSON.stringify(draft.glossary, null, 2), values.out);
      for (const n of draft.notes) console.error(`note: ${n}`);
      console.error(`${draft.glossary.terms.length} terms, ${draft.glossary.characters.length} characters drafted from ${draft.entries.length} candidates — review before use.`);
      return 0;
    }
    case "labels": {
      if (!args.length || !values.out) break;
      const tables = loadTables();
      const result = runChecks(tables, loadGlossary());
      emit(findingsToLabelCsv(result, tables), values.out);
      console.error(`${result.findings.length} findings written to ${values.out}. Fill the "verdict" column with TP / FP (or 正 / 誤).`);
      return 0;
    }
    case "score": {
      if (args.length !== 1) break;
      const report = scoreLabels(readFileSync(args[0]!, "utf8"), values.known ? readFileSync(values.known, "utf8") : undefined);
      emit(values.json || outputFormat === "json" ? JSON.stringify(report, null, 2) : renderScore(report), values.out);
      return 0;
    }
    case "token": {
      const store = tokenStoreFromEnv();
      const [sub, target] = args;
      if (sub === "create" && target) {
        const plan = (values.plan ?? "solo") as Plan;
        if (!(plan in PLANS) || plan === "dev") throw new UsageError(`Unknown plan "${plan}" (solo | studio)`);
        const { token, record } = store.create(target, plan, values.label);
        console.log(token);
        console.error(`Created token ${record.prefix}… for ${record.user} (${record.plan}). It is shown only once.`);
        return 0;
      }
      if (sub === "list") {
        for (const r of store.list()) console.log(`${r.prefix}…  ${r.user}  ${r.plan}  ${r.createdAt}${r.revokedAt ? `  REVOKED ${r.revokedAt}` : ""}${r.label ? `  ${r.label}` : ""}`);
        return 0;
      }
      if (sub === "revoke" && target) {
        console.log(`Revoked ${store.revoke(target)} token(s).`);
        return 0;
      }
      break;
    }
  }
  console.error(USAGE);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`kotomark: ${(e as Error).message}`);
  process.exitCode = 2;
}
