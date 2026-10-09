#!/usr/bin/env node
// Bundles the CLI (src/cli/index.ts) into one self-contained ESM file, dist/kotomark.mjs, used as the
// package's `bin`. Only node built-ins stay external, plus the server SDKs the CLI never imports (safety net).
//
// Usage: node scripts/build-cli.mjs [--out <path>]
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Esbuild options shared with test/cli.test.ts (which builds into a temp dir). */
export const CLI_BUILD_OPTIONS = {
  entryPoints: [resolve(root, "src/cli/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  charset: "utf8",
  legalComments: "none",
  external: ["@anthropic-ai/sdk", "@modelcontextprotocol/sdk"],
  // Lets bundled CommonJS dependencies call require() for node built-ins inside an ESM bundle.
  banner: { js: 'import { createRequire as __kotomarkCreateRequire } from "node:module"; const require = __kotomarkCreateRequire(import.meta.url);' },
};

export async function buildCli(outfile = resolve(root, "dist/kotomark.mjs")) {
  await build({ ...CLI_BUILD_OPTIONS, outfile, logLevel: "warning" });
  chmodSync(outfile, 0o755);
  return outfile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = await buildCli(i === -1 ? undefined : resolve(process.argv[i + 1]));
  console.log(`built ${out}`);
}
