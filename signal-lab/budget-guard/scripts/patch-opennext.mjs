// Build-time workaround for @opennextjs/cloudflare <= 1.20.9 with Next.js >= 16.4.
//
// Next 16.4 reads `.next/server/preview-props.json` via loadManifest() when the server
// starts. OpenNext inlines manifests into the Worker (workerd has no readFileSync), but
// its glob only matches `*-manifest`, `required-server-files` and `prefetch-hints`, so
// every request fails with "Unexpected loadManifest(/.next/server/preview-props.json) call!".
// This adds `preview-props` to that glob. Idempotent; a no-op once upstream includes it.
// Remove this script (and its call in package.json "build:cf") after upgrading OpenNext.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const pkgDir = path.join(import.meta.dirname, "../node_modules/@opennextjs/cloudflare");
const file = path.join(pkgDir, "dist/cli/build/patches/plugins/load-manifest.js");
const src = readFileSync(file, "utf8");
const from = "{*-manifest,required-server-files,prefetch-hints}.json";
const to = "{*-manifest,required-server-files,prefetch-hints,preview-props}.json";

if (src.includes("preview-props")) {
  console.log("[patch-opennext] preview-props already handled — nothing to do");
} else if (src.includes(from)) {
  writeFileSync(file, src.replace(from, to));
  console.log("[patch-opennext] added preview-props.json to OpenNext's inlined manifests");
} else {
  console.error(`[patch-opennext] pattern not found in ${file}. OpenNext changed; check whether preview-props.json is still a problem.`);
  process.exit(1);
}
