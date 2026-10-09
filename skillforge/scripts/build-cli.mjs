#!/usr/bin/env node
// Bundles the CLI (src/cli/index.ts) into one self-contained ESM file, dist/kotomark.mjs, used as the
// package's `bin`. Only node built-ins stay external, plus the server SDKs the CLI never imports (safety net).
//
// Usage: node scripts/build-cli.mjs [--out <path>]
import { build } from "esbuild";
import { bundledNotices, noticesComment } from "./third-party-notices.mjs";
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
  // License header (security review §5.6), then: lets bundled CommonJS dependencies call require() for node built-ins
  // inside an ESM bundle.
  banner: {
    js:
      "/*! Kotomark engine — Copyright (c) 2026 The Kotomark team. Licensed under the Elastic License 2.0 (see dist/LICENSE).\n" +
      " * You may not move, change, disable, or circumvent the license key functionality, or remove or obscure this notice.\n" +
      " * Third-party notices are at the end of this file. */\n" +
      'import { createRequire as __kotomarkCreateRequire } from "node:module"; const require = __kotomarkCreateRequire(import.meta.url);',
  },
  // Production builds compile the license verifier's test hook out (src/cli/license.ts): no flag, variable, file or
  // global can swap the trusted public keys, the revocation lists or the clock in a shipped bundle.
  define: { __KOTOMARK_TEST_HOOKS__: "undefined" },
};

/**
 * Two passes: the first (nothing written) lists the node_modules packages that end up in the bundle, the
 * second appends their license texts as a trailing comment, so every copy of the bundle carries them (A-03).
 */
export async function cliBuildOptionsWithNotices() {
  const { metafile } = await build({ ...CLI_BUILD_OPTIONS, outfile: resolve(root, "dist/.meta.mjs"), write: false, metafile: true, logLevel: "silent" });
  const notices = bundledNotices(metafile, root);
  return { options: { ...CLI_BUILD_OPTIONS, footer: { js: noticesComment(notices, "kotomark.mjs") } }, notices };
}

export async function buildCli(outfile = resolve(root, "dist/kotomark.mjs")) {
  const { options } = await cliBuildOptionsWithNotices();
  await build({ ...options, outfile, logLevel: "warning" });
  chmodSync(outfile, 0o755);
  return outfile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = await buildCli(i === -1 ? undefined : resolve(process.argv[i + 1]));
  console.log(`built ${out}`);
}
