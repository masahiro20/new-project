#!/usr/bin/env node
// Builds the single-file browser demo: bundles the engine (web/engine-entry.ts) as an IIFE global
// `Yuragi`, then inlines it plus the sample files into web/demo.template.html.
//
// Usage: node web/build-demo.mjs [--template <path>] [--out <path>]
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const ENGINE_MARKER = "<!--YURAGI_ENGINE-->";
const SAMPLES_MARKER = "/*YURAGI_SAMPLES*/null";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return resolve(v);
}

const templatePath = arg("--template", resolve(here, "demo.template.html"));
const outPath = arg("--out", resolve(here, "dist/yuragi-demo.html"));
const bundlePath = resolve(here, "dist/yuragi-engine.js");

/** Esbuild options shared with test/browser-engine.test.ts. */
export const ENGINE_BUILD_OPTIONS = {
  entryPoints: [resolve(here, "engine-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "Yuragi",
  platform: "browser",
  target: "es2020",
  minify: true,
  charset: "utf8",
  legalComments: "none",
};

const sample = (p) => readFileSync(resolve(root, "samples", p), "utf8");

function samplesJson() {
  const data = {
    "ja-en": {
      script: { name: "script.csv", text: sample("ja-en/script.csv") },
      script2: { name: "ch2.json", text: sample("ja-en/ch2.json") },
      glossary: { name: "glossary.json", text: sample("ja-en/glossary.json") },
    },
    "en-ja": {
      script: { name: "ui.xlf", text: sample("en-ja/ui.xlf") },
      glossary: { name: "glossary.json", text: sample("en-ja/glossary.json") },
    },
  };
  // Safe inside an inline <script>: no "</script", "<!--", and no raw line/paragraph separators.
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function replaceOnce(haystack, marker, replacement, what) {
  const i = haystack.indexOf(marker);
  if (i === -1) throw new Error(`build-demo: marker ${JSON.stringify(marker)} (${what}) not found in ${templatePath}`);
  if (haystack.indexOf(marker, i + marker.length) !== -1) throw new Error(`build-demo: marker ${JSON.stringify(marker)} appears more than once in ${templatePath}`);
  // Function replacement so "$&", "$1" etc. inside the bundle are not treated as patterns.
  return haystack.replace(marker, () => replacement);
}

async function main() {
  const result = await build({ ...ENGINE_BUILD_OPTIONS, write: false, logLevel: "warning" });
  const bundle = result.outputFiles[0].text;
  mkdirSync(dirname(bundlePath), { recursive: true });
  writeFileSync(bundlePath, bundle);

  const template = readFileSync(templatePath, "utf8");
  const safeBundle = bundle.replace(/<\/script/gi, "<\\/script");
  // "<!--" followed by "<script" inside inline script data switches the HTML tokenizer into the
  // double-escaped state, where the real closing tag is swallowed. No safe generic rewrite exists
  // (e.g. "<\!--" is invalid inside a /u regex), so fail loudly instead of emitting a broken page.
  if (/<!--/.test(safeBundle)) throw new Error("build-demo: engine bundle contains \"<!--\"; cannot inline it safely");
  let html = replaceOnce(template, ENGINE_MARKER, `<script>${safeBundle}</script>`, "engine");
  html = replaceOnce(html, SAMPLES_MARKER, samplesJson(), "samples");

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`engine  ${kb(Buffer.byteLength(bundle))} -> ${bundlePath}`);
  console.log(`demo    ${kb(Buffer.byteLength(html))} -> ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
