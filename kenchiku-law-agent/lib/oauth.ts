// Minimal OAuth 2.1 authorization server for the MCP endpoint, so claude.ai /
// Claude Desktop custom connectors can connect with just the URL: they discover
// this server, register themselves (dynamic client registration), open the
// sign-in page where the user types the shared access key once, and then use a
// bearer token.
//
// Stateless: codes and tokens are HMAC-signed payloads whose key is derived from
// ACCESS_PASSWORD, so changing the password revokes every token.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CODE_TTL = 5 * 60;
const ACCESS_TTL = 30 * 24 * 60 * 60;
const REFRESH_TTL = 180 * 24 * 60 * 60;

type Claims = { t: "code" | "at" | "rt"; exp: number; cid?: string; ru?: string; cc?: string };

function secret(): Buffer | null {
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) return null;
  return createHmac("sha256", pw).update("kenchiku-law-agent/oauth/v1").digest();
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(claims: Claims): string {
  const key = secret();
  if (!key) throw new Error("ACCESS_PASSWORD is not set");
  const body = b64url(JSON.stringify(claims));
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify(token: string, type: Claims["t"]): Claims | null {
  const key = secret();
  if (!key) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    if (claims.t !== type || typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

export const now = () => Math.floor(Date.now() / 1000);

export function newCode(clientId: string, redirectUri: string, codeChallenge: string): string {
  return sign({ t: "code", exp: now() + CODE_TTL, cid: clientId, ru: redirectUri, cc: codeChallenge });
}

export function issueTokens(clientId: string) {
  return {
    access_token: sign({ t: "at", exp: now() + ACCESS_TTL, cid: clientId }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: sign({ t: "rt", exp: now() + REFRESH_TTL, cid: clientId }),
    scope: "mcp",
  };
}

export function pkceOk(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Redirect targets we hand codes to: Claude's web callback and local callbacks (Claude Code / Desktop). */
export function redirectAllowed(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:" && (u.hostname === "claude.ai" || u.hostname === "claude.com" || u.hostname.endsWith(".claude.ai") || u.hostname.endsWith(".claude.com") || u.hostname.endsWith(".anthropic.com")))
      return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

export const newClientId = () => `kla_${randomBytes(12).toString("hex")}`;

export function origin(request: Request): string {
  return new URL(request.url).origin;
}

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "建築法令エージェント",
  };
}
