// Writes .dev.vars (git-ignored) from .dev.vars.example for a local workerd preview, replacing
// every __GENERATE__ with a fresh random secret and __GENERATE_KEY__ with a 32-byte base64 key.
// The Worker refuses example / placeholder secrets (lib/secrets.ts), so the template can't be used
// as is. Keeps an existing .dev.vars unless --force.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const out = new URL("../.dev.vars", import.meta.url);
if (existsSync(out) && !process.argv.includes("--force")) {
  console.log(".dev.vars already exists (use --force to regenerate)");
  process.exit(0);
}
const template = readFileSync(new URL("../.dev.vars.example", import.meta.url), "utf8");
const filled = template
  .replace(/__GENERATE_KEY__/g, () => randomBytes(32).toString("base64"))
  .replace(/__GENERATE__/g, () => randomBytes(32).toString("base64url"));
writeFileSync(out, filled, { mode: 0o600 });
console.log("wrote .dev.vars with fresh random secrets (local use only)");
