// Third-party license notices for every bundle we ship (security review A-03).
//
// Our bundles are built with `legalComments: "none"` and the bundled dependencies (zod, fflate) carry no
// /*! @license */ comments anyway, so their MIT notices would silently disappear. Every build that bundles
// node_modules code asks esbuild for its metafile, lists the packages that actually ended up in the output,
// and ships each package's own LICENSE text next to (or inside) the bundle:
//
//   dist/kotomark.mjs, action/dist/kotomark.mjs   trailing /*! … */ comment (scripts/build-cli.mjs)
//   out/kotomark-action/THIRD_PARTY_NOTICES.md    full file (scripts/release-action.mjs)
//   web/dist/kotomark-demo.html, site/demo/       visible "Third-party licenses" section (web/build-demo.mjs)
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Licenses that only need the notice reproduced. Anything else stops the build for a human review. */
export const ALLOWED_LICENSES = /^(MIT|ISC|BSD-[23]-Clause|Apache-2\.0|0BSD)$/;

/**
 * Packages from node_modules that esbuild put into the bundle described by `metafile`, with their license
 * texts. Throws when a package has no license file or an unexpected license.
 * @returns {{ name: string, version: string, license: string, text: string }[]}
 */
export function bundledNotices(metafile, root) {
  const pkgDirs = new Map(); // relative dir -> package name
  for (const input of Object.keys(metafile.inputs)) {
    const m = input.match(/^(.*node_modules\/)((?:@[^/]+\/)?[^/]+)\//);
    if (m && !m[2].startsWith(".")) pkgDirs.set(`${m[1]}${m[2]}`, m[2]);
  }
  const notices = [];
  for (const [rel, name] of [...pkgDirs].sort((a, b) => a[1].localeCompare(b[1]))) {
    const dir = resolve(root, rel);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const licFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    if (!licFile) throw new Error(`third-party notices: no license file in ${rel}`);
    const license = typeof pkg.license === "string" ? pkg.license : "UNKNOWN";
    if (!ALLOWED_LICENSES.test(license)) throw new Error(`third-party notices: bundled package ${name} has license "${license}" — review before shipping`);
    notices.push({ name, version: pkg.version, license, text: readFileSync(join(dir, licFile), "utf8").trim() });
  }
  return notices;
}

/** Plain-text block (no comment terminators) for a trailing JS comment. */
export function noticesComment(notices, bundleName) {
  if (!notices.length) return "";
  const body = notices
    .map((n) => `${n.name} ${n.version} (${n.license})\n\n${n.text}`)
    .join("\n\n---\n\n")
    .replaceAll("*/", "* /");
  return `/*! Third-party notices — ${bundleName} bundles the packages below; each keeps its own license.\n\n${body}\n*/\n`;
}

/** THIRD_PARTY_NOTICES.md for a release folder. */
export function noticesMarkdown(notices, bundleName) {
  return `# Third-party notices

\`${bundleName}\` bundles the following third-party packages. Each is distributed under its own license,
reproduced below. (Generated from the esbuild metafile by scripts/third-party-notices.mjs.)

| Package | Version | License |
|---|---|---|
${notices.map((n) => `| ${n.name} | ${n.version} | ${n.license} |`).join("\n")}
${notices.map((n) => `\n## ${n.name} ${n.version} (${n.license})\n\n\`\`\`\n${n.text}\n\`\`\`\n`).join("")}`;
}

const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A visible, collapsed section for an HTML page that inlines a bundle. */
export function noticesHtml(notices) {
  if (!notices.length) return "";
  const list = notices.map((n) => `${escHtml(n.name)} ${escHtml(n.version)} (${escHtml(n.license)})`).join(", ");
  const texts = notices.map((n) => `<h3>${escHtml(n.name)} ${escHtml(n.version)} (${escHtml(n.license)})</h3>\n<pre>${escHtml(n.text)}</pre>`).join("\n");
  return `<details class="third-party-notices" id="third-party-notices">
      <summary>第三者のライセンス表示 / Third-party licenses: ${list}</summary>
      <p>このページに埋め込んだ検査エンジンには、次のライブラリが含まれています。それぞれのライセンスに従って表示します。 / The check engine embedded in this page includes the libraries below, reproduced under their licenses.</p>
${texts}
    </details>`;
}
