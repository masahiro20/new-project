// JUnit XML report for CI test-report UIs (GitHub Actions test reporters, GitLab `artifacts:reports:junit`,
// Jenkins, Azure DevOps). Browser-safe: no node imports.
//
// Layout: one <testsuite> per finding category (always all categories, so the report has a stable shape).
// Each finding is one <testcase> named `${file}:${line} ${rule}` with classname = category.
// Findings at or above `failOn` carry a <failure type=rule>; the rest pass (or are skipped) and keep their
// message in <system-out>. A category with no findings gets one passing testcase.
import { CATEGORY_ORDER } from "./engine.js";
import { reportLabels } from "./i18n.js";
import type { Category, CheckResult, Finding, Locale, Severity } from "./types.js";

export interface JUnitOptions {
  /** Lowest severity that becomes a <failure>. "never" = no failures at all. Default "warning". */
  failOn?: Severity | "never";
  /** How non-failing findings appear: a passing testcase with <system-out> (default) or <skipped>. */
  nonFailing?: "passed" | "skipped";
  /** Language of category titles (finding messages are already localized by runChecks). Default "en". */
  locale?: Locale;
  /** ISO timestamp put on every <testsuite>. Omitted when not given (keeps output deterministic). */
  timestamp?: string;
  /** Name of the root <testsuites>. Default "kotomark". */
  name?: string;
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

/** True when `s` is at or above `threshold` ("never" matches nothing). */
export function atOrAbove(s: Severity, threshold: Severity | "never"): boolean {
  return threshold !== "never" && RANK[s] >= RANK[threshold];
}

// XML 1.0 forbids most C0 controls, U+FFFE/U+FFFF and unpaired surrogates even when escaped: drop them.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXml(s: string): string {
  return s
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
    .join("");

function details(f: Finding): string {
  const lines = [`${f.severity.toUpperCase()} ${f.file}:${f.line} [${f.id}] (${f.side}) ${f.rule}`, f.message];
  if (f.group) lines.push(`group: ${f.group}`);
  if (f.found !== undefined) lines.push(`found: ${f.found}`);
  if (f.expected !== undefined) lines.push(`expected: ${f.expected}`);
  return lines.join("\n");
}

export function renderJUnit(result: CheckResult, opts: JUnitOptions = {}): string {
  const failOn = opts.failOn ?? "warning";
  const nonFailing = opts.nonFailing ?? "passed";
  const titles = reportLabels(opts.locale).titles;
  const suites: string[] = [];
  let total = 0;
  let failures = 0;
  let skipped = 0;

  const cats: Category[] = [...CATEGORY_ORDER];
  for (const f of result.findings) if (!cats.includes(f.category)) cats.push(f.category);

  for (const c of cats) {
    const fs = result.findings.filter((f) => f.category === c);
    const cases: string[] = [];
    let sFail = 0;
    let sSkip = 0;
    for (const f of fs) {
      const head = `    <testcase${attrs({ name: `${f.file}:${f.line} ${f.rule}`, classname: c, file: f.file, line: f.line, time: 0 })}>`;
      if (atOrAbove(f.severity, failOn)) {
        sFail++;
        cases.push(`${head}\n      <failure${attrs({ type: f.rule, message: f.message })}>${escapeXml(details(f))}</failure>\n    </testcase>`);
      } else if (nonFailing === "skipped") {
        sSkip++;
        cases.push(`${head}\n      <skipped${attrs({ message: f.message })}/>\n      <system-out>${escapeXml(details(f))}</system-out>\n    </testcase>`);
      } else {
        cases.push(`${head}\n      <system-out>${escapeXml(details(f))}</system-out>\n    </testcase>`);
      }
    }
    if (!fs.length) cases.push(`    <testcase${attrs({ name: `${c}: no findings`, classname: c, time: 0 })}/>`);
    total += cases.length;
    failures += sFail;
    skipped += sSkip;
    suites.push(
      `  <testsuite${attrs({ name: c, tests: cases.length, failures: sFail, errors: 0, skipped: sSkip, time: 0, timestamp: opts.timestamp })}>\n` +
        `    <properties>\n      <property${attrs({ name: "title", value: titles[c] ?? c })}/>\n    </properties>\n` +
        cases.join("\n") +
        `\n  </testsuite>`,
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites${attrs({ name: opts.name ?? "kotomark", tests: total, failures, errors: 0, skipped, time: 0 })}>\n` +
    suites.join("\n") +
    `\n</testsuites>\n`
  );
}
