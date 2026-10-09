// Builds the static site for GitHub Pages (served under /new-project/kotomark/):
//   site/index.html       ← lp/index.html
//   site/demo/index.html  ← web/dist/kotomark-demo.html (run `npm run build:demo` first)
// Everything uses relative paths and makes no external requests (Google Fonts are stripped;
// both pages already declare system-font fallbacks). The pilot contact stays a {{CONTACT}} placeholder.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site");
const DEMO_ARTIFACT_URL = "https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr";

function replaceOnce(text, from, to, what) {
  const n = text.split(from).length - 1;
  if (n === 0) throw new Error(`build-site: ${what} not found`);
  return text.split(from).join(to);
}

function stripGoogleFonts(html) {
  return html
    .replace(/^.*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*\n?/gm, "")
    .replace(/^\s*@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);\s*\n?/gm, "");
}

// Landing page
let lp = readFileSync(join(root, "lp/index.html"), "utf8");
lp = stripGoogleFonts(lp);
lp = replaceOnce(lp, `href="${DEMO_ARTIFACT_URL}"`, `href="demo/"`, "demo link in LP");
lp = replaceOnce(lp, "pilot@example.com", "{{CONTACT}}", "pilot contact in LP");

// Demo: the artifact host adds the document skeleton, so add it here.
let demo = readFileSync(join(root, "web/dist/kotomark-demo.html"), "utf8");
demo = stripGoogleFonts(demo);
demo = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
</head>
<body>
${demo}
</body>
</html>
`;

for (const [name, html] of [["index.html", lp], ["demo/index.html", demo]]) {
  if (/https?:\/\/fonts\.g/.test(html)) throw new Error(`build-site: external font reference left in ${name}`);
  const file = join(out, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`site    ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB -> ${file}`);
}
