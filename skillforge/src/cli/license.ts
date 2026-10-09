import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { BUILD_FLOOR, DISABLED_KIDS, LICENSE_PUBLIC_KEYS, REVOKED_LIDS, type TrustedKey } from "./license-pubkey.js";

/**
 * Offline license keys (HQ decision d29; design requirements: security review §5, docs/licensing.md). Node-only on
 * purpose: src/core stays browser-safe and free of this. No network calls.
 *
 *   KM1.<base64url(payload JSON bytes)>.<base64url(64-byte ed25519 signature)>
 *
 * - The version prefix pins the algorithm: KM1 = ed25519 over "kotomark-license-v1\0" + the payload bytes (domain
 *   separation: no signature made for another purpose verifies here). Nothing in the key can choose an algorithm or a
 *   key (no alg / jwk / x5u; unknown fields are rejected).
 * - The signature is checked on the received bytes first; only a verified payload is decoded and parsed, then validated
 *   strictly (zod strict object, no duplicate JSON keys, known features only, integer seconds, bounded validity).
 * - Clock: a clock behind this release's BUILD_FLOOR, or behind the key's iat, counts as rolled back.
 * - Revocation: DISABLED_KIDS and REVOKED_LIDS ship in each release (offline keys cannot be revoked instantly).
 * - The verdict is taken in licenseForRun(), the function that decides the run's row limit; nothing else verifies.
 */

/**
 * Preview switch. While true, every feature works without a key and nothing nags; a key given anyway is
 * still verified so `kotomark license status` can report it. Flip to false ONLY when paid plans launch
 * (owner decision; see docs/licensing.md).
 */
export const PREVIEW = true;

/** Free tier limit once the preview ends: rows (strings) checked in one run. */
export const FREE_ROWS_PER_RUN = 20_000;

export const KEY_PREFIX = "KM1.";
export const SIGNING_CONTEXT = "kotomark-license-v1\u0000";
export const LICENSE_ENV = "KOTOMARK_LICENSE_KEY";
/** Whole key, in characters. */
export const MAX_KEY_LENGTH = 2048;
/** Longest allowed exp − iat (13 months + margin). */
export const MAX_VALIDITY_SEC = 400 * 86_400;
/** Tolerated clock difference between the issuer and the user. */
export const CLOCK_SKEW_SEC = 3600;
export const KNOWN_FEATURES = ["large-runs"] as const;

// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\u0000-\u001f\u007f-\u009f]*$/;
const sec = z.number().int().min(0).max(2 ** 40);

const PayloadSchema = z.strictObject({
  v: z.literal(1),
  /** Signing key id ("k-" + 12 hex digits of SHA-256 over the public key's SPKI DER). */
  kid: z.string().regex(/^k-[0-9a-f]{12}$/),
  /** License id: 128 random bits, base64url. */
  lid: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  /** Customer id in the issuer's records. */
  sub: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,63}$/),
  /** Licensee name, shown as "Licensed to <name>" in reports. */
  name: z.string().min(1).max(100).regex(NO_CONTROL),
  plan: z.enum(["studio"]),
  features: z.array(z.enum(KNOWN_FEATURES)).max(KNOWN_FEATURES.length),
  limits: z.strictObject({ seats: z.number().int().min(1).max(10_000) }),
  /** Issued at / not before / expires at, Unix seconds. */
  iat: sec,
  nbf: sec,
  exp: sec,
});

export type LicensePayload = z.infer<typeof PayloadSchema>;

export type LicenseSource = "flag" | "env" | "file";

export type LicenseStatus =
  | { state: "none" }
  | { state: "valid" | "expired"; payload: LicensePayload; source?: LicenseSource }
  | { state: "invalid"; reason: string; source?: LicenseSource };

/** Key id of a public key: "k-" + first 12 hex chars of SHA-256 over its SPKI DER. Same as the issuance script. */
export function keyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return `k-${createHash("sha256").update(der).digest("hex").slice(0, 12)}`;
}

/**
 * Test-only trust overrides. `__KOTOMARK_TEST_HOOKS__` is a free identifier that test code may set on globalThis;
 * every production build (scripts/build-cli.mjs) replaces it with `undefined` at compile time, so the shipped bundle has
 * no path — flag, environment variable, file or global — that swaps the public keys, the revocation lists or the clock.
 */
export interface LicenseTestHooks {
  publicKeys?: Readonly<Record<string, TrustedKey>>;
  disabledKids?: ReadonlySet<string>;
  revokedLids?: ReadonlySet<string>;
  /** Current time, ms. */
  now?: number;
  /** Unix seconds. */
  buildFloor?: number;
}
declare const __KOTOMARK_TEST_HOOKS__: LicenseTestHooks | undefined;
function testHooks(): LicenseTestHooks | undefined {
  return typeof __KOTOMARK_TEST_HOOKS__ === "undefined" ? undefined : __KOTOMARK_TEST_HOOKS__;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
/** Strict base64url: the canonical encoding only (no padding, no stray bits), so one key has one spelling. */
function decodeB64url(s: string): Buffer | undefined {
  if (!B64URL.test(s) || s.length % 4 === 1) return undefined;
  const b = Buffer.from(s, "base64url");
  return b.toString("base64url") === s ? b : undefined;
}

const keyObjects = new Map<string, KeyObject | null>();
function ed25519Key(pem: string): KeyObject | null {
  let k = keyObjects.get(pem);
  if (k === undefined) {
    try {
      const obj = createPublicKey(pem);
      k = obj.asymmetricKeyType === "ed25519" ? obj : null; // any other key type is never used
    } catch {
      k = null;
    }
    keyObjects.set(pem, k);
  }
  return k;
}

/** True when the JSON text (already known to be valid) has an object with the same key twice. */
export function hasDuplicateKeys(json: string): boolean {
  const stack: { keys: Set<string> | null; expectKey: boolean }[] = [];
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (c === "{") stack.push({ keys: new Set(), expectKey: true });
    else if (c === "[") stack.push({ keys: null, expectKey: false });
    else if (c === "}" || c === "]") stack.pop();
    else if (c === ",") {
      const top = stack[stack.length - 1];
      if (top?.keys) top.expectKey = true;
    } else if (c === '"') {
      let j = i + 1;
      while (json[j] !== '"') j += json[j] === "\\" ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.keys && top.expectKey) {
        const key = JSON.parse(json.slice(i, j + 1)) as string;
        if (top.keys.has(key)) return true;
        top.keys.add(key);
        top.expectKey = false;
      }
      i = j;
    }
  }
  return false;
}

const dayStart = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) / 1000 : NaN);

/** Verifies a key offline against the embedded trust anchors. Never throws; a malformed or forged key is `invalid`. */
export function verifyLicenseKey(key: string | undefined): LicenseStatus {
  if (!key?.trim()) return { state: "none" };
  const k = key.trim();
  const invalid = (reason: string): LicenseStatus => ({ state: "invalid", reason });
  if (k.length > MAX_KEY_LENGTH) return invalid("too long");
  if (!k.startsWith(KEY_PREFIX)) return invalid("unknown format");
  const parts = k.slice(KEY_PREFIX.length).split(".");
  if (parts.length !== 2) return invalid("malformed");
  const body = decodeB64url(parts[0]!);
  const sig = decodeB64url(parts[1]!);
  if (!body || !sig) return invalid("malformed");
  if (sig.length !== 64) return invalid("malformed signature");

  const hooks = testHooks();
  const keys = hooks?.publicKeys ?? LICENSE_PUBLIC_KEYS;
  const disabled = hooks?.disabledKids ?? DISABLED_KIDS;
  const revoked = hooks?.revokedLids ?? REVOKED_LIDS;

  // 1. Signature over the received bytes, before anything reads them.
  const signed = Buffer.concat([Buffer.from(SIGNING_CONTEXT, "utf8"), body]);
  let signer: string | undefined;
  for (const kid of Object.keys(keys).sort()) {
    if (disabled.has(kid)) continue;
    const pub = ed25519Key(keys[kid]!.key);
    if (!pub) continue;
    let ok = false;
    try {
      ok = verify(null, signed, pub, sig);
    } catch {
      ok = false;
    }
    if (ok) {
      signer = kid;
      break;
    }
  }
  if (!signer) return invalid("bad signature");

  // 2. Only now decode and parse the payload, strictly.
  let raw: unknown;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    raw = JSON.parse(text);
  } catch {
    return invalid("malformed payload");
  }
  if (hasDuplicateKeys(text)) return invalid("malformed payload");
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) return invalid("malformed payload");
  const p = parsed.data;

  // 3. Claims.
  if (p.kid !== signer) return invalid("kid mismatch");
  if (revoked.has(p.lid)) return invalid("revoked");
  const anchor = keys[signer]!;
  const from = dayStart(anchor.from);
  const until = anchor.until === undefined ? Infinity : dayStart(anchor.until) + 86_400;
  // A malformed anchor date parses to NaN, and every comparison with NaN is false: fail closed instead of skipping the check.
  if (Number.isNaN(from) || Number.isNaN(until)) return invalid("bad trust anchor");
  if (p.iat < from || p.iat >= until) return invalid("signed outside the key's validity period");
  if (!(p.iat <= p.nbf && p.nbf < p.exp)) return invalid("malformed payload");
  if (p.exp - p.iat > MAX_VALIDITY_SEC) return invalid("validity too long");

  // 4. Time. The clock is the user's, so it is checked against what we know cannot be in the future.
  const now = Math.floor((hooks?.now ?? Date.now()) / 1000);
  if (now < (hooks?.buildFloor ?? BUILD_FLOOR) - CLOCK_SKEW_SEC) return invalid("system clock is set before this release");
  if (now < p.iat - CLOCK_SKEW_SEC) return invalid("issued in the future (check the system clock)");
  if (now < p.nbf) return invalid("not yet valid");
  if (p.exp <= now) return { state: "expired", payload: p };
  return { state: "valid", payload: p };
}

export interface KeySources {
  flag?: string;
  env?: NodeJS.ProcessEnv;
  /** Home directory holding .kotomark/license (default os.homedir()). */
  home?: string;
}

/** Finds the key: --license-key > $KOTOMARK_LICENSE_KEY > ~/.kotomark/license. Only finds it; never interprets it. */
export function resolveLicenseKey(src: KeySources = {}): { key: string; source: LicenseSource } | undefined {
  if (src.flag?.trim()) return { key: src.flag.trim(), source: "flag" };
  const env = (src.env ?? process.env)[LICENSE_ENV];
  if (env?.trim()) return { key: env.trim(), source: "env" };
  try {
    const file = readFileSync(join(src.home ?? homedir(), ".kotomark", "license"), "utf8").trim();
    if (file) return { key: file, source: "file" };
  } catch {
    // no file — free / preview
  }
  return undefined;
}

/** Resolves and verifies in one go. */
export function loadLicense(src: KeySources = {}): LicenseStatus {
  const found = resolveLicenseKey(src);
  if (!found) return { state: "none" };
  return { ...verifyLicenseKey(found.key), source: found.source } as LicenseStatus;
}

const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

/** Warnings for stderr. Never contains the key itself; empty when there is nothing to say (no nagging). */
export function licenseWarnings(status: LicenseStatus, preview = PREVIEW): string[] {
  const tail = preview ? "continuing (preview: all features free)" : "continuing as free";
  if (status.state === "expired") return [`warning: license key expired on ${day(status.payload.exp)}; ${tail}`];
  if (status.state === "invalid") return [`warning: invalid license key (${status.reason}); ${tail}`];
  return [];
}

export type GateResult = { ok: true } | { ok: false; message: string };

/**
 * The only gate: large runs. During the preview everything passes. Afterwards a run above
 * FREE_ROWS_PER_RUN rows needs a valid (unexpired) key; all checks themselves stay free.
 */
export function gateRun(rows: number, status: LicenseStatus, preview = PREVIEW): GateResult {
  if (preview || rows <= FREE_ROWS_PER_RUN || status.state === "valid") return { ok: true };
  return {
    ok: false,
    message: `this run has ${rows.toLocaleString("en-US")} rows; the free tier checks up to ${FREE_ROWS_PER_RUN.toLocaleString("en-US")} rows per run. Split the input or set a license key (--license-key, ${LICENSE_ENV} or ~/.kotomark/license).`,
  };
}

export interface RunLicense {
  status: LicenseStatus;
  warnings: string[];
  gate: GateResult;
  /** Licensee name for the report, when the key is valid. */
  licensedTo?: string;
}

/**
 * The engine's limit decision for one run: finds the key, verifies it and decides whether `rows` may be checked.
 * This is the one place a run's key is verified (the Action's run.sh and the argument parser only pass it along).
 * A bad or expired key falls back to the free tier; it never aborts a run that the free tier allows.
 */
export function licenseForRun(rows: number, src: KeySources = {}, preview = PREVIEW): RunLicense {
  const status = loadLicense(src);
  return {
    status,
    warnings: licenseWarnings(status, preview),
    gate: gateRun(rows, status, preview),
    licensedTo: status.state === "valid" ? status.payload.name : undefined,
  };
}

const SOURCE_LABEL: Record<LicenseSource, string> = { flag: "--license-key", env: LICENSE_ENV, file: "~/.kotomark/license" };

/** Text for `kotomark license status`. */
export function formatLicenseStatus(status: LicenseStatus, opts: { preview?: boolean; now?: number } = {}): string {
  const preview = opts.preview ?? PREVIEW;
  const now = opts.now ?? Date.now();
  const lines = ["Kotomark license"];
  const src = status.state !== "none" && status.source ? ` (from ${SOURCE_LABEL[status.source]})` : "";
  if (status.state === "none") lines.push("  key:      not set");
  else lines.push(`  key:      present${src}`);
  if (status.state === "invalid") lines.push(`  status:   invalid license key (${status.reason})`);
  if (status.state === "valid" || status.state === "expired") {
    const p = status.payload;
    const days = Math.round((p.exp * 1000 - now) / 86_400_000);
    lines.push(
      `  status:   ${status.state}`,
      `  licensee: ${p.name} (${p.sub})`,
      `  license:  ${p.lid}`,
      `  plan:     ${p.plan}`,
      `  seats:    ${p.limits.seats}`,
      `  expires:  ${day(p.exp)} (${status.state === "expired" ? `${-days} day(s) ago` : `in ${days} day(s)`})`,
    );
    if (p.features.length) lines.push(`  features: ${p.features.join(", ")}`);
  }
  if (preview) lines.push("  preview:  all features free (no key needed until paid plans launch)");
  else
    lines.push(
      status.state === "valid"
        ? "  tier:     paid — no per-run row limit"
        : `  tier:     free — up to ${FREE_ROWS_PER_RUN.toLocaleString("en-US")} rows per run; all checks included`,
    );
  return lines.join("\n");
}
