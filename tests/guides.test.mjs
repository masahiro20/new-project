import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Guide data files and the dates they declare. Read as text: lib/guides.ts imports a directory,
// which plain Node can't resolve, and the dates are simple literals.
const files = ["lib/guides.ts", ...readdirSync("lib/guide-pages").filter((f) => f.endsWith(".ts") && !["index.ts", "types.ts"].includes(f)).map((f) => `lib/guide-pages/${f}`)];
const guides = files.flatMap((file) => {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/slug: "([^"]+)"[\s\S]*?updated: "(\d{4}-\d{2}-\d{2})"/g)].map((m) => ({ file, slug: m[1], updated: m[2], published: /published: "([^"]+)"/.exec(src.slice(m.index, m.index + m[0].length))?.[1] }));
});
const registered = readFileSync("lib/guide-pages/index.ts", "utf8");

test("every registered guide has its own OG image", () => {
  for (const g of guides) {
    if (g.file !== "lib/guides.ts" && !registered.includes(`"./${g.file.slice("lib/guide-pages/".length, -3)}"`)) continue;
    assert.ok(existsSync(`public/og/${g.slug}.png`), `public/og/${g.slug}.png (npm run og:generate)`);
  }
});

test("published is not after updated", () => {
  for (const g of guides) if (g.published) assert.ok(g.published <= g.updated, g.slug);
});

// The sitemap's lastmod and the Article's dateModified come from `updated`. When a guide file is
// committed with changes, bump `updated` in the same commit, or search engines see a stale date.
test("updated is not older than the file's last commit", (t) => {
  let shallow = "true";
  try {
    shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  } catch {
    // Not a git checkout.
  }
  if (shallow !== "false") return t.skip("needs full git history");
  // lib/guides.ts holds several guides; there, at least the newest one must match the commit.
  for (const file of files) {
    const newest = guides.filter((g) => g.file === file).reduce((a, g) => (g.updated > a ? g.updated : a), "");
    const last = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { encoding: "utf8" }).trim();
    if (newest && last) assert.ok(newest >= last, `${file}: updated ${newest} < last commit ${last}`);
  }
});
