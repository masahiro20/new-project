import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LICENSE_PUBLIC_KEYS } from "./license-pubkey.js";

/**
 * Offline license keys (HQ decision d29). Node-only on purpose: src/core stays browser-safe and free of
 * this. No network calls — a key is verified against the ed25519 public keys embedded in the bundle.
 *
 *   KOTOMARK-1.<base64url(JSON payload)>.<base64url(ed25519 signature over "KOTOMARK-1.<payload part>")>
 */

/**
 * Preview switch. While true, every feature works without a key and nothing nags; a key given anyway is
 * still verified so `kotomark license status` can report it. Flip to false ONLY when paid plans launch
 * (owner decision; see docs/licensing.md).
 */
export const PREVIEW = true;

/** Free tier limit once the preview ends: rows (strings) checked in one run. */
export const FREE_ROWS_PER_RUN = 20_000;

export const KEY_PREFIX = "KOTOMARK-1.";
export const LICENSE_ENV = "KOTOMARK_LICENSE_KEY";

export interface LicensePayload {
  v: 1;
  /** Signing key id; selects the embedded public key. */
  kid: string;
  /** License id (for support and records). */
  lic: string;
  org: string;
  plan: "studio";
  seats: number;
  /** Issued at / expires at, Unix seconds. */
  iat: number;
  exp: number;
  features: string[];
}

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

const B64URL = /^[A-Za-z0-9_-]+$/;

function validPayload(p: unknown): p is LicensePayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.kid === "string" &&
    typeof o.lic === "string" &&
    typeof o.org === "string" &&
    o.plan === "studio" &&
    Number.isInteger(o.seats) && (o.seats as number) > 0 &&
    Number.isFinite(o.iat) &&
    Number.isFinite(o.exp) &&
    Array.isArray(o.features) && o.features.every((f) => typeof f === "string")
  );
}

export interface VerifyOptions {
  /** kid → PEM public key. Default: the embedded LICENSE_PUBLIC_KEYS. */
  publicKeys?: Readonly<Record<string, string>>;
  /** Current time in ms (default Date.now()). */
  now?: number;
}

/** Verifies a key offline. Never throws; a malformed or forged key is `invalid`, an old one `expired`. */
export function verifyLicenseKey(key: string | undefined, opts: VerifyOptions = {}): LicenseStatus {
  if (!key?.trim()) return { state: "none" };
  const k = key.trim();
  if (!k.startsWith(KEY_PREFIX)) return { state: "invalid", reason: "unknown format" };
  const parts = k.slice(KEY_PREFIX.length).split(".");
  if (parts.length !== 2 || !parts.every((s) => B64URL.test(s))) return { state: "invalid", reason: "malformed" };
  const [body, sig] = parts as [string, string];
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { state: "invalid", reason: "malformed payload" };
  }
  if (!validPayload(payload)) return { state: "invalid", reason: "malformed payload" };
  const keys = opts.publicKeys ?? LICENSE_PUBLIC_KEYS;
  const pem = Object.hasOwn(keys, payload.kid) ? keys[payload.kid] : undefined;
  if (!pem) return { state: "invalid", reason: "unknown kid" };
  let ok = false;
  try {
    ok = verify(null, Buffer.from(KEY_PREFIX + body, "utf8"), createPublicKey(pem), Buffer.from(sig, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) return { state: "invalid", reason: "bad signature" };
  return { state: payload.exp * 1000 <= (opts.now ?? Date.now()) ? "expired" : "valid", payload };
}

export interface KeySources {
  flag?: string;
  env?: NodeJS.ProcessEnv;
  /** Home directory holding .kotomark/license (default os.homedir()). */
  home?: string;
}

/** Finds the key: --license-key > $KOTOMARK_LICENSE_KEY > ~/.kotomark/license. */
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
export function loadLicense(src: KeySources = {}, opts: VerifyOptions = {}): LicenseStatus {
  const found = resolveLicenseKey(src);
  if (!found) return { state: "none" };
  return { ...verifyLicenseKey(found.key, opts), source: found.source } as LicenseStatus;
}

const day = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

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
      `  license:  ${p.lic}`,
      `  org:      ${p.org}`,
      `  plan:     ${p.plan}`,
      `  seats:    ${p.seats}`,
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
