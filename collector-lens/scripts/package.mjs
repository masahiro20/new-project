// Copies only the files the extension needs into dist/ for "Load unpacked".
// (Loading the project folder directly would also pull in node_modules.)
import { cpSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
cpSync(join(root, "manifest.json"), join(dist, "manifest.json"));
for (const f of manifest.content_scripts.flatMap((c) => c.js)) cpSync(join(root, f), join(dist, f));
cpSync(join(root, "icons"), join(dist, "icons"), { recursive: true });
console.log("dist/ ready — chrome://extensions → Developer mode → Load unpacked → select collector-lens/dist");
