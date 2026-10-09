// Content guard for the public GitHub Action folder (security review A-01 / patch 0008), used by
// scripts/release-action.mjs and tested on its own in test/release-guard.test.ts.
//
// guardReleaseFolder(dir) returns a list of problems (empty = publishable):
//  - the file list must be exactly EXPECTED (no extra files, no symlinks);
//  - no file may be, or contain, the owner-only license issuance tool (scripts/license-issue.mjs), key-pair generation
//    or signing code, or private-key material (PEM, bare PKCS#8 ed25519, private JWK), nor an issued license key;
//  - no source maps, build-machine paths, links outside the folder, private-monorepo references or secret-like values.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

export const EXPECTED = [
  "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "USAGE-TERMS.md", "action.yml", "run.sh",
  "dist/LICENSE", "dist/kotomark.mjs", "example/glossary.json", "example/script.csv", "example/workflow.yml",
];

/** File names that must never ship, whatever the allowlist says (signing tools and key files). */
export const FORBIDDEN_NAMES = /license-issue|sign(?:ing)?[-_]?key|private[-_]?key|\.(?:pem|key|p8|pk8|der|jwk)$/i;

/**
 * Key issuance / signing code and private-key material. The shipped verifier only uses createPublicKey and
 * verify(null, …); everything below exists only in scripts/license-issue.mjs or in a private key.
 */
export const SIGNING_PATTERNS = [
  [/license-issue/, "the license issuance tool (scripts/license-issue.mjs)"],
  [/generateKeyPair|createPrivateKey|pubkeyEntry|license-signing-key/, "key-pair generation or signing-key handling code"],
  [/\bsign\(\s*null\s*,/, "an ed25519 signing call"],
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, "a PEM private key"],
  // An ed25519 private key without PEM armour (Atlas re-review F-04 / patch 0003): PKCS#8 DER as base64 or hex, or a JWK's "d".
  [/MC4CAQAwBQYDK2VwBCIEI|302e020100300506032b657004220420/i, "an unarmoured PKCS#8 ed25519 private key (base64 / hex)"],
  [/"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/, "a private JWK (\"d\" member)"],
  [/\bKM1\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}/, "an issued license key"],
];

export const OTHER_FORBIDDEN = [
  [/sourceMappingURL|"sourcesContent"/, "source map"],
  [/^\/\/ \.\.\//m, "bundle module path outside the project (build machine layout)"],
  [/\]\(\.\.\//, "relative link outside the release folder"],
  [/masahiro20\/new-project|peter-hq|docs\/(?:outreach|pilot-targets|decisions|real-world-eval)|\beval\//, "reference to the private monorepo"],
  [/(?:sk-ant-|gh[pousr]_|github_pat_|xox[abprs]-|[rs]k_live_|whsec_)[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|[a-z0-9-]+\.upstash\.io/, "secret-like value"],
];

/** Problems in one file's text (also used directly on the bundle). */
export function scanText(name, text, localPaths = []) {
  const problems = [];
  for (const [re, what] of [...SIGNING_PATTERNS, ...OTHER_FORBIDDEN]) if (re.test(text)) problems.push(`${name}: ${what} (${re})`);
  for (const p of localPaths) if (text.includes(p)) problems.push(`${name}: contains a local absolute path (${p})`);
  return problems;
}

/** All problems in the release folder `dir`. `localPaths`: build-machine paths that must not appear. */
export function guardReleaseFolder(dir, { expected = EXPECTED, localPaths = [] } = {}) {
  const problems = [];
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split(sep).join("/");
      if (e.isSymbolicLink()) problems.push(`symlink in release folder: ${rel}`);
      else if (e.isDirectory()) walk(p);
      else files.push(rel);
    }
  };
  walk(dir);
  files.sort();
  if (files.join("\n") !== [...expected].sort().join("\n")) problems.push(`unexpected file list:\n  ${files.join("\n  ")}`);
  for (const f of files) {
    if (FORBIDDEN_NAMES.test(basename(f))) problems.push(`${f}: signing tool or key file must never be published`);
    problems.push(...scanText(f, readFileSync(join(dir, f), "utf8"), localPaths));
  }
  return problems;
}
