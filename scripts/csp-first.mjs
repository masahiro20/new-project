// After the static export: move the CSP <meta> to just after <meta charset> in every HTML file, so it
// applies to everything the page loads (a meta CSP only covers what comes after it), and fail the
// export if a page has none (security review X-1).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const CSP = /<meta http-equiv="Content-Security-Policy" content="[^"]*"\/>/;
const CHARSET = /<meta charSet="utf-8"\/>/;

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

const missing = [];
let moved = 0;
for (const file of htmlFiles(process.argv[2] ?? "out")) {
  const html = readFileSync(file, "utf8");
  const csp = CSP.exec(html)?.[0];
  if (!csp || !CHARSET.test(html)) {
    missing.push(file);
    continue;
  }
  const out = html.replace(csp, "").replace(CHARSET, (m) => m + csp);
  if (out !== html) moved++;
  writeFileSync(file, out);
}
if (missing.length) {
  console.error(`CSP meta missing in: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`CSP meta first in ${moved} pages`);
