// Builds the Chrome Web Store upload zip (NOT submitted anywhere).
// The repo manifest keeps the "(prototype)" working title; the store name and
// description come from store/store.json and are applied to the packaged copy only.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(root, "store/store.json"), "utf8"));
const out = join(root, "dist-store");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
manifest.name = cfg.name;
manifest.short_name = cfg.short_name;
manifest.description = cfg.description;
manifest.version = cfg.version;
if (manifest.name.length > 75) throw new Error("name > 75 chars");
if (manifest.short_name.length > 12) throw new Error("short_name > 12 chars");
if (manifest.description.length > 132) throw new Error("description > 132 chars");
if (manifest.permissions.length) throw new Error("store build expects no API permissions");
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const FOOTER_FROM = '"Tanuki Scout (prototype) · "';
const FOOTER_TO = JSON.stringify(cfg.short_name + " · ");
for (const f of manifest.content_scripts.flatMap((c) => c.js)) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  let src = readFileSync(join(root, f), "utf8");
  if (f === "src/overlay.js") {
    if (!src.includes(FOOTER_FROM)) throw new Error("overlay footer text not found");
    src = src.replace(FOOTER_FROM, FOOTER_TO);
  }
  writeFileSync(join(out, f), src);
}
cpSync(join(root, "icons"), join(out, "icons"), { recursive: true });

const zip = join(root, "store", `${cfg.zip_basename}-${cfg.version}.zip`);
if (existsSync(zip)) rmSync(zip);
execFileSync("zip", ["-qrX", zip, "."], { cwd: out });
console.log(`wrote ${zip.replace(root + "/", "")} (${manifest.name} ${manifest.version}) — not submitted`);
