#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { parseGlossary, parseTable, renderMarkdown, runChecks, type Format, type Locale } from "../core/index.js";
import { draftGlossary } from "../core/draft.js";
import { findingsToLabelCsv, renderScore, scoreLabels } from "../core/pilot.js";
import { PLANS, tokenStoreFromEnv, type Plan } from "../server/auth.js";

const USAGE = `Usage:
  kotomark check <table>... [--glossary g.json] [--format csv|tsv|json|xliff] [--json] [--no-rules] [--no-info] [--wide] [--locale en|ja] [--out file]
  kotomark draft <table>... [--glossary existing.json] [--max-terms N] [--out draft.json]
  kotomark labels <table>... [--glossary g.json] --out labels.csv      export findings as a labeling sheet
  kotomark score <labels.csv> [--known known.csv] [--out score.md]      precision (and recall) from a labeled sheet
  kotomark token create <user> [--plan solo|studio] [--label text]       prints the token once
  kotomark token list | kotomark token revoke <user|token-prefix>

check exit code: 0 = no errors, 1 = errors found, 2 = bad input.`;

function emit(text: string, out?: string) {
  if (out) writeFileSync(out, text.endsWith("\n") ? text : text + "\n");
  else console.log(text);
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      glossary: { type: "string", short: "g" },
      format: { type: "string" },
      json: { type: "boolean" },
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
  const loadTables = () => args.map((f) => parseTable(readFileSync(f, "utf8"), basename(f), { format: values.format as Format | undefined }));
  const loadGlossary = () => (values.glossary ? parseGlossary(readFileSync(values.glossary, "utf8"), values.glossary) : undefined);

  if (values.help || !cmd) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  switch (cmd) {
    case "check": {
      if (!args.length) break;
      const locale = (values.locale ?? "en") as Locale;
      if (locale !== "en" && locale !== "ja") throw new Error(`Unknown locale "${values.locale}" (en | ja)`);
      const result = runChecks(loadTables(), loadGlossary(), { rules: !values["no-rules"], wideAsTwo: values.wide, locale });
      emit(values.json ? JSON.stringify(result, null, 2) : renderMarkdown(result, { includeInfo: !values["no-info"], locale }), values.out);
      return result.findings.some((f) => f.severity === "error") ? 1 : 0;
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
      emit(values.json ? JSON.stringify(report, null, 2) : renderScore(report), values.out);
      return 0;
    }
    case "token": {
      const store = tokenStoreFromEnv();
      const [sub, target] = args;
      if (sub === "create" && target) {
        const plan = (values.plan ?? "solo") as Plan;
        if (!(plan in PLANS) || plan === "dev") throw new Error(`Unknown plan "${plan}" (solo | studio)`);
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
  console.error((e as Error).message);
  process.exitCode = 2;
}
