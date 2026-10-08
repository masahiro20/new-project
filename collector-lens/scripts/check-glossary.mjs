// Schema + quality gate for data/glossary.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const g = JSON.parse(readFileSync(join(root, "data/glossary.json"), "utf8"));
const GENRES = new Set(["general", "camera", "watch"]);
const CATS = new Set(["condition", "rank", "return", "defect", "mechanism", "part", "authenticity", "seller", "accessory", "service"]);
const RISKS = new Set(["high", "medium", "low", "info", "positive"]);
const errors = [];
const ids = new Set();
const forms = new Map();

for (const e of g.entries) {
  const where = `entry ${e.id}`;
  if (!/^[a-z0-9_]+$/.test(e.id ?? "")) errors.push(`${where}: bad id`);
  if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
  ids.add(e.id);
  if (!Array.isArray(e.ja) || !e.ja.length) errors.push(`${where}: ja must be a non-empty array`);
  for (const f of e.ja ?? []) {
    if (f !== f.normalize("NFKC")) errors.push(`${where}: "${f}" is not NFKC-normalized`);
    if (forms.has(f)) errors.push(`${where}: "${f}" also in ${forms.get(f)}`);
    forms.set(f, e.id);
  }
  if (!e.en || e.en.length > 40) errors.push(`${where}: en missing or > 40 chars`);
  if (!e.explain || e.explain.length > 260) errors.push(`${where}: explain missing or > 260 chars`);
  if (!Array.isArray(e.genre) || !e.genre.length || !e.genre.every((x) => GENRES.has(x))) errors.push(`${where}: bad genre`);
  if (!CATS.has(e.category)) errors.push(`${where}: bad category ${e.category}`);
  if (!RISKS.has(e.risk)) errors.push(`${where}: bad risk ${e.risk}`);
  if (typeof e.reviewed !== "boolean") errors.push(`${where}: reviewed must be boolean`);
}

const specialist = g.entries.filter((e) => e.genre.includes("camera") || e.genre.includes("watch"));
const reviewedSpecialist = specialist.filter((e) => e.reviewed);
if (reviewedSpecialist.length < 100) errors.push(`only ${reviewedSpecialist.length} reviewed camera/watch entries (need >= 100)`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const count = (k) => g.entries.filter((e) => e.genre.includes(k)).length;
console.log(`glossary OK: ${g.entries.length} entries (camera ${count("camera")}, watch ${count("watch")}, general ${count("general")}); reviewed camera/watch ${reviewedSpecialist.length}`);
