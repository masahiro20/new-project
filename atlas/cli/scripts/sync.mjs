#!/usr/bin/env node
// Copy the scanner files the CLI needs from atlas/scanner/ into atlas/cli/scanner/ so the
// npm package is self-contained. The copies are byte-identical and committed with the package.
//
//   node scripts/sync.mjs           copy (npm run sync)
//   node scripts/sync.mjs --check   exit 1 if a copy is missing or differs (npm run sync:check)
//
// Outside the repository (e.g. an unpacked tarball) the source is absent and --check is a no-op.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(CLI_ROOT, "..", "scanner");
const DEST = join(CLI_ROOT, "scanner");
// scan.py imports only ast_py and trust; cli.py is the argparse front end.
export const FILES = ["cli.py", "scan.py", "ast_py.py", "trust.py", "js/ast_dump.cjs"];

const check = process.argv.includes("--check");
if (!existsSync(join(SRC, "scan.py"))) {
  console.log(`sync: source ${SRC} not found; nothing to ${check ? "check" : "copy"}`);
  process.exit(0);
}
const stale = [];
for (const f of FILES) {
  const from = join(SRC, f);
  const to = join(DEST, f);
  const same = existsSync(to) && readFileSync(from).equals(readFileSync(to));
  if (check) {
    if (!same) stale.push(f);
    continue;
  }
  if (!same) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    console.log(`sync: ${f}`);
  }
}
if (check && stale.length) {
  console.error(`sync: out of date: ${stale.join(", ")} -- run \`npm run sync\` in atlas/cli`);
  process.exit(1);
}
console.log(check ? "sync: scanner copies are up to date" : `sync: ${FILES.length} files in ${DEST}`);
