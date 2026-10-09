// File-system side of the CLI: expand arguments (files or directories) and find a glossary.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { InputFile } from "../core/index.js";

export const SUPPORTED_EXTENSIONS = [".csv", ".tsv", ".json", ".xlf", ".xliff", ".xlsx", ".po", ".pot", ".yml", ".yaml", ".rpy"];
// .github holds CI workflow YAML, never locale files.
const SKIP_DIRS = new Set(["node_modules", ".git", ".github"]);
/** Looked up in the working directory when --glossary is not given (first hit wins). */
export const GLOSSARY_CANDIDATES = ["kotomark.glossary.json", "glossary.json", "kotomark.glossary.csv"];

export class UsageError extends Error {}

/** Path relative to cwd with forward slashes, so CI annotations point at real repo paths. */
export function displayPath(p: string, cwd = process.cwd()): string {
  const rel = relative(cwd, resolve(cwd, p));
  const out = rel && !rel.startsWith("..") ? rel : resolve(cwd, p);
  return sep === "\\" ? out.replace(/\\/g, "/") : out;
}

const supported = (name: string) => SUPPORTED_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e));
// Never picked up from a directory scan: glossaries (passed with --glossary) and common tool configs (JSON and YAML).
const SKIP_FILES = /glossary|^(package|package-lock|tsconfig|jsconfig|composer)\.json$|^(pnpm-lock|pnpm-workspace|docker-compose|compose|\.gitlab-ci|\.travis|\.pre-commit-config|mkdocs|action|codecov|\.?crowdin|\.yarnrc|renovate|dependabot)\.ya?ml$/i;

function walk(dir: string, out: string[], skip: Set<string>): void {
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(p, out, skip);
    } else if (ent.isFile() && supported(ent.name) && !SKIP_FILES.test(ent.name) && !skip.has(resolve(p))) out.push(p);
  }
}

/**
 * Expand CLI arguments into a de-duplicated list of files. Directories are searched recursively for supported
 * extensions (node_modules and .git skipped, and files with "glossary" in the name or tool configs like package.json). Explicit file arguments are taken as given, whatever the extension.
 * `skip` holds absolute paths never picked up from a directory scan (e.g. the glossary).
 */
export function expandArgs(args: string[], skip: string[] = []): string[] {
  const skipSet = new Set(skip.map((s) => resolve(s)));
  const files: string[] = [];
  for (const a of args) {
    if (!existsSync(a)) throw new UsageError(`No such file or directory: ${a}`);
    if (statSync(a).isDirectory()) {
      const found: string[] = [];
      walk(a, found, skipSet);
      if (!found.length) throw new UsageError(`No supported files (${SUPPORTED_EXTENSIONS.join(" ")}) under ${a}`);
      files.push(...found);
    } else files.push(a);
  }
  const seen = new Set<string>();
  return files.filter((f) => {
    const k = resolve(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function readInputs(paths: string[]): InputFile[] {
  return paths.map((p) => ({ name: displayPath(p), data: new Uint8Array(readFileSync(p)) }));
}

/** First glossary candidate present in `cwd`, or undefined. */
export function discoverGlossary(cwd = process.cwd()): string | undefined {
  for (const name of GLOSSARY_CANDIDATES) {
    const p = join(cwd, name);
    if (existsSync(p) && statSync(p).isFile()) return name;
  }
  return undefined;
}
