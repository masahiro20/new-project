#!/usr/bin/env node
// Assembles the thin GitHub Action repository (option B in docs/repo-migration.md) into out/kotomark-action/:
//
//   action.yml  run.sh  README.md  LICENSE (MIT)  USAGE-TERMS.md  THIRD_PARTY_NOTICES.md
//   dist/kotomark.mjs  dist/LICENSE (ELv2)  example/{script.csv,glossary.json,workflow.yml}
//
// 1. rebuilds the bundle with `npm run build:action` (skip with --no-build)
// 2. copies the action files; README.md gets its `uses:` paths rewritten to <repo>@v<major> and a Licensing
//    section; writes the license files (HQ decision d29) and THIRD_PARTY_NOTICES.md for the bundled deps
// 2b. guard (security review A-01): the output must be exactly the expected file list (no symlinks) and no file may
//    contain source maps, build-machine paths, links outside the folder, private-monorepo references or secret-like values
// 3. verifies the license files, then the bundle from the release folder and from an isolated temp copy (no node_modules anywhere
//    up the tree): `--help` and a `check` on the bundled example
// 4. prints the git commands for the release — it never runs git, creates repos or pushes.
//
// Usage: node scripts/release-action.mjs [--repo <owner>/kotomark-action] [--version 1.0.0] [--no-build]
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundledNotices, noticesMarkdown } from "./third-party-notices.mjs";
import { EXPECTED, guardReleaseFolder, SIGNING_PATTERNS } from "./release-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out", "kotomark-action");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const repo = opt("--repo", "OWNER/kotomark-action");
const version = opt("--version", "1.0.0").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`--version must be semver (x.y.z), got "${version}"`);
const major = `v${version.split(".")[0]}`;

function fail(msg) {
  console.error(`release-action: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`\n▶ ${msg}`);
}

// --- 1. build -------------------------------------------------------------------------------------
if (!args.includes("--no-build")) {
  step("npm run build:action");
  execSync("npm run build:action", { cwd: root, stdio: "inherit" });
}
const bundle = join(root, "action", "dist", "kotomark.mjs");
if (!existsSync(bundle)) fail(`bundle missing: ${bundle} (run npm run build:action)`);
if (args.includes("--no-build")) {
  // A-06: the committed bundle must match what the current source builds to (no stale or hand-edited engine).
  const { buildCli } = await import(pathToFileURL(join(root, "scripts", "build-cli.mjs")).href);
  const tmpBuild = mkdtempSync(join(tmpdir(), "kotomark-rebuild-"));
  try {
    const fresh = readFileSync(await buildCli(join(tmpBuild, "kotomark.mjs")));
    if (!fresh.equals(readFileSync(bundle))) fail("--no-build: action/dist/kotomark.mjs differs from a fresh build of the source (run npm run build:action)");
  } finally {
    rmSync(tmpBuild, { recursive: true, force: true });
  }
}

// --- 2. assemble ----------------------------------------------------------------------------------
// Allowlist: every source copied into the public folder. Symlinks are refused (copyFileSync would follow them).
const SOURCES = ["action/action.yml", "action/run.sh", "action/README.md", "action/dist/kotomark.mjs", "samples/ja-en/script.csv", "samples/ja-en/glossary.json", ".github-example/kotomark.yml", "licenses/MIT.txt", "licenses/ELASTIC-LICENSE-2.0.txt", "licenses/KOTOMARK-USAGE-TERMS.md"];
for (const s of SOURCES) if (lstatSync(join(root, s)).isSymbolicLink()) fail(`refusing to publish a symlink: ${s}`);
step(`assemble ${out}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "dist"), { recursive: true });
mkdirSync(join(out, "example"), { recursive: true });

copyFileSync(join(root, "action", "action.yml"), join(out, "action.yml"));
copyFileSync(join(root, "action", "run.sh"), join(out, "run.sh"));
chmodSync(join(out, "run.sh"), 0o755);
copyFileSync(bundle, join(out, "dist", "kotomark.mjs"));
chmodSync(join(out, "dist", "kotomark.mjs"), 0o755);
copyFileSync(join(root, "samples", "ja-en", "script.csv"), join(out, "example", "script.csv"));
copyFileSync(join(root, "samples", "ja-en", "glossary.json"), join(out, "example", "glossary.json"));
// A-02: the README's sample workflow link must work in the public repo, so ship the workflow itself.
writeFileSync(
  join(out, "example", "workflow.yml"),
  readFileSync(join(root, ".github-example", "kotomark.yml"), "utf8").replace(/masahiro20\/new-project\/skillforge\/action@\S+/g, `${repo}@${major}`),
);

// README: point `uses:` at the dedicated repo and drop the "where it lives" notes about the monorepo.
let readme = readFileSync(join(root, "action", "README.md"), "utf8");
readme = readme
  .replaceAll("masahiro20/new-project/skillforge/action@<ref>", `${repo}@${major}`)
  .replace(/^> \*\*置き場所について。\*\*[\s\S]*?\n(?=\n)/m, `> 固定したい場合は、タグではなくコミット SHA を指定してください：\`uses: ${repo}@<commit-sha> # ${major}\`\n`)
  .replace(/^> \*\*Where it lives\.\*\*[\s\S]*?\n(?=\n)/m, `> To pin exactly, use a commit SHA instead of the tag: \`uses: ${repo}@<commit-sha> # ${major}\`\n`)
  .replaceAll("../.github-example/kotomark.yml", "example/workflow.yml");
if (readme.includes("masahiro20/new-project")) console.warn("  warning: README.md still mentions masahiro20/new-project — review it by hand.");
readme = `${readme.trimEnd()}

---

## Licensing / ライセンス

Kotomark is **source-available**, not open source. / Kotomark は**ソース公開**の製品です（オープンソースではありません）。

| Files | License |
|---|---|
| \`action.yml\`, \`run.sh\`, \`README.md\`, \`example/\` (everything except \`dist/\`) | MIT — [\`LICENSE\`](LICENSE) |
| \`dist/kotomark.mjs\` (the check engine) | Elastic License 2.0 — [\`dist/LICENSE\`](dist/LICENSE) |
| Third-party code bundled in \`dist/kotomark.mjs\` | Own licenses — [\`THIRD_PARTY_NOTICES.md\`](THIRD_PARTY_NOTICES.md) |

- Free for individuals, open-source projects and organizations with up to 3 employees. A paid Studio plan for other
  organizations is planned (US$49/month for up to 5 seats, planned price) but not on sale yet: until it launches,
  **everyone can use Kotomark free as a preview**.
  See [\`USAGE-TERMS.md\`](USAGE-TERMS.md) (draft).
- 個人・OSS プロジェクト・従業員3名以下の団体は無料です。それ以外の団体向けに有料の Studio プラン（月額 US$49・5席まで、予定価格）を
  予定していますが、まだ販売していません。開始までは**プレビューとしてどなたでも無料**でお使いいただけます。詳しくは [\`USAGE-TERMS.md\`](USAGE-TERMS.md)（下書き）を見てください。
- The Elastic License 2.0 does not allow offering the engine to third parties as a hosted/managed service, or
  circumventing license-key functionality. / Elastic License 2.0 では、エンジンを第三者向けのホスティング・マネージドサービスとして提供することと、ライセンスキーの機能を回避することは認められていません。
`;
writeFileSync(join(out, "README.md"), readme);

// --- licensing ------------------------------------------------------------------------------------
// HQ decision d29: the wrapper (action.yml, run.sh, README.md, example/) is MIT; dist/kotomark.mjs is ELv2.
const COPYRIGHT = "Copyright (c) 2026 The Kotomark team";
const mit = readFileSync(join(root, "licenses", "MIT.txt"), "utf8");
if (!mit.includes(COPYRIGHT)) fail("licenses/MIT.txt has no copyright line");
writeFileSync(
  join(out, "LICENSE"),
  `${mit.trimEnd()}

---
This MIT license covers every file in this repository EXCEPT the dist/ directory.
dist/kotomark.mjs is licensed under the Elastic License 2.0 — see dist/LICENSE.
Bundled third-party code keeps its own license — see THIRD_PARTY_NOTICES.md.
`,
);
const elv2 = readFileSync(join(root, "licenses", "ELASTIC-LICENSE-2.0.txt"), "utf8");
writeFileSync(join(out, "dist", "LICENSE"), `Applies to dist/kotomark.mjs — ${COPYRIGHT}\n\n${elv2.trimEnd()}\n`);
copyFileSync(join(root, "licenses", "KOTOMARK-USAGE-TERMS.md"), join(out, "USAGE-TERMS.md"));

// Third-party notices: ask esbuild (same options as the real build, nothing written) which node_modules
// packages end up in the bundle, then copy each package's own license file.
const { build } = await import("esbuild");
const { CLI_BUILD_OPTIONS } = await import(pathToFileURL(join(root, "scripts", "build-cli.mjs")).href);
const meta = (await build({ ...CLI_BUILD_OPTIONS, outfile: join(out, "dist", ".meta.mjs"), write: false, metafile: true, logLevel: "silent" })).metafile;
const notices = bundledNotices(meta, root); // throws on a missing license file or a license outside the allowlist
if (notices.length === 0) fail("esbuild metafile lists no bundled node_modules packages — expected at least fflate and zod");
writeFileSync(join(out, "THIRD_PARTY_NOTICES.md"), noticesMarkdown(notices, "dist/kotomark.mjs"));
console.log(`  third-party notices: ${notices.map((n) => `${n.name}@${n.version} (${n.license})`).join(", ")}`);

// --- 2b. guard: exact file list + content scan (fails closed; security review A-01) -------------------------
step("guard: file allowlist and content scan");
// The checks live in scripts/release-guard.mjs (tested in test/release-guard.test.ts). They fail explicitly if
// scripts/license-issue.mjs, any key-pair generation / signing code or any private-key material is in the output.
const localPaths = [root, homedir() + sep].filter((p) => p.length > 2); // build machine paths
const problems = guardReleaseFolder(out, { localPaths });
if (problems.length) fail(`release folder check failed:\n  ${problems.join("\n  ")}`);
const actual = EXPECTED;
// A-03: every bundled package's notice ships inside the bundle too (trailing comment from scripts/build-cli.mjs).
const bundleText = readFileSync(join(out, "dist", "kotomark.mjs"), "utf8");
for (const n of notices) if (!bundleText.includes(`${n.name} ${n.version} (${n.license})`)) fail(`dist/kotomark.mjs lacks the license notice for ${n.name} (rebuild: npm run build:action)`);
console.log(`  ${actual.length} files, all expected; no forbidden content; bundle carries ${notices.length} third-party notice(s)`);

// --- 3. verify ------------------------------------------------------------------------------------
function run(cwd, cliArgs, okCodes = [0]) {
  const r = spawnSync(process.execPath, ["dist/kotomark.mjs", ...cliArgs], { cwd, encoding: "utf8" });
  if (!okCodes.includes(r.status ?? -1)) fail(`node dist/kotomark.mjs ${cliArgs.join(" ")} in ${cwd} exited ${r.status}\n${r.stderr}`);
  return r.stdout;
}
/** --help prints usage to stderr (exit 0); check both streams. */
function help(cwd) {
  const r = spawnSync(process.execPath, ["dist/kotomark.mjs", "--help"], { cwd, encoding: "utf8" });
  if (r.status !== 0) fail(`node dist/kotomark.mjs --help in ${cwd} exited ${r.status}\n${r.stderr}`);
  return r.stdout + r.stderr;
}
step("verify: license files");
for (const f of ["LICENSE", "dist/LICENSE", "USAGE-TERMS.md", "THIRD_PARTY_NOTICES.md", "README.md", "action.yml", "run.sh", "dist/kotomark.mjs"]) {
  if (!existsSync(join(out, f))) fail(`missing ${f} in release folder`);
}
if (existsSync(join(out, "LICENSE.TODO"))) fail("LICENSE.TODO must not be in the release folder");
if (!/^MIT License/.test(readFileSync(join(out, "LICENSE"), "utf8"))) fail("LICENSE is not the MIT text");
if (!readFileSync(join(out, "dist", "LICENSE"), "utf8").startsWith(`Applies to dist/kotomark.mjs — ${COPYRIGHT}`)) fail("dist/LICENSE header missing");
if (!/Elastic License 2\.0/.test(readFileSync(join(out, "dist", "LICENSE"), "utf8"))) fail("dist/LICENSE is not ELv2");
if (!/## Licensing/.test(readFileSync(join(out, "README.md"), "utf8"))) fail("README.md has no Licensing section");
const tpn = readFileSync(join(out, "THIRD_PARTY_NOTICES.md"), "utf8");
for (const dep of ["fflate", "zod"]) if (!tpn.includes(`## ${dep} `)) fail(`THIRD_PARTY_NOTICES.md lacks ${dep}`);
console.log("  ok: LICENSE (MIT), dist/LICENSE (ELv2), USAGE-TERMS.md, THIRD_PARTY_NOTICES.md, README Licensing");
// License keys (docs/licensing.md): only public keys may ship; the owner-only issuance tool never does.
const shipped = readFileSync(join(out, "dist", "kotomark.mjs"), "utf8");
if (/PRIVATE KEY/.test(shipped)) fail("bundle contains private-key material");
for (const [re, what] of SIGNING_PATTERNS) if (re.test(shipped)) fail(`bundle contains ${what}`);
if (!/kotomark-license-v1/.test(shipped) || !/"KM1\."/.test(shipped)) fail("bundle lacks the license key verifier");
// §5.6: no path in the shipped bundle swaps the trusted keys or skips verification (the test hook is compiled out).
if (/__KOTOMARK_TEST_HOOKS__/.test(shipped)) fail("bundle still contains the license test hook (build without scripts/build-cli.mjs options?)");
if (!/^\/\*! Kotomark engine — .*Elastic License 2\.0/m.test(shipped)) fail("bundle lacks the ELv2 license header");
// A-04: operator-only token management stays out of the public bundle.
if (/TokenStore|yrg_|KOTOMARK_API_TOKENS/.test(shipped)) fail("bundle contains server token management (A-04)");
{
  const floor = Number(/BUILD_FLOOR = ([\d_]+)/.exec(readFileSync(join(root, "src", "cli", "license-pubkey.ts"), "utf8"))?.[1]?.replaceAll("_", ""));
  const ageDays = (Date.now() / 1000 - floor) / 86_400;
  if (!(ageDays >= 0)) fail("BUILD_FLOOR in src/cli/license-pubkey.ts is in the future or unreadable");
  if (ageDays > 180) console.warn(`  warning: BUILD_FLOOR is ${Math.round(ageDays)} days old — bump it to the release date (clock-rollback check, docs/licensing.md).`);
}
console.log("  ok: bundle has the offline license verifier and no signing material");

step("verify: node dist/kotomark.mjs --help (release folder)");
if (!/kotomark check/.test(help(out))) fail("--help output looks wrong");

step("verify: isolated copy outside the repo (no node_modules)");
const iso = mkdtempSync(join(tmpdir(), "kotomark-action-release-"));
try {
  cpSync(out, iso, { recursive: true });
  if (!/kotomark check/.test(help(iso))) fail("--help output looks wrong (isolated)");
  const json = run(iso, ["check", "example/script.csv", "--glossary", "example/glossary.json", "--format", "json", "--fail-on", "never"]);
  const s = JSON.parse(json).summary;
  console.log(`  example: ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info`);
  const bash = spawnSync("bash", ["run.sh"], {
    cwd: iso,
    encoding: "utf8",
    env: { ...process.env, INPUT_PATHS: "example/script.csv", INPUT_GLOSSARY: "example/glossary.json", INPUT_FAIL_ON: "never", INPUT_ANNOTATIONS: "false", GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "" },
  });
  if (bash.status !== 0) fail(`run.sh failed (${bash.status})\n${bash.stdout}\n${bash.stderr}`);
  console.log(`  run.sh: ${bash.stdout.trim().split("\n").pop()}`);
} finally {
  rmSync(iso, { recursive: true, force: true });
}

// --- 4. next steps (printed, not executed) ---------------------------------------------------------
const src = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();
console.log(`
✔ out/kotomark-action/ is ready (version ${version}, source ${src}).

Licensing (d29): LICENSE = MIT (all but dist/), dist/LICENSE = ELv2. USAGE-TERMS.md is a draft — counsel review before sales.

Next commands (NOT executed — run them yourself after creating https://github.com/${repo}):

  # first release only
  git clone https://github.com/${repo}.git ../kotomark-action-repo
  # every release
  rsync -a --delete --exclude .git --exclude .github out/kotomark-action/ ../kotomark-action-repo/
  cd ../kotomark-action-repo
  git add -A
  git commit -m "Release v${version} (from kotomark ${src})"
  git tag -a v${version} -m "v${version}"
  git tag -fa ${major} -m "${major} -> v${version}"
  git push origin HEAD
  git push origin v${version}
  git push -f origin ${major}
  # then: GitHub → Releases → Draft a new release → tag v${version} → "Publish this Action to the GitHub Marketplace"
`);
