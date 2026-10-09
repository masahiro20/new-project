import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { assertSecretUsable, isDevEnv } from "../secrets";

// Provider tokens are stored only as AES-256-GCM ciphertext. The connection id is
// bound as AAD so a ciphertext copied onto another connection fails to decrypt.
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEV_KEY_SEED = "budget-guard-dev-only-key";

let warned = false;

export function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    assertSecretUsable("TOKEN_ENCRYPTION_KEY", raw, env); // production: no published / non-random key (R1-13)
    return key;
  }
  // Fail closed: the public dev key is used only when NODE_ENV says development / test,
  // never when NODE_ENV is unset or anything else (e.g. a Worker bundle without NODE_ENV).
  if (!isDevEnv(env)) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  if (!warned) {
    warned = true;
    console.warn("[budget-guard] TOKEN_ENCRYPTION_KEY unset: using a fixed dev key. Never use this with real tokens.");
  }
  return createHash("sha256").update(DEV_KEY_SEED).digest();
}

export function encryptSecret(plain: string, aad: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/**
 * Keys that may still open older ciphertexts during a rotation, from
 * TOKEN_ENCRYPTION_KEY_PREVIOUS (comma-separated, each 32 bytes base64). New data is
 * always sealed with TOKEN_ENCRYPTION_KEY; re-seal and then drop the old key.
 */
export function previousKeys(env: NodeJS.ProcessEnv = process.env): Buffer[] {
  if (env.TOKEN_ENCRYPTION_KEY_PREVIOUS) assertSecretUsable("TOKEN_ENCRYPTION_KEY_PREVIOUS", env.TOKEN_ENCRYPTION_KEY_PREVIOUS, env);
  return (env.TOKEN_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const k = Buffer.from(s, "base64");
      if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY_PREVIOUS entries must be 32 bytes, base64-encoded");
      return k;
    });
}

/** With an explicit key: that key only. Otherwise the current key, then each previous key. */
export function decryptSecret(sealed: string, aad: string, key?: Buffer): string {
  if (key) return decryptWith(sealed, aad, key);
  const keys = [encryptionKey(), ...previousKeys()];
  for (let i = 0; i < keys.length; i++) {
    try {
      return decryptWith(sealed, aad, keys[i]);
    } catch (err) {
      if (i === keys.length - 1) throw err;
    }
  }
  throw new Error("unreachable");
}

function decryptWith(sealed: string, aad: string, key: Buffer): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Malformed sealed secret");
  const ivBuf = Buffer.from(iv, "base64url");
  const tagBuf = Buffer.from(tag, "base64url");
  // Refuse truncated tags / odd IVs: without authTagLength, GCM accepts tags as short as 4 bytes.
  if (ivBuf.length !== IV_BYTES || tagBuf.length !== TAG_BYTES) throw new Error("Malformed sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key, ivBuf, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tagBuf);
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Public, non-secret prefixes of provider keys (longest first). */
const KEY_PREFIXES = ["sk-ant-admin01-", "sk-ant-admin", "sk-ant-", "sk-admin-", "sk-proj-", "sk-"];

/**
 * Show only enough of a token to recognise it (R1-07): its public prefix and the last 4
 * characters, e.g. "sk-admin-…9f3c" — no secret characters from the start. Short tokens: "••••".
 */
export function maskSecret(plain: string): string {
  if (plain.length < 16) return "••••";
  const prefix = KEY_PREFIXES.find((p) => plain.startsWith(p)) ?? "";
  return `${prefix}…${plain.slice(-4)}`;
}
