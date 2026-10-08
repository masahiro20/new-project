import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Provider tokens are stored only as AES-256-GCM ciphertext. The connection id is
// bound as AAD so a ciphertext copied onto another connection fails to decrypt.
const VERSION = "v1";
const DEV_KEY_SEED = "budget-guard-dev-only-key";

let warned = false;

export function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  if (env.NODE_ENV === "production") throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  if (!warned) {
    warned = true;
    console.warn("[budget-guard] TOKEN_ENCRYPTION_KEY unset: using a fixed dev key. Never use this with real tokens.");
  }
  return createHash("sha256").update(DEV_KEY_SEED).digest();
}

export function encryptSecret(plain: string, aad: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(sealed: string, aad: string, key: Buffer = encryptionKey()): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Malformed sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Show only enough of a token to recognise it, e.g. "sk-a…9f3c". */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}
