#!/usr/bin/env node
// Assembles the thin GitHub Action repository (option B in docs/repo-migration.md) into out/kotomark-action/:
//
//   action.yml  run.sh  dist/kotomark.mjs  README.md  LICENSE.TODO  example/{script.csv,glossary.json}
//
// 1. rebuilds the bundle with `npm run build:action` (skip with --no-build)
// 2. copies the action files; README.md gets its `uses:` paths rewritten to <repo>@v<major>
// 3. verifies the bundle from the release folder and from an isolated temp copy (no node_modules anywhere
//    up the tree): `--help` and a `check` on the bundled example
// 4. prints the git commands for the release — it never runs git, creates repos or pushes.
//
// Usage: node scripts/release-action.mjs [--repo <owner>/kotomark-action] [--version 1.0.0] [--no-build]
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// --- 2. assemble ----------------------------------------------------------------------------------
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

// README: point `uses:` at the dedicated repo and drop the "where it lives" notes about the monorepo.
let readme = readFileSync(join(root, "action", "README.md"), "utf8");
readme = readme
  .replaceAll("masahiro20/new-project/skillforge/action@<ref>", `${repo}@${major}`)
  .replace(/^> \*\*置き場所について。\*\*[\s\S]*?\n(?=\n)/m, `> 固定したい場合は、タグではなくコミット SHA を指定してください：\`uses: ${repo}@<commit-sha> # ${major}\`\n`)
  .replace(/^> \*\*Where it lives\.\*\*[\s\S]*?\n(?=\n)/m, `> To pin exactly, use a commit SHA instead of the tag: \`uses: ${repo}@<commit-sha> # ${major}\`\n`);
if (readme.includes("masahiro20/new-project")) console.warn("  warning: README.md still mentions masahiro20/new-project — review it by hand.");
writeFileSync(join(out, "README.md"), readme);

writeFileSync(
  join(out, "LICENSE.TODO"),
  `ライセンス未決定 / LICENSE NOT CHOSEN

このファイルは公開前に必ず置き換えてください。ライセンスの選択はオーナーの法的判断です（Claude は決めません）。
- 公開リポジトリでもライセンスが無ければ、第三者に利用・改変の権利は与えられません（GitHub の利用規約上、閲覧と fork は可能）。
- 候補例：MIT / Apache-2.0（許諾的）、あるいは独自の「Action としての利用のみ許可」ライセンス。
  dist/kotomark.mjs には製品の検査エンジン全体がまとめて入っている点に注意してください。
- バンドルに含まれる依存ライブラリ（fflate: MIT、zod: MIT）の著作権表示の扱いも合わせて確認してください。
- 決めたら、このファイルを削除して LICENSE を置き、package.json の "license"（現在 UNLICENSED）も合わせます。

Replace this file with a real LICENSE before publishing. Choosing the license is the owner's legal decision.
Note that dist/kotomark.mjs bundles the whole check engine plus MIT-licensed dependencies (fflate, zod).
`,
);

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

Before the first release: replace LICENSE.TODO with a real LICENSE (owner decision).

Next commands (NOT executed — run them yourself after creating https://github.com/${repo}):

  # first release only
  git clone https://github.com/${repo}.git ../kotomark-action-repo
  # every release
  rsync -a --delete --exclude .git --exclude .github --exclude LICENSE --exclude LICENSE.TODO out/kotomark-action/ ../kotomark-action-repo/
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
