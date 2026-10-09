#!/usr/bin/env node
// Owner-only tool: creates the license signing key pair and issues offline license keys (docs/licensing.md).
// Never bundled into the CLI or the GitHub Action (nothing imports it). Never run it in CI.
//
//   node scripts/license-issue.mjs --init [--key <path>] [--force]
//       generates an ed25519 key pair. The PRIVATE key goes to <path> (default ~/.kotomark/license-signing-key.pem,
//       mode 0600, refused inside this repository). Prints the PUBLIC key entry to paste into src/cli/license-pubkey.ts.
//
//   node scripts/license-issue.mjs --org "<name>" --seats 5 --days 395 [--plan studio] [--lic <id>]
//                                  [--features a,b] [--key <path>] [--json]
//       prints a key: KOTOMARK-1.<base64url payload>.<base64url signature>
//
//   node scripts/license-issue.mjs --pubkey [--key <path>]     prints the public key entry again
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_PREFIX = "KOTOMARK-1.";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
function fail(msg) {
  console.error(`license-issue: ${msg}`);
  process.exit(1);
}

const keyPath = resolve(opt("--key", join(homedir(), ".kotomark", "license-signing-key.pem")));

/** Same as keyId() in src/cli/license.ts. */
function keyId(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return `k-${createHash("sha256").update(der).digest("hex").slice(0, 12)}`;
}
function pubkeyEntry(publicKey) {
  const pem = publicKey.export({ type: "spki", format: "pem" }).trim();
  return `  "${keyId(publicKey)}": \`${pem}\`,`;
}
function insideRepo(p) {
  let real = p;
  try {
    real = join(realpathSync(dirname(p)), basename(p)); // follow symlinked parents
  } catch {
    // parent does not exist yet
  }
  const rel = relative(realpathSync(root), real);
  return !rel.startsWith("..") && !isAbsolute(rel);
}
function loadPrivateKey() {
  if (!existsSync(keyPath)) fail(`no signing key at ${keyPath} (run --init first, or pass --key)`);
  const key = createPrivateKey(readFileSync(keyPath));
  if (key.asymmetricKeyType !== "ed25519") fail(`${keyPath} is not an ed25519 private key`);
  return key;
}

if (has("--init")) {
  if (insideRepo(keyPath)) fail(`refusing to write the private key inside the repository (${keyPath}). Use a path outside it.`);
  if (existsSync(keyPath) && !has("--force")) fail(`${keyPath} already exists (pass --force to replace it — keys signed with the old one stop verifying once its public key is removed)`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  console.error(`Private signing key written to ${keyPath} (mode 0600). Back it up OFFLINE; never commit it or put it in CI.`);
  console.error("Paste this entry into LICENSE_PUBLIC_KEYS in src/cli/license-pubkey.ts, then rebuild (npm run build:action):\n");
  console.log(pubkeyEntry(publicKey));
  process.exit(0);
}

if (has("--pubkey")) {
  console.log(pubkeyEntry(createPublicKey(loadPrivateKey())));
  process.exit(0);
}

const org = opt("--org");
if (!org) fail("usage: --init | --pubkey | --org <name> --seats <n> --days <n> [--plan studio] [--lic id] [--features a,b] [--key path]");
const seats = Number(opt("--seats", "5"));
const days = Number(opt("--days", "395"));
const plan = opt("--plan", "studio");
if (!Number.isInteger(seats) || seats < 1) fail("--seats must be a positive integer");
if (!Number.isFinite(days) || days <= 0) fail("--days must be a positive number");
if (plan !== "studio") fail(`unknown --plan "${plan}" (studio)`);
const features = opt("--features", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const privateKey = loadPrivateKey();
const iat = Math.floor(Date.now() / 1000);
const payload = {
  v: 1,
  kid: keyId(createPublicKey(privateKey)),
  lic: opt("--lic", `lic_${randomUUID().slice(0, 8)}`),
  org,
  plan,
  seats,
  iat,
  exp: iat + Math.round(days * 86_400),
  features,
};
const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
const sig = sign(null, Buffer.from(KEY_PREFIX + body, "utf8"), privateKey).toString("base64url");
const key = `${KEY_PREFIX}${body}.${sig}`;
console.log(key);
if (has("--json")) console.error(JSON.stringify(payload, null, 2));
else console.error(`Issued ${payload.lic} for ${org}: ${plan}, ${seats} seat(s), expires ${new Date(payload.exp * 1000).toISOString().slice(0, 10)} (kid ${payload.kid}).`);
