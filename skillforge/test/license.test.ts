// Offline license keys (src/cli/license.ts, scripts/license-issue.mjs) and the forgery cases of the security review
// (§5.8). Every key pair is generated at runtime and injected through the test hook; no private key is committed, and
// the embedded production keys are never used.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore -- plain .mjs build script, no type declarations
import { buildCli } from "../scripts/build-cli.mjs";
import {
  CLOCK_SKEW_SEC,
  FREE_ROWS_PER_RUN,
  KEY_PREFIX,
  MAX_KEY_LENGTH,
  PREVIEW,
  SIGNING_CONTEXT,
  formatLicenseStatus,
  gateRun,
  hasDuplicateKeys,
  keyId,
  licenseForRun,
  licenseWarnings,
  loadLicense,
  resolveLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
  type LicenseStatus,
  type LicenseTestHooks,
} from "../src/cli/license.js";
import { BUILD_FLOOR, DISABLED_KIDS, LICENSE_PUBLIC_KEYS, REVOKED_LIDS } from "../src/cli/license-pubkey.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "kotomark-license-"));
const preload = join(root, "test", "license-hooks-preload.mjs");

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKey, pem, kid: keyId(pem) };
}
const A = pair();
const B = pair();
const NOW = Date.UTC(2026, 9, 9, 12);
const sec = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400;
const trusted = (...ps: { pem: string; kid: string }[]) => Object.fromEntries(ps.map((p) => [p.kid, { key: p.pem, from: "2026-01-01" }]));
const BASE_HOOKS: LicenseTestHooks = { publicKeys: trusted(A), now: NOW, buildFloor: sec(Date.UTC(2026, 9, 1)) };

const g = globalThis as { __KOTOMARK_TEST_HOOKS__?: LicenseTestHooks };
const setHooks = (h: Partial<LicenseTestHooks> = {}) => (g.__KOTOMARK_TEST_HOOKS__ = { ...BASE_HOOKS, ...h });
beforeEach(() => setHooks());

function payloadOf(over: Record<string, unknown> = {}): LicensePayload {
  const iat = sec(NOW) - DAY;
  return { v: 1, kid: A.kid, lid: "AAAAAAAAAAAAAAAAAAAAAA", sub: "cust_0001", name: "Test Studio", plan: "studio", features: [], limits: { seats: 5 }, iat, nbf: iat, exp: iat + 395 * DAY, ...over } as LicensePayload;
}
/** Signs raw payload bytes the way the issuer does (or with another context, for the domain-separation cases). */
function signBytes(bytes: Buffer, privateKey: KeyObject = A.privateKey, context = SIGNING_CONTEXT): string {
  return `${KEY_PREFIX}${bytes.toString("base64url")}.${sign(null, Buffer.concat([Buffer.from(context), bytes]), privateKey).toString("base64url")}`;
}
const issue = (over: Record<string, unknown> = {}, privateKey: KeyObject = A.privateKey) => signBytes(Buffer.from(JSON.stringify(payloadOf(over))), privateKey);
const parts = (key: string) => key.slice(KEY_PREFIX.length).split(".") as [string, string];
const reason = (s: LicenseStatus) => (s.state === "invalid" ? s.reason : s.state);

test("preview switch is on, nothing secret is embedded, and the trust anchors are sane", () => {
  assert.equal(PREVIEW, true);
  assert.equal(FREE_ROWS_PER_RUN, 20_000);
  for (const k of Object.values(LICENSE_PUBLIC_KEYS)) {
    assert.doesNotMatch(k.key, /PRIVATE/);
    assert.match(k.from, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(DISABLED_KIDS.size >= 0 && REVOKED_LIDS.size >= 0, true);
  assert.ok(BUILD_FLOOR > sec(Date.UTC(2026, 0, 1)) && BUILD_FLOOR * 1000 <= Date.now(), "BUILD_FLOOR is a past release date");
});

test("valid: an issued key verifies; surrounding whitespace is fine", () => {
  const s = verifyLicenseKey(issue({ features: ["large-runs"] }));
  assert.equal(s.state, "valid");
  assert.equal(s.state === "valid" && s.payload.name, "Test Studio");
  assert.deepEqual(s.state === "valid" && s.payload.features, ["large-runs"]);
  assert.equal(verifyLicenseKey(`  ${issue()}\n`).state, "valid");
  assert.deepEqual(verifyLicenseKey(undefined), { state: "none" });
  assert.deepEqual(verifyLicenseKey("  "), { state: "none" }, "empty string = no key");
});

test("forgery: signature and payload must belong together", () => {
  const [body, sig] = parts(issue());
  const [otherBody, otherSig] = parts(issue({ lid: "BBBBBBBBBBBBBBBBBBBBBB", name: "Other" }));
  // another valid key's signature moved onto this payload, and vice versa
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${otherSig}`)), "bad signature");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${otherBody}.${sig}`)), "bad signature");
  // payload edited (plan, expiry, seats) under the original signature
  for (const over of [{ exp: sec(NOW) + 5000 * DAY }, { limits: { seats: 500 } }, { name: "Forged Inc" }]) {
    const forged = Buffer.from(JSON.stringify(payloadOf(over))).toString("base64url");
    assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${forged}.${sig}`)), "bad signature");
  }
  // unknown kid: B's key is not trusted
  assert.equal(reason(verifyLicenseKey(issue({ kid: B.kid }, B.privateKey))), "bad signature");
  // the right kid, but signed with another private key
  assert.equal(reason(verifyLicenseKey(issue({ kid: A.kid }, B.privateKey))), "bad signature");
  // signed by a trusted key, but claiming another trusted kid
  setHooks({ publicKeys: trusted(A, B) });
  assert.equal(reason(verifyLicenseKey(issue({ kid: A.kid }, B.privateKey))), "kid mismatch");
  assert.equal(verifyLicenseKey(issue({ kid: B.kid }, B.privateKey)).state, "valid", "rotation: both kids verify");
});

test("forgery: signatures made for another product or purpose do not verify (domain separation)", () => {
  const bytes = Buffer.from(JSON.stringify(payloadOf()));
  assert.equal(verifyLicenseKey(signBytes(bytes)).state, "valid");
  for (const ctx of ["", "kotomark-license-v2\u0000", "kotomark-license-v1", "other-product-license-v1\u0000", "KM1."]) {
    assert.equal(reason(verifyLicenseKey(signBytes(bytes, A.privateKey, ctx))), "bad signature", JSON.stringify(ctx));
  }
  // the old KOTOMARK-1 format (signature over "KOTOMARK-1.<b64>") is not accepted either
  const b64 = bytes.toString("base64url");
  const old = `KOTOMARK-1.${b64}.${sign(null, Buffer.from(`KOTOMARK-1.${b64}`), A.privateKey).toString("base64url")}`;
  assert.equal(reason(verifyLicenseKey(old)), "unknown format");
});

test("forgery: no algorithm choice — alg:none, HMAC with the public key, non-ed25519 trusted keys", () => {
  const bytes = Buffer.from(JSON.stringify({ ...payloadOf(), alg: "none" }));
  const b64 = bytes.toString("base64url");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${b64}.`)), "malformed");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${b64}.bm9uZQ`)), "malformed signature");
  // validly signed, but carrying a header-style field: unknown fields are rejected after verification
  assert.equal(reason(verifyLicenseKey(signBytes(bytes))), "malformed payload");
  for (const extra of [{ jwk: { kty: "OKP" } }, { x5u: "https://example.com/k" }, { kid2: "x" }]) {
    assert.equal(reason(verifyLicenseKey(signBytes(Buffer.from(JSON.stringify({ ...payloadOf(), ...extra }))))), "malformed payload");
  }
  // HMAC keyed with the public key (the classic RS/HS confusion): 32 bytes is not an ed25519 signature; 64 bytes fails
  const input = Buffer.concat([Buffer.from(SIGNING_CONTEXT), Buffer.from(JSON.stringify(payloadOf()))]);
  const body = Buffer.from(JSON.stringify(payloadOf())).toString("base64url");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${createHmac("sha256", A.pem).update(input).digest("base64url")}`)), "malformed signature");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${createHmac("sha512", A.pem).update(input).digest("base64url")}`)), "bad signature");
  // a trusted entry that is not an ed25519 key is never used
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const ecPem = ec.publicKey.export({ type: "spki", format: "pem" }).toString();
  setHooks({ publicKeys: { [keyId(ecPem)]: { key: ecPem, from: "2026-01-01" } } });
  const ecSig = sign("sha256", input, { key: ec.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${ecSig}`)), "bad signature");
});

test("time: expired, not yet valid, issued in the future, clock rolled back", () => {
  assert.equal(verifyLicenseKey(issue({ exp: sec(NOW) - 1 })).state, "expired", "signature still checked, then expiry");
  setHooks({ now: NOW + 400 * DAY * 1000 });
  assert.equal(verifyLicenseKey(issue()).state, "expired");
  setHooks();
  assert.equal(reason(verifyLicenseKey(issue({ nbf: sec(NOW) + DAY }))), "not yet valid");
  const future = sec(NOW) + 2 * CLOCK_SKEW_SEC;
  assert.equal(reason(verifyLicenseKey(issue({ iat: future, nbf: future, exp: future + 30 * DAY }))), "issued in the future (check the system clock)");
  // a small skew is tolerated
  const soon = sec(NOW) + 60;
  assert.equal(reason(verifyLicenseKey(issue({ iat: soon, nbf: sec(NOW) - 60, exp: soon + 30 * DAY }))), "malformed payload", "nbf before iat is malformed");
  assert.equal(verifyLicenseKey(issue({ iat: soon, nbf: soon, exp: soon + 30 * DAY })).state, "invalid", "nbf in the future");
  // clock set before this release (rolled back to keep an expired key alive)
  setHooks({ now: Date.UTC(2026, 0, 1), buildFloor: sec(Date.UTC(2026, 9, 1)), publicKeys: { [A.kid]: { key: A.pem, from: "2025-01-01" } } });
  assert.equal(reason(verifyLicenseKey(issue({ iat: sec(Date.UTC(2025, 11, 1)), nbf: sec(Date.UTC(2025, 11, 1)), exp: sec(Date.UTC(2026, 1, 1)) }))), "system clock is set before this release");
});

test("claims: validity cap, the signing key's period, revoked lid, disabled kid", () => {
  assert.equal(reason(verifyLicenseKey(issue({ exp: sec(NOW) - DAY + 401 * DAY }))), "validity too long");
  setHooks({ publicKeys: { [A.kid]: { key: A.pem, from: "2026-10-09" } } });
  assert.equal(reason(verifyLicenseKey(issue())), "signed outside the key's validity period", "iat before the key's first day");
  setHooks({ publicKeys: { [A.kid]: { key: A.pem, from: "2026-01-01", until: "2026-06-30" } } });
  assert.equal(reason(verifyLicenseKey(issue())), "signed outside the key's validity period", "iat after the key was retired");
  setHooks({ revokedLids: new Set(["AAAAAAAAAAAAAAAAAAAAAA"]) });
  assert.equal(reason(verifyLicenseKey(issue())), "revoked");
  assert.equal(verifyLicenseKey(issue({ lid: "CCCCCCCCCCCCCCCCCCCCCC" })).state, "valid");
  setHooks({ disabledKids: new Set([A.kid]) });
  assert.equal(reason(verifyLicenseKey(issue())), "bad signature", "a disabled kid verifies nothing");
});

test("encoding and format: lengths, canonical base64url, duplicate keys, sizes, unknown features, versions", () => {
  const key = issue();
  const [body, sig] = parts(key);
  const sigBytes = Buffer.from(sig, "base64url");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${sigBytes.subarray(0, 63).toString("base64url")}`)), "malformed signature");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${Buffer.concat([sigBytes, Buffer.from([0])]).toString("base64url")}`)), "malformed signature");
  // non-canonical base64url: the same bytes with padding, or with stray low bits in the last character
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${sig}==`)), "malformed");
  const last = sig[sig.length - 1]!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const tweaked = sig.slice(0, -1) + alphabet[alphabet.indexOf(last) ^ 1];
  assert.equal(Buffer.from(tweaked, "base64url").equals(sigBytes), true, "decodes to the same bytes");
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${body}.${tweaked}`)), "malformed");
  for (const bad of ["hello", "KM1.", "KM1.abc", "KM1.a.b.c", "KM1.a+b.c", `KM2.${body}.${sig}`, `km1.${body}.${sig}`, `KOTOMARK-1.${body}.${sig}`]) {
    assert.equal(verifyLicenseKey(bad).state, "invalid", bad);
  }
  // duplicate keys ("plan":"solo","plan":"studio"), validly signed: rejected so no two parsers can disagree
  const dup = `{"v":1,"kid":"${A.kid}","lid":"AAAAAAAAAAAAAAAAAAAAAA","sub":"c1","name":"X","plan":"solo","plan":"studio","features":[],"limits":{"seats":1},"iat":${sec(NOW) - DAY},"nbf":${sec(NOW) - DAY},"exp":${sec(NOW) + DAY}}`;
  assert.equal(reason(verifyLicenseKey(signBytes(Buffer.from(dup)))), "malformed payload");
  assert.equal(verifyLicenseKey(signBytes(Buffer.from(dup.replace('"plan":"solo",', "")))).state, "valid", "same payload without the duplicate is fine");
  // too large: the whole key is capped before any crypto
  const huge = issue({ name: "x".repeat(MAX_KEY_LENGTH) });
  assert.equal(reason(verifyLicenseKey(huge)), "too long");
  assert.equal(reason(verifyLicenseKey(issue({ name: "x".repeat(101) }))), "malformed payload", "name cap");
  // unknown feature, wrong types, non-integer seconds, bad lid, unknown plan, control characters
  for (const over of [{ features: ["unlimited-everything"] }, { limits: { seats: 0 } }, { limits: { seats: 5, rows: 1e9 } }, { exp: sec(NOW) + 0.5 }, { lid: "short" }, { plan: "enterprise" }, { name: "A\u0007B" }, { v: 2 }, { sub: "" }]) {
    assert.equal(reason(verifyLicenseKey(issue(over))), "malformed payload", JSON.stringify(over));
  }
  // payload that is not UTF-8 / not JSON, validly signed
  assert.equal(reason(verifyLicenseKey(signBytes(Buffer.from([0xff, 0xfe, 0x7b])))), "malformed payload");
  assert.equal(reason(verifyLicenseKey(signBytes(Buffer.from("not json")))), "malformed payload");
});

test("hasDuplicateKeys: nested objects, escaped keys, arrays", () => {
  assert.equal(hasDuplicateKeys('{"a":1,"b":{"a":2}}'), false);
  assert.equal(hasDuplicateKeys('{"a":1,"a":2}'), true);
  assert.equal(hasDuplicateKeys('{"a":1,"\\u0061":2}'), true, "same key after unescaping");
  assert.equal(hasDuplicateKeys('{"x":{"k":1,"k":1}}'), true);
  assert.equal(hasDuplicateKeys('{"a":["a","a"],"b":"a,\\"a\\":"}'), false, "strings and array items are not keys");
  assert.equal(hasDuplicateKeys('[{"a":1},{"a":1}]'), false);
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
  const s = loadLicense({ env: {}, home });
  assert.equal(s.state, "valid");
  assert.equal(s.state === "valid" && s.source, "file");
  assert.deepEqual(loadLicense({ env: {}, home: join(tmp, "nowhere") }), { state: "none" });
});

test("warnings: nothing without a key or with a valid one; expired/invalid warn and never leak the key", () => {
  assert.deepEqual(licenseWarnings({ state: "none" }), []);
  assert.deepEqual(licenseWarnings(verifyLicenseKey(issue())), []);
  const expired = verifyLicenseKey(issue({ iat: sec(NOW) - 30 * DAY, nbf: sec(NOW) - 30 * DAY, exp: sec(Date.UTC(2026, 9, 8)) }));
  assert.match(licenseWarnings(expired, true)[0]!, /expired on 2026-10-08; continuing \(preview: all features free\)/);
  const forged = issue({}, B.privateKey);
  const w = licenseWarnings(verifyLicenseKey(forged), false);
  assert.match(w[0]!, /invalid license key \(bad signature\); continuing as free/);
  for (const part of parts(forged)) assert.ok(!w[0]!.includes(part));
});

test("gating: preview lets everything through; afterwards only runs above the row limit need a valid key", () => {
  const none: LicenseStatus = { state: "none" };
  const valid = verifyLicenseKey(issue());
  const expired = verifyLicenseKey(issue({ exp: sec(NOW) - 1 }));
  const invalid: LicenseStatus = { state: "invalid", reason: "bad signature" };
  for (const s of [none, valid, expired, invalid]) assert.deepEqual(gateRun(5_000_000, s, true), { ok: true });
  assert.deepEqual(gateRun(10_000_000, none), { ok: true }, "default = PREVIEW");
  assert.deepEqual(gateRun(FREE_ROWS_PER_RUN, none, false), { ok: true });
  assert.deepEqual(gateRun(FREE_ROWS_PER_RUN + 1, valid, false), { ok: true });
  for (const s of [none, expired, invalid]) {
    const r = gateRun(FREE_ROWS_PER_RUN + 1, s, false);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.message : "", /20,001 rows; the free tier checks up to 20,000 rows per run/);
  }
  // licenseForRun: the single decision point (verify + warn + gate + licensee)
  const home = mkdtempSync(join(tmp, "run-"));
  const run = licenseForRun(FREE_ROWS_PER_RUN + 1, { flag: issue(), env: {}, home }, false);
  assert.deepEqual(run.gate, { ok: true });
  assert.equal(run.licensedTo, "Test Studio");
  const bad = licenseForRun(FREE_ROWS_PER_RUN + 1, { flag: issue({}, B.privateKey), env: {}, home }, false);
  assert.equal(bad.gate.ok, false, "a bad key falls back to the free tier");
  assert.equal(bad.licensedTo, undefined);
  assert.equal(licenseForRun(10, { flag: "garbage", env: {}, home }, false).gate.ok, true, "never aborts a run the free tier allows");
});

test("status output", () => {
  const none = formatLicenseStatus({ state: "none" }, { preview: true });
  assert.match(none, /key:\s+not set/);
  assert.match(none, /preview:\s+all features free/);
  const valid = formatLicenseStatus({ ...verifyLicenseKey(issue({ features: ["large-runs"] })), source: "env" } as LicenseStatus, { preview: true, now: NOW });
  assert.match(valid, /key:\s+present \(from KOTOMARK_LICENSE_KEY\)/);
  assert.match(valid, /status:\s+valid/);
  assert.match(valid, /licensee:\s+Test Studio \(cust_0001\)/);
  assert.match(valid, /seats:\s+5/);
  assert.match(valid, /expires:\s+2027-11-07 \(in 394 day\(s\)\)/);
  assert.match(valid, /features:\s+large-runs/);
  const expired = formatLicenseStatus(verifyLicenseKey(issue({ iat: sec(NOW) - 30 * DAY, nbf: sec(NOW) - 30 * DAY, exp: sec(NOW) - 3 * DAY })), { preview: false, now: NOW });
  assert.match(expired, /3 day\(s\) ago/);
  assert.match(expired, /status:\s+expired/);
  assert.match(expired, /tier:\s+free — up to 20,000 rows per run/);
  assert.match(formatLicenseStatus(verifyLicenseKey(issue()), { preview: false, now: NOW }), /tier:\s+paid/);
});

// --- CLI: source (tsx) with the test hook, and the production bundle -----------------------------------------------

const hooksEnv = (h: { publicKeys: Record<string, unknown> }) => ({ KOTOMARK_TEST_HOOKS_JSON: JSON.stringify({ now: NOW, buildFloor: BASE_HOOKS.buildFloor, ...h }) });
function run(entry: string[], args: string[], env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmp, "clihome-"));
  const e: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1", ...env };
  if (!("KOTOMARK_LICENSE_KEY" in env)) delete e.KOTOMARK_LICENSE_KEY;
  const r = spawnSync(process.execPath, [...entry, ...args], { cwd: root, env: e, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const src = (args: string[], env: Record<string, string> = {}) => run(["--import", "tsx", "--import", preload, join(root, "src/cli/index.ts")], args, env);
const CHECK = ["check", "samples/ja-en/script.csv", "-g", "samples/ja-en/glossary.json"];

test("CLI: no key = silent; a bad key only warns; a valid key prints 'Licensed to' in the report and the key nowhere", () => {
  const plain = src([...CHECK, "--format", "json"]);
  assert.equal(plain.code, 1);
  assert.doesNotMatch(plain.stderr, /licen[cs]e/i, "no nagging during the preview");
  const bogus = "KM1.eyJ2IjoxfQ.c2ln";
  const env = src([...CHECK, "--format", "json"], { KOTOMARK_LICENSE_KEY: bogus });
  assert.equal(env.code, 1, "same exit code as without a key");
  assert.match(env.stderr, /warning: invalid license key \(malformed signature\); continuing/);
  assert.equal(env.stdout, plain.stdout);

  const key = issue();
  const leaks = (text: string) => [key, ...parts(key)].some((p) => text.includes(p));
  for (const format of ["md", "json", "junit", "github"]) {
    const r = src([...CHECK, "--format", format], { ...hooksEnv({ publicKeys: trusted(A) }), KOTOMARK_LICENSE_KEY: key });
    assert.equal(r.code, 1, r.stderr);
    assert.ok(!leaks(r.stdout) && !leaks(r.stderr), `key leaked in --format ${format}`);
    if (format === "md") assert.match(r.stdout, /^Licensed to Test Studio$/m);
    else assert.doesNotMatch(r.stdout, /Licensed to/);
  }
  const noHook = src([...CHECK], { KOTOMARK_LICENSE_KEY: key });
  assert.doesNotMatch(noHook.stdout, /Licensed to/, "test keys are not embedded");
  assert.match(noHook.stderr, /invalid license key \(bad signature\)/);
  const st = src(["license", "status", "--license-key", "nope"], { KOTOMARK_LICENSE_KEY: key });
  assert.match(st.stdout, /present \(from --license-key\)/);
  assert.match(st.stdout, /unknown format/);
});

test("production bundle: the test hook is compiled out, so a key signed by an injected public key is rejected", async () => {
  const bin: string = await buildCli(join(mkdtempSync(join(tmp, "bundle-")), "kotomark.mjs"));
  const text = readFileSync(bin, "utf8");
  assert.doesNotMatch(text, /__KOTOMARK_TEST_HOOKS__/);
  assert.doesNotMatch(text, /KOTOMARK_TEST_HOOKS_JSON|LICENSE_PUBLIC_KEYS?_(?:ENV|FILE|PATH)/);
  assert.match(text, /^\/\*! Kotomark engine — .*Elastic License 2\.0/m, "license header at the top");
  const key = issue();
  const env = { ...hooksEnv({ publicKeys: trusted(A) }), KOTOMARK_LICENSE_KEY: key };
  const viaSource = src(["license", "status"], env);
  assert.match(viaSource.stdout, /status:\s+valid/, "the same injection works on the source (proves the test is real)");
  const viaBundle = run(["--import", preload, bin], ["license", "status"], env);
  assert.equal(viaBundle.code, 0, viaBundle.stderr);
  assert.match(viaBundle.stdout, /invalid license key \(bad signature\)/);
  const check = run(["--import", preload, bin], [...CHECK], env);
  assert.doesNotMatch(check.stdout, /Licensed to/);
  assert.ok(![key, ...parts(key)].some((p) => check.stdout.includes(p) || check.stderr.includes(p)));
});

// --- issuance script --------------------------------------------------------------------------------

test("scripts/license-issue.mjs: --init (0600, outside the repo only) then issue a verifiable key", () => {
  const script = join(root, "scripts/license-issue.mjs");
  const exec = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOME: join(tmp, "issuer-home") } });

  const inRepo = exec(["--init", "--key", join(root, "test-signing-key.pem")]);
  assert.notEqual(inRepo.status, 0);
  assert.match(inRepo.stderr, /refusing/);
  assert.ok(!existsSync(join(root, "test-signing-key.pem")));

  const keyPath = join(tmp, "keys", "signing.pem");
  const init = exec(["--init", "--key", keyPath]);
  assert.equal(init.status, 0, init.stderr);
  if (process.platform !== "win32") assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  const m = /^ {2}"(k-[0-9a-f]{12})": \{ key: `(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`, from: "(\d{4}-\d{2}-\d{2})" \},$/m.exec(init.stdout);
  assert.ok(m, init.stdout);
  assert.doesNotMatch(init.stdout, /PRIVATE/);
  assert.equal(exec(["--init", "--key", keyPath]).status, 1, "no silent overwrite");

  const issued = exec(["--key", keyPath, "--sub", "cust_42", "--name", "ACME ゲームス", "--seats", "7", "--days", "395", "--features", "large-runs"]);
  assert.equal(issued.status, 0, issued.stderr);
  setHooks({ publicKeys: { [m[1]!]: { key: m[2]!, from: "2020-01-01" } }, now: Date.now(), buildFloor: BUILD_FLOOR });
  const s = verifyLicenseKey(issued.stdout.trim());
  assert.equal(s.state, "valid", JSON.stringify(s));
  if (s.state === "valid") {
    assert.equal(s.payload.name, "ACME ゲームス");
    assert.equal(s.payload.sub, "cust_42");
    assert.equal(s.payload.limits.seats, 7);
    assert.equal(s.payload.kid, m[1]);
    assert.match(s.payload.lid, /^[A-Za-z0-9_-]{22}$/, "128-bit random lid");
    assert.equal(s.payload.exp - s.payload.iat, 395 * DAY);
    assert.equal(s.payload.nbf, s.payload.iat);
  }
  assert.ok(issued.stdout.trim().startsWith("KM1."));
  // the first occurrence of an option wins, so the override goes before the defaults
  const bad = (args: string[]) => assert.equal(exec(["--key", keyPath, ...args, "--sub", "c", "--name", "X"]).status, 1, args.join(" "));
  bad(["--plan", "gold"]);
  bad(["--days", "401"]);
  bad(["--features", "everything"]);
  bad(["--name", "x".repeat(101)]);
  assert.equal(exec(["--key", keyPath, "--name", "X"]).status, 1, "--sub is required");
  assert.equal(exec(["--key", join(tmp, "missing.pem"), "--sub", "c", "--name", "X"]).status, 1);
});
