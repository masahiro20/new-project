#!/usr/bin/env node
// Owner-only tool: creates the license signing key pair and issues offline license keys (docs/licensing.md).
// Never bundled into the CLI or the GitHub Action (nothing imports it). Never run it in CI.
//
//   node scripts/license-issue.mjs --init [--key <path>] [--force]
//       generates an ed25519 key pair. The PRIVATE key goes to <path> (default ~/.kotomark/license-signing-key.pem,
//       mode 0600, refused inside this repository). Prints the PUBLIC key entry to paste into src/cli/license-pubkey.ts.
//
//   node scripts/license-issue.mjs --sub <customer-id> --name "<licensee>" --seats 5 --days 395 [--plan studio]
//                                  [--nbf YYYY-MM-DD] [--features large-runs] [--key <path>] [--json]
//       prints a key: KM1.<base64url payload>.<base64url ed25519 signature over "kotomark-license-v1\0" + payload>
//       (--org is accepted as an alias of --name)
//
//   node scripts/license-issue.mjs --pubkey [--key <path>]     prints the public key entry again
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with src/cli/license.ts (test/license.test.ts verifies keys issued here).
const KEY_PREFIX = "KM1.";
const SIGNING_CONTEXT = "kotomark-license-v1\u0000";
const MAX_KEY_LENGTH = 2048;
const MAX_DAYS = 400;
const KNOWN_FEATURES = ["large-runs"];
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
function pubkeyEntry(publicKey, from = new Date().toISOString().slice(0, 10)) {
  const pem = publicKey.export({ type: "spki", format: "pem" }).trim();
  return `  "${keyId(publicKey)}": { key: \`${pem}\`, from: "${from}" },`;
}
/** Nearest existing ancestor of `p`, resolved through symlinks. */
function realAncestor(p) {
  for (let d = p; ; d = dirname(d)) {
    try {
      return join(realpathSync(d), relative(d, p));
    } catch {
      if (dirname(d) === d) return p;
    }
  }
}
/**
 * True when `p` is inside this package or inside ANY git work tree (the monorepo root, another repository): skillforge
 * lives in a monorepo whose root .gitignore does not ignore *.pem, so checking only this package is not enough.
 */
function insideRepo(p) {
  try {
    if (lstatSync(p).isSymbolicLink()) return true; // never write through a symlink (its target may be inside a repository)
  } catch {
    // does not exist yet
  }
  const real = realAncestor(p);
  const rel = relative(realpathSync(root), real);
  if (!rel.startsWith("..") && !isAbsolute(rel)) return true;
  for (let d = dirname(real); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return true;
    if (dirname(d) === d) return false;
  }
}
function loadPrivateKey() {
  if (!existsSync(keyPath)) fail(`no signing key at ${keyPath} (run --init first, or pass --key)`);
  const key = createPrivateKey(readFileSync(keyPath));
  if (key.asymmetricKeyType !== "ed25519") fail(`${keyPath} is not an ed25519 private key`);
  return key;
}

if (has("--init")) {
  if (insideRepo(keyPath)) fail(`refusing to write the private key inside a repository or git work tree (${keyPath}). Use a path outside it.`);
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

const name = opt("--name") ?? opt("--org");
const sub = opt("--sub");
if (!name || !sub) fail("usage: --init | --pubkey | --sub <customer-id> --name <licensee> --seats <n> --days <n> [--plan studio] [--nbf YYYY-MM-DD] [--features large-runs] [--key path]");
const seats = Number(opt("--seats", "5"));
const days = Number(opt("--days", "395"));
const plan = opt("--plan", "studio");
if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,63}$/.test(sub)) fail("--sub must be 1-64 characters: letters, digits and _.:@- (a customer id, not a name)");
// eslint-disable-next-line no-control-regex
if (name.length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) fail("--name must be at most 100 characters, without control characters");
if (!Number.isInteger(seats) || seats < 1 || seats > 10_000) fail("--seats must be an integer from 1 to 10000");
if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) fail(`--days must be more than 0 and at most ${MAX_DAYS}`);
if (plan !== "studio") fail(`unknown --plan "${plan}" (studio)`);
const features = opt("--features", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const f of features) if (!KNOWN_FEATURES.includes(f)) fail(`unknown feature "${f}" (${KNOWN_FEATURES.join(", ")})`);

const privateKey = loadPrivateKey();
const iat = Math.floor(Date.now() / 1000);
const nbfOpt = opt("--nbf");
const nbf = nbfOpt ? Math.floor(Date.parse(`${nbfOpt}T00:00:00Z`) / 1000) : iat;
if (!Number.isInteger(nbf) || nbf < iat - 86_400) fail("--nbf must be a date (YYYY-MM-DD), today or later");
const payload = {
  v: 1,
  kid: keyId(createPublicKey(privateKey)),
  lid: randomBytes(16).toString("base64url"), // 128 random bits
  sub,
  name,
  plan,
  features: [...new Set(features)],
  limits: { seats },
  iat,
  nbf,
  exp: iat + Math.round(days * 86_400),
};
if (payload.exp <= nbf) fail("--nbf must be before the expiry");
const bytes = Buffer.from(JSON.stringify(payload), "utf8");
const sig = sign(null, Buffer.concat([Buffer.from(SIGNING_CONTEXT, "utf8"), bytes]), privateKey);
const key = `${KEY_PREFIX}${bytes.toString("base64url")}.${sig.toString("base64url")}`;
if (key.length > MAX_KEY_LENGTH) fail(`key too long (${key.length} > ${MAX_KEY_LENGTH} characters): shorten --name`);
console.log(key);
if (has("--json")) console.error(JSON.stringify(payload, null, 2));
else console.error(`Issued ${payload.lid} to ${name} (${sub}): ${plan}, ${seats} seat(s), expires ${new Date(payload.exp * 1000).toISOString().slice(0, 10)} (kid ${payload.kid}). Record lid, sub and expiry in the ledger; to revoke early, add the lid to REVOKED_LIDS.`);
