// Offline license keys (src/cli/license.ts, scripts/license-issue.mjs). Every key pair here is generated at
// runtime and injected — no private key is committed, and the embedded production keys are never used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREE_ROWS_PER_RUN,
  KEY_PREFIX,
  PREVIEW,
  formatLicenseStatus,
  gateRun,
  keyId,
  licenseWarnings,
  loadLicense,
  resolveLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
  type LicenseStatus,
} from "../src/cli/license.js";
import { LICENSE_PUBLIC_KEYS } from "../src/cli/license-pubkey.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "kotomark-license-"));

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKey, pem, kid: keyId(pem) };
}
const A = pair();
const B = pair();
const KEYS = { [A.kid]: A.pem };
const NOW = Date.UTC(2026, 9, 9);
const sec = (ms: number) => Math.floor(ms / 1000);

function issue(over: Partial<LicensePayload> = {}, privateKey: KeyObject = A.privateKey): string {
  const payload: LicensePayload = { v: 1, kid: A.kid, lic: "lic_test1", org: "Test Studio", plan: "studio", seats: 5, iat: sec(NOW), exp: sec(NOW) + 395 * 86_400, features: [], ...over };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${KEY_PREFIX}${body}.${sign(null, Buffer.from(KEY_PREFIX + body), privateKey).toString("base64url")}`;
}

test("preview switch is on and no production key is committed yet (flip only when paid plans launch)", () => {
  assert.equal(PREVIEW, true);
  assert.equal(FREE_ROWS_PER_RUN, 20_000);
  for (const pem of Object.values(LICENSE_PUBLIC_KEYS)) assert.doesNotMatch(pem, /PRIVATE/);
});

test("sign/verify: a valid key verifies with the matching embedded public key", () => {
  const s = verifyLicenseKey(issue({ features: ["large-runs"] }), { publicKeys: KEYS, now: NOW });
  assert.equal(s.state, "valid");
  assert.equal(s.state === "valid" && s.payload.org, "Test Studio");
  assert.deepEqual(s.state === "valid" && s.payload.features, ["large-runs"]);
  // surrounding whitespace (pasted from a file) is fine
  assert.equal(verifyLicenseKey(`  ${issue()}\n`, { publicKeys: KEYS, now: NOW }).state, "valid");
});

test("tampered payload, wrong key, unknown kid and malformed keys are invalid", () => {
  const key = issue();
  const [, body, sig] = key.split(".");
  const forged = JSON.parse(Buffer.from(body!, "base64url").toString());
  forged.seats = 500;
  const tampered = `${KEY_PREFIX}${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
  assert.deepEqual(verifyLicenseKey(tampered, { publicKeys: KEYS, now: NOW }), { state: "invalid", reason: "bad signature" });

  // signed by B but claiming A's kid
  assert.deepEqual(verifyLicenseKey(issue({}, B.privateKey), { publicKeys: KEYS, now: NOW }), { state: "invalid", reason: "bad signature" });
  // B's own kid is not embedded
  assert.deepEqual(verifyLicenseKey(issue({ kid: B.kid }, B.privateKey), { publicKeys: KEYS, now: NOW }), { state: "invalid", reason: "unknown kid" });
  assert.equal(verifyLicenseKey(issue({ kid: "__proto__" }), { publicKeys: KEYS, now: NOW }).state, "invalid");
  // the default (embedded) key set does not know test keys
  assert.equal(verifyLicenseKey(issue(), { now: NOW }).state, "invalid");

  for (const bad of ["hello", "KOTOMARK-1.", "KOTOMARK-1.abc", "KOTOMARK-1.a.b.c", "KOTOMARK-1.a+b.c", "KOTOMARK-2." + key.slice(KEY_PREFIX.length)]) {
    assert.equal(verifyLicenseKey(bad, { publicKeys: KEYS, now: NOW }).state, "invalid", bad);
  }
  const noJson = `${KEY_PREFIX}${Buffer.from("not json").toString("base64url")}.${sig}`;
  assert.deepEqual(verifyLicenseKey(noJson, { publicKeys: KEYS }), { state: "invalid", reason: "malformed payload" });
  assert.equal(verifyLicenseKey(issue({ plan: "enterprise" as "studio" }), { publicKeys: KEYS, now: NOW }).state, "invalid");
  assert.equal(verifyLicenseKey(issue({ seats: 0 }), { publicKeys: KEYS, now: NOW }).state, "invalid");
  assert.deepEqual(verifyLicenseKey(undefined), { state: "none" });
  assert.deepEqual(verifyLicenseKey("  "), { state: "none" });
});

test("rotation: keys from several kids verify against a multi-key set", () => {
  const both = { ...KEYS, [B.kid]: B.pem };
  assert.equal(verifyLicenseKey(issue(), { publicKeys: both, now: NOW }).state, "valid");
  assert.equal(verifyLicenseKey(issue({ kid: B.kid }, B.privateKey), { publicKeys: both, now: NOW }).state, "valid");
});

test("expired: past exp is expired (signature still checked)", () => {
  const key = issue({ exp: sec(NOW) - 86_400 });
  assert.equal(verifyLicenseKey(key, { publicKeys: KEYS, now: NOW }).state, "expired");
  assert.equal(verifyLicenseKey(issue(), { publicKeys: KEYS, now: NOW + 400 * 86_400_000 }).state, "expired");
});

test("sources: --license-key > KOTOMARK_LICENSE_KEY > ~/.kotomark/license", () => {
  const home = mkdtempSync(join(tmp, "home-"));
  assert.equal(resolveLicenseKey({ env: {}, home }), undefined);
  mkdirSync(join(home, ".kotomark"));
  writeFileSync(join(home, ".kotomark", "license"), "FILE-KEY\n");
  assert.deepEqual(resolveLicenseKey({ env: {}, home }), { key: "FILE-KEY", source: "file" });
  assert.deepEqual(resolveLicenseKey({ env: { KOTOMARK_LICENSE_KEY: "ENV-KEY" }, home }), { key: "ENV-KEY", source: "env" });
  assert.deepEqual(resolveLicenseKey({ flag: "FLAG-KEY", env: { KOTOMARK_LICENSE_KEY: "ENV-KEY" }, home }), { key: "FLAG-KEY", source: "flag" });
  assert.deepEqual(resolveLicenseKey({ flag: "", env: { KOTOMARK_LICENSE_KEY: " " }, home }), { key: "FILE-KEY", source: "file" });

  writeFileSync(join(home, ".kotomark", "license"), issue());
  const s = loadLicense({ env: {}, home }, { publicKeys: KEYS, now: NOW });
  assert.equal(s.state, "valid");
  assert.equal(s.state === "valid" && s.source, "file");
  assert.deepEqual(loadLicense({ env: {}, home: join(tmp, "nowhere") }), { state: "none" });
});

test("warnings: nothing without a key or with a valid one; expired/invalid warn and never leak the key", () => {
  const valid = verifyLicenseKey(issue(), { publicKeys: KEYS, now: NOW });
  assert.deepEqual(licenseWarnings({ state: "none" }), []);
  assert.deepEqual(licenseWarnings(valid), []);
  const expired = verifyLicenseKey(issue({ exp: sec(NOW) - 1 }), { publicKeys: KEYS, now: NOW });
  assert.match(licenseWarnings(expired, true)[0]!, /expired on 2026-10-08; continuing \(preview: all features free\)/);
  const forged = issue({}, B.privateKey);
  const w = licenseWarnings(verifyLicenseKey(forged, { publicKeys: KEYS }), false);
  assert.match(w[0]!, /invalid license key \(bad signature\); continuing as free/);
  assert.ok(!w[0]!.includes(forged.split(".")[1]!));
});

test("gating: preview lets everything through; afterwards only runs above the row limit need a valid key", () => {
  const none: LicenseStatus = { state: "none" };
  const valid = verifyLicenseKey(issue(), { publicKeys: KEYS, now: NOW });
  const expired = verifyLicenseKey(issue({ exp: sec(NOW) - 1 }), { publicKeys: KEYS, now: NOW });
  const invalid: LicenseStatus = { state: "invalid", reason: "bad signature" };
  for (const s of [none, valid, expired, invalid]) assert.deepEqual(gateRun(5_000_000, s, true), { ok: true });
  assert.deepEqual(gateRun(10_000_000, none), { ok: true }, "default = PREVIEW");

  assert.deepEqual(gateRun(FREE_ROWS_PER_RUN, none, false), { ok: true });
  assert.deepEqual(gateRun(FREE_ROWS_PER_RUN + 1, valid, false), { ok: true });
  for (const s of [none, expired, invalid]) {
    const g = gateRun(FREE_ROWS_PER_RUN + 1, s, false);
    assert.equal(g.ok, false);
    assert.match(!g.ok ? g.message : "", /20,001 rows; the free tier checks up to 20,000 rows per run/);
  }
});

test("status output", () => {
  const none = formatLicenseStatus({ state: "none" }, { preview: true });
  assert.match(none, /key:\s+not set/);
  assert.match(none, /preview:\s+all features free/);

  const valid = formatLicenseStatus({ ...verifyLicenseKey(issue({ features: ["large-runs"] }), { publicKeys: KEYS, now: NOW }), source: "env" } as LicenseStatus, { preview: true, now: NOW });
  assert.match(valid, /key:\s+present \(from KOTOMARK_LICENSE_KEY\)/);
  assert.match(valid, /status:\s+valid/);
  assert.match(valid, /org:\s+Test Studio/);
  assert.match(valid, /plan:\s+studio/);
  assert.match(valid, /seats:\s+5/);
  assert.match(valid, /expires:\s+2027-11-08 \(in 395 day\(s\)\)/);
  assert.match(valid, /features:\s+large-runs/);
  assert.match(valid, /preview:/);

  const expired = formatLicenseStatus(verifyLicenseKey(issue({ exp: sec(NOW) - 3 * 86_400 }), { publicKeys: KEYS, now: NOW }), { preview: false, now: NOW });
  assert.match(expired, /status:\s+expired/);
  assert.match(expired, /3 day\(s\) ago/);
  assert.match(expired, /tier:\s+free — up to 20,000 rows per run/);
  assert.doesNotMatch(expired, /preview:/);

  const invalid = formatLicenseStatus({ state: "invalid", reason: "unknown kid", source: "flag" }, { preview: true });
  assert.match(invalid, /present \(from --license-key\)/);
  assert.match(invalid, /invalid license key \(unknown kid\)/);
  assert.match(formatLicenseStatus(verifyLicenseKey(issue(), { publicKeys: KEYS, now: NOW }), { preview: false, now: NOW }), /tier:\s+paid/);
});

// --- CLI (source via tsx) -----------------------------------------------------------------------------

function cli(args: string[], env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmp, "clihome-"));
  const e: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1", ...env };
  if (!("KOTOMARK_LICENSE_KEY" in env)) delete e.KOTOMARK_LICENSE_KEY;
  const r = spawnSync(process.execPath, ["--import", "tsx", join(root, "src/cli/index.ts"), ...args], { cwd: root, env: e, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("CLI: license status and check stay silent without a key; a bad key only warns", () => {
  const status = cli(["license", "status"]);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, /key:\s+not set/);
  assert.match(status.stdout, /preview:\s+all features free/);

  const args = ["check", "samples/ja-en/script.csv", "-g", "samples/ja-en/glossary.json", "--format", "json"];
  const plain = cli(args);
  assert.equal(plain.code, 1);
  assert.doesNotMatch(plain.stderr, /licen[cs]e/i, "no nagging during the preview");

  const bogus = "KOTOMARK-1.eyJ2IjoxfQ.c2ln";
  const env = cli(args, { KOTOMARK_LICENSE_KEY: bogus });
  assert.equal(env.code, 1, "same exit code as without a key");
  assert.match(env.stderr, /warning: invalid license key \(malformed payload\); continuing/);
  assert.equal(env.stdout, plain.stdout);
  assert.ok(!env.stderr.includes(bogus) && !env.stdout.includes(bogus));

  const flag = cli([...args, "--license-key", issue()]);
  assert.match(flag.stderr, /invalid license key \(unknown kid\)/, "test keys are not embedded");
  const st = cli(["license", "status", "--license-key", "nope"], { KOTOMARK_LICENSE_KEY: issue() });
  assert.match(st.stdout, /present \(from --license-key\)/);
  assert.match(st.stdout, /unknown format/);
});

// --- issuance script --------------------------------------------------------------------------------

test("scripts/license-issue.mjs: --init (0600, outside the repo only) then issue a verifiable key", () => {
  const script = join(root, "scripts/license-issue.mjs");
  const run = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOME: join(tmp, "issuer-home") } });

  const inRepo = run(["--init", "--key", join(root, "test-signing-key.pem")]);
  assert.notEqual(inRepo.status, 0);
  assert.match(inRepo.stderr, /refusing/);
  assert.ok(!existsSync(join(root, "test-signing-key.pem")));

  const keyPath = join(tmp, "keys", "signing.pem");
  const init = run(["--init", "--key", keyPath]);
  assert.equal(init.status, 0, init.stderr);
  if (process.platform !== "win32") assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  const m = /^ {2}"(k-[0-9a-f]{12})": `(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`,$/m.exec(init.stdout);
  assert.ok(m, init.stdout);
  assert.doesNotMatch(init.stdout, /PRIVATE/);
  assert.equal(run(["--init", "--key", keyPath]).status, 1, "no silent overwrite");
  assert.equal(run(["--pubkey", "--key", keyPath]).stdout, init.stdout);

  const issued = run(["--key", keyPath, "--org", "ACME ゲームス", "--seats", "7", "--days", "395", "--features", "large-runs"]);
  assert.equal(issued.status, 0, issued.stderr);
  const s = verifyLicenseKey(issued.stdout.trim(), { publicKeys: { [m[1]!]: m[2]! } });
  assert.equal(s.state, "valid");
  if (s.state === "valid") {
    assert.equal(s.payload.org, "ACME ゲームス");
    assert.equal(s.payload.seats, 7);
    assert.equal(s.payload.kid, m[1]);
    assert.equal(s.payload.exp - s.payload.iat, 395 * 86_400);
    assert.deepEqual(s.payload.features, ["large-runs"]);
  }
  assert.equal(run(["--key", keyPath, "--org", "X", "--plan", "gold"]).status, 1);
  assert.equal(run(["--key", join(tmp, "missing.pem"), "--org", "X"]).status, 1);
});
