/**
 * Trust anchors for Kotomark license keys (docs/licensing.md). Everything here ships in the bundle, so only PUBLIC
 * material belongs here; the private signing key never enters the repository or CI (scripts/license-issue.mjs).
 *
 * - LICENSE_PUBLIC_KEYS: ed25519 public keys by key id (`kid`), each with the period in which it may have signed keys
 *   (`iat` must fall inside it). Rotation: add the new key under its own kid; drop the old one once every key it signed
 *   has expired. Empty until the owner runs `node scripts/license-issue.mjs --init` and pastes the printed entry; while
 *   it is empty every key is reported as "invalid license key" — harmless during the preview, when nothing is gated.
 * - DISABLED_KIDS: signing keys withdrawn early (a leaked private key). Keys they signed stop verifying in this release.
 * - REVOKED_LIDS: individual licenses withdrawn before their expiry (refund, abuse, a leaked key).
 * - BUILD_FLOOR: a date no earlier than this release's source; a clock set before it is treated as rolled back. Bump it
 *   with each release (release:action warns when it is more than 180 days old).
 *
 * There is deliberately no flag, environment variable or file that adds keys or skips verification. Tests inject their
 * own runtime-generated keys through a hook that the production build compiles out (see src/cli/license.ts).
 */
export interface TrustedKey {
  /** SPKI PEM of an ed25519 public key. */
  key: string;
  /** First day (UTC, YYYY-MM-DD) this key may have signed a license. */
  from: string;
  /** Last day (UTC, YYYY-MM-DD) this key may have signed a license; omit while it is the current key. */
  until?: string;
}

export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, TrustedKey>> = {
  // "k-0123456789ab": { key: `-----BEGIN PUBLIC KEY-----
  // MCowBQYDK2VwAyEA...
  // -----END PUBLIC KEY-----`, from: "2026-11-01" },
};

export const DISABLED_KIDS: ReadonlySet<string> = new Set<string>([]);

export const REVOKED_LIDS: ReadonlySet<string> = new Set<string>([]);

/** Unix seconds; 2026-10-09T00:00:00Z. */
export const BUILD_FLOOR = 1_791_504_000;
