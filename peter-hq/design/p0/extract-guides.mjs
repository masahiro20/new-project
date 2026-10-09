#!/usr/bin/env node
// Reads slug / title / serviceType from lib/guides.ts and lib/guide-pages/*.ts and prints guides.json.
// Usage (from the P0 repo root): node peter-hq-design/extract-guides.mjs > guides.json
// A plain text scan, so it does not need TypeScript; check the count it reports against the site.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || ".";
const files = [path.join(root, "lib/guides.ts"), ...fs.readdirSync(path.join(root, "lib/guide-pages")).filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts").map((f) => path.join(root, "lib/guide-pages", f))];
const out = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const re = /slug:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    let block = src.slice(m.index, m.index + 3000);
    const next = block.slice(1).search(/\bslug:\s*"/);
    if (next >= 0) block = block.slice(0, next + 1);
    const title = block.match(/\btitle:\s*"([^"]+)"/);
    const svc = block.match(/\bserviceType:\s*"([^"]+)"/);
    if (title) out.push({ slug: m[1], title: title[1], ...(svc ? { serviceType: svc[1] } : {}) });
  }
}
console.error(`found ${out.length} guides`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
