// Forgery cases the Atlas K1 review added to §5.8 (test/license.test.ts covers the rest). Runtime keys only.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { KEY_PREFIX, SIGNING_CONTEXT, keyId, verifyLicenseKey, type LicenseStatus, type LicenseTestHooks } from "../src/cli/license.js";

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const der = publicKey.export({ type: "spki", format: "der" });
  return { privateKey, pem, kid: keyId(pem), der, raw: der.subarray(der.length - 32) };
}
const A = pair();
const B = pair();
const NOW = Date.UTC(2026, 9, 9, 12);
const sec = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400;
const iat = sec(NOW) - DAY;
const g = globalThis as { __KOTOMARK_TEST_HOOKS__?: LicenseTestHooks };
const setHooks = (h: Partial<LicenseTestHooks> = {}) =>
  (g.__KOTOMARK_TEST_HOOKS__ = { publicKeys: { [A.kid]: { key: A.pem, from: "2026-01-01" } }, now: NOW, buildFloor: sec(Date.UTC(2026, 9, 1)), ...h });
beforeEach(() => setHooks());

const json = (extra = "", limits = '{"seats":1}') =>
  `{"v":1,"kid":"${A.kid}","lid":"AAAAAAAAAAAAAAAAAAAAAA","sub":"c1","name":"X","plan":"studio",${extra}"features":[],"limits":${limits},"iat":${iat},"nbf":${iat},"exp":${iat + 30 * DAY}}`;
const sigOf = (bytes: Buffer, k: KeyObject = A.privateKey, ctx = SIGNING_CONTEXT) => sign(null, Buffer.concat([Buffer.from(ctx), bytes]), k);
const key = (bytes: Buffer, sig: Buffer) => `${KEY_PREFIX}${bytes.toString("base64url")}.${sig.toString("base64url")}`;
const signed = (text: string) => key(Buffer.from(text), sigOf(Buffer.from(text)));
const reason = (s: LicenseStatus) => (s.state === "invalid" ? s.reason : s.state);
const std = (b: Buffer) => b.toString("base64").replace(/=+$/, "");

test("control: the payload used below verifies", () => {
  assert.equal(verifyLicenseKey(signed(json())).state, "valid");
});

test("prototype keys in a validly signed payload are rejected", () => {
  for (const [extra, limits] of [['"__proto__":{"plan":"enterprise"},', undefined], ['"constructor":{"prototype":{}},', undefined], ["", '{"seats":1,"__proto__":{"rows":1000000000}}']] as const) {
    assert.equal(reason(verifyLicenseKey(signed(json(extra, limits)))), "malformed payload", extra || limits);
  }
});

test("base64url: standard alphabet, mixed alphabets and padding on the payload are rejected", () => {
  // find a payload/signature whose standard base64 contains + or /
  for (let n = 0; n < 5000; n++) {
    const bytes = Buffer.from(json().replace("AAAAAAAAAAAAAAAAAAAAAA", Buffer.from([n & 255, n >> 8, ...Array(14).fill(7)]).toString("base64url")));
    const sig = sigOf(bytes);
    if (!/[+/]/.test(std(bytes) + std(sig))) continue;
    assert.equal(verifyLicenseKey(key(bytes, sig)).state, "valid");
    assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${std(bytes)}.${std(sig)}`)), "malformed");
    assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${bytes.toString("base64url")}.${std(sig)}`)), "malformed");
    break;
  }
  let text = json();
  while (Buffer.byteLength(text) % 3 === 0) text = text.replace('"name":"X', '"name":"XX');
  const bytes = Buffer.from(text);
  const padded = bytes.toString("base64url") + "=".repeat(3 - (bytes.length % 3));
  assert.equal(reason(verifyLicenseKey(`${KEY_PREFIX}${padded}.${sigOf(bytes).toString("base64url")}`)), "malformed");
});

test("ed25519 malleability: S + L does not verify", () => {
  const bytes = Buffer.from(json());
  const sig = sigOf(bytes);
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  let S = 0n;
  for (let i = 31; i >= 0; i--) S = (S << 8n) | BigInt(sig[32 + i]!);
  let x = S + L;
  if (x >> 256n) return; // does not fit: nothing to test for this signature
  const out = Buffer.from(sig);
  for (let i = 0; i < 32; i++) (out[32 + i] = Number(x & 0xffn)), (x >>= 8n);
  assert.equal(reason(verifyLicenseKey(key(bytes, out))), "bad signature");
});

test("signing-input boundary: moving the context's NUL into the payload does not verify", () => {
  const p = Buffer.from(json());
  const shifted = Buffer.concat([Buffer.from([0]), p]);
  const sig = sign(null, Buffer.concat([Buffer.from("kotomark-license-v1"), shifted]), A.privateKey); // same bytes as CONTEXT + p
  assert.equal(reason(verifyLicenseKey(key(shifted, sig))), "bad signature");
  const doubled = Buffer.concat([Buffer.from(SIGNING_CONTEXT), p]);
  assert.equal(reason(verifyLicenseKey(key(doubled, sigOf(p)))), "bad signature");
});

test("algorithm confusion: zero signature, HMAC keyed with the raw / DER public key", () => {
  const p = Buffer.from(json());
  const input = Buffer.concat([Buffer.from(SIGNING_CONTEXT), p]);
  assert.equal(reason(verifyLicenseKey(key(p, Buffer.alloc(64)))), "bad signature");
  for (const k of [A.raw, A.der]) assert.equal(reason(verifyLicenseKey(key(p, createHmac("sha512", k).update(input).digest()))), "bad signature");
  for (const type of ["x25519", "ed448"] as const) {
    const pem = generateKeyPairSync(type as "x25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    setHooks({ publicKeys: { [keyId(pem)]: { key: pem, from: "2026-01-01" } } });
    assert.equal(reason(verifyLicenseKey(key(Buffer.from(json().replace(A.kid, keyId(pem))), Buffer.alloc(64, 1)))), "bad signature", type);
  }
});

test("unicode and whitespace: only trimming is tolerated", () => {
  const k = signed(json());
  assert.equal(verifyLicenseKey(`﻿　${k}\r\n`).state, "valid", "trim() also removes BOM / ideographic space");
  const [b, s] = k.slice(KEY_PREFIX.length).split(".") as [string, string];
  for (const bad of [`ＫＭ１．${b}.${s}`, `KM1.${b.slice(0, 8)}​${b.slice(8)}.${s}`, `KM1.${b.slice(0, 8)}\n${b.slice(8)}.${s}`, `KM1.${b}.${s} x`]) {
    assert.equal(verifyLicenseKey(bad).state, "invalid", JSON.stringify(bad.slice(0, 12)));
  }
});

test("claims: duplicate features, huge exp, removed kid", () => {
  assert.equal(reason(verifyLicenseKey(signed(json().replace('"features":[]', '"features":["large-runs","large-runs"]')))), "malformed payload");
  assert.equal(reason(verifyLicenseKey(signed(json().replace(`"exp":${iat + 30 * DAY}`, `"exp":${2 ** 40}`)))), "validity too long");
  const bBytes = Buffer.from(json().replace(A.kid, B.kid));
  assert.equal(reason(verifyLicenseKey(key(bBytes, sigOf(bBytes, B.privateKey)))), "bad signature", "kid no longer in the list");
});
