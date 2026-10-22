// Sealed links: a payload encrypted (AES-256-GCM) with a key derived from
// ACCESS_PASSWORD, so a link handed out by the MCP tools can download a file
// without the access key, and the customer details in it stay unreadable in
// logs and chat history. Links expire; changing the password revokes them all.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function key(): Buffer | null {
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) return null;
  return createHmac("sha256", pw).update("kenchiku-law-agent/sealed/v1").digest();
}

export function seal(payload: unknown, ttlSeconds = 14 * 24 * 60 * 60): string {
  const k = key();
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds, payload }));
  if (!k) return `p.${body.toString("base64url")}`; // no password configured: local development only
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(body), c.final()]);
  return `s.${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url")}`;
}

export function unseal<T = unknown>(token: string): T | null {
  try {
    const [kind, data] = token.split(".");
    const k = key();
    let body: Buffer;
    if (kind === "s" && k) {
      const raw = Buffer.from(data, "base64url");
      const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      body = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
    } else if (kind === "p" && !k) {
      body = Buffer.from(data, "base64url");
    } else return null;
    const { exp, payload } = JSON.parse(body.toString("utf8")) as { exp: number; payload: T };
    return exp >= Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
