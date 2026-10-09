/**
 * Embedded ed25519 PUBLIC keys that verify Kotomark license keys, by key id (`kid` in the key payload).
 *
 * - Only public keys belong here. The private signing key never enters the repository or CI
 *   (see docs/licensing.md and scripts/license-issue.mjs).
 * - Rotation: add the new key under its own kid and keep the old one until every key signed with it has
 *   expired; then remove it.
 * - Empty until the owner runs `node scripts/license-issue.mjs --init` and pastes the printed entry.
 *   While it is empty every key is reported as "invalid license key (unknown kid)" — harmless during the
 *   preview, when nothing is gated. Tests inject their own runtime-generated key pair instead.
 */
export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = {
  // "k-0123456789ab": `-----BEGIN PUBLIC KEY-----
  // MCowBQYDK2VwAyEA...
  // -----END PUBLIC KEY-----`,
};
