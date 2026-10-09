// Builds the static site for GitHub Pages (served under /new-project/kotomark/):
//   site/index.html       ← lp/index.html
//   site/demo/index.html  ← web/dist/kotomark-demo.html (run `npm run build:demo` first)
// 相対パスのみで、外部への通信はしない（Google Fonts は外す。両ページともシステムフォントの代替あり）。
// 両ページとも、インラインの <script>・<style> の sha256 だけを許す meta CSP を入れる（外部への通信は connect-src 'none' で止める）。
// 成果物版（web/dist/kotomark-demo.html）は配信先が自前の CSP を付けるので、ここでは触らない。
// 連絡先は環境変数 CONTACT（例: CONTACT=pilot@example.org npm run build:site）。
// 空のときは問い合わせ欄の代わりに「試用のご相談は近日受付開始」を表示する。
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site");
const DEMO_ARTIFACT_URL = "https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr";
// 非公開リポジトリへのリンクは公開版では外す（公開先ができたら差し替える）。
const PRIVATE_EVAL_LINK = /\s*<a href="https:\/\/github\.com\/masahiro20\/new-project\/[^"]*">[^<]*<\/a>/g;
const CONTACT = (process.env.CONTACT ?? "").trim();
if (CONTACT && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(CONTACT)) throw new Error(`build-site: CONTACT is not an email address: ${CONTACT}`);
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function contactBlock() {
  if (CONTACT) {
    const a = escHtml(CONTACT);
    return `    <div class="contact">
      <h3><span class="t" lang="ja">連絡先</span><span class="t" lang="en">Contact</span></h3>
      <a class="addr" href="mailto:${a}">${a}</a>
      <p class="t" lang="ja">台本の形式（CSV / XLIFF など）、言語の向き、おおよその行数をお知らせください。送り主：Kotomark 開発チーム</p>
      <p class="t" lang="en">Tell us your file format (CSV, XLIFF, …), language direction and rough line count. — The Kotomark team</p>
    </div>
`;
  }
  return `    <div class="contact">
      <h3><span class="t" lang="ja">試用のご相談</span><span class="t" lang="en">Pilot sign-up</span></h3>
      <p class="t" lang="ja">試用のご相談は近日受付開始です。それまではデモをそのままお試しください。</p>
      <p class="t" lang="en">Pilot sign-up opens soon. In the meantime, feel free to try the demo.</p>
      <p><a class="btn" href="demo/"><span class="t" lang="ja">デモを試す</span><span class="t" lang="en">Try the demo</span></a></p>
    </div>
`;
}

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
lp = lp.replace(/\s*<!--KOTOMARK_CONTACT_START-->[\s\S]*?<!--KOTOMARK_CONTACT_END-->\n/, (m) => {
  if (!m) return m;
  return "\n" + contactBlock();
});
if (lp.includes("KOTOMARK_CONTACT")) throw new Error("build-site: contact markers not replaced");
lp = lp.replace(PRIVATE_EVAL_LINK, "");
lp = lp.replace(/\s*<!-- TODO before launch: the repo is private[^>]*-->/, "");
lp = lp.replace(/\s*<!-- TODO before going live:[\s\S]*?-->/, "");
// Internal notes (draft status, source docs, checklists) must not ship: drop every remaining HTML comment.
lp = lp.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, "");

// The demo file is a fragment (the artifact host adds the skeleton). Its leading run of head-only elements
// (<title>, <style>, <meta>, <link>, comments) goes into <head>; everything from the first other element on is the body.
function splitHead(html) {
  const HEAD_ITEM = /^\s*(?:<!--[\s\S]*?-->|<title\b[^>]*>[\s\S]*?<\/title>|<style\b[^>]*>[\s\S]*?<\/style>|<meta\b[^>]*>|<link\b[^>]*>)/i;
  let head = "";
  let rest = html;
  for (let m; (m = HEAD_ITEM.exec(rest)); ) {
    head += m[0];
    rest = rest.slice(m[0].length);
  }
  return { head: head.trim(), body: rest.replace(/^\s+/, "") };
}

// Demo: the artifact host adds the document skeleton, so add it here.
let demo = readFileSync(join(root, "web/dist/kotomark-demo.html"), "utf8");
demo = stripGoogleFonts(demo);
const demoParts = splitHead(demo);
if (!/<title\b/i.test(demoParts.head) || /<title\b|<\/style>/i.test(demoParts.body.slice(0, 2000))) throw new Error("build-site: could not move the demo's <title>/<style> into <head>");
demo = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
${demoParts.head}
</head>
<body>
${demoParts.body}
</body>
</html>
`;

// Meta CSP computed from the final HTML: every inline <script>/<style> is allowed by its sha256, nothing else.
// Inline style="" attributes and on*="" handlers would need 'unsafe-inline', so the build refuses them instead
// (setting element.style from JS is CSSOM and stays allowed).
const sha256 = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
function inlineHashes(html, tag) {
  const hashes = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi"))) {
    if (/\bsrc\s*=/i.test(m[1])) throw new Error(`build-site: external <${tag} src> is not allowed by the CSP`);
    hashes.push(sha256(m[2]));
  }
  return [...new Set(hashes)];
}
function addCsp(html, name) {
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) throw new Error(`build-site: inline style attribute in ${name} (blocked by the CSP; use a class)`);
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) throw new Error(`build-site: inline event handler in ${name} (blocked by the CSP)`);
  if (/http-equiv\s*=\s*"?content-security-policy/i.test(html)) throw new Error(`build-site: ${name} already has a CSP`);
  const scripts = inlineHashes(html, "script");
  const styles = inlineHashes(html, "style");
  const csp = [
    "default-src 'none'",
    `script-src ${scripts.length ? scripts.join(" ") : "'none'"}`,
    `style-src ${styles.length ? styles.join(" ") : "'none'"}`,
    "img-src data: blob:",
    "connect-src 'none'",
    "font-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  // Right after <meta charset>, before any <style>/<script>, so it covers everything in the page.
  const charset = /<meta charset="utf-8">\n?/i;
  if (!charset.test(html)) throw new Error(`build-site: <meta charset> not found in ${name}`);
  return html.replace(charset, (m) => `${m.endsWith("\n") ? m : m + "\n"}${meta}\n`);
}
lp = addCsp(lp, "index.html");
demo = addCsp(demo, "demo/index.html");

for (const [name, html] of [["index.html", lp], ["demo/index.html", demo]]) {
  if (/https?:\/\/fonts\.g/.test(html)) throw new Error(`build-site: external font reference left in ${name}`);
  if (/\{\{[^}]*\}\}|pilot@example\.com|masahiro20\/new-project|claude\.ai\/artifact|docs\/[\w-]+\.md|NOT PUBLISHED/.test(html)) throw new Error(`build-site: placeholder or private link left in ${name}`);
  const file = join(out, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`site    ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB -> ${file}`);
}
