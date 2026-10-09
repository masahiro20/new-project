import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { accessSecret, consumeMagicLink, MAGIC_LINK_TTL_SECONDS, requestMagicLink, signAccessToken, verifyAccessToken } from "@/lib/access";
import { upsertEntitlement } from "@/lib/entitlements";
import type { Mail } from "@/lib/mail";
import { createMemoryKV } from "@/lib/redis";

const secret = new TextEncoder().encode("x".repeat(32));
afterEach(() => vi.useRealTimers());

describe("access token", () => {
  it("round-trips claims", async () => {
    const token = await signAccessToken({ sub: "cs_test_1", plan: "lifetime" }, secret, 30);
    // iat is returned too (server-side sign-out compares it with sessionsValidAfter).
    expect(await verifyAccessToken(token, secret)).toEqual({ sub: "cs_test_1", plan: "lifetime", iat: expect.any(Number) });
  });

  it("rejects wrong secret, tampering, missing token and other algorithms", async () => {
    const token = await signAccessToken({ sub: "a", plan: "p" }, secret, 30);
    expect(await verifyAccessToken(token, new TextEncoder().encode("y".repeat(32)))).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "b", plan: "p", aud: "signal-demo" })).toString("base64url");
    expect(await verifyAccessToken(`${h}.${forged}.${s}`, secret)).toBeNull();
    expect(await verifyAccessToken(undefined, secret)).toBeNull();
    expect(await verifyAccessToken("garbage", secret)).toBeNull();
  });

  it("rejects tokens for another product (audience)", async () => {
    const other = await new SignJWT({ plan: "p" }).setProtectedHeader({ alg: "HS256" }).setSubject("a").setAudience("other-product").setExpirationTime("1d").sign(secret);
    expect(await verifyAccessToken(other, secret)).toBeNull();
  });

  it("expires after sessionDays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await signAccessToken({ sub: "a", plan: "p" }, secret, 30);
    vi.setSystemTime(new Date("2026-01-30T23:00:00Z"));
    expect(await verifyAccessToken(token, secret)).not.toBeNull();
    vi.setSystemTime(new Date("2026-01-31T01:00:00Z"));
    expect(await verifyAccessToken(token, secret)).toBeNull();
  });

  it("requires ACCESS_SECRET in production, falls back in dev", () => {
    expect(() => accessSecret({ NODE_ENV: "production" })).toThrow("ACCESS_SECRET");
    expect(() => accessSecret({ ACCESS_SECRET: "short" })).toThrow("32");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(accessSecret({ NODE_ENV: "development" }).length).toBeGreaterThan(32);
    const strong = "Q3x9Lm2Vb7Np4Rt8Kw1Yz6Hc5Jd0FgSa"; // production rules: ≥ 32 chars, varied, no placeholder (lib/secrets.ts)
    expect(new TextDecoder().decode(accessSecret({ ACCESS_SECRET: strong }))).toBe(strong);
    expect(() => accessSecret({ ACCESS_SECRET: "z".repeat(40) })).toThrow(/distinct/);
  });
});

describe("magic links", () => {
  async function setup() {
    let now = Date.now();
    const kv = createMemoryKV(() => now);
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_magic", email: "Buyer@Example.com", plan: "lifetime", source: "stripe" });
    const sent: Mail[] = [];
    const send = async (m: Mail) => void sent.push(m);
    return { kv, entitlement, sent, send, advance: (s: number) => (now += s * 1000) };
  }

  it("sends nothing for unknown emails", async () => {
    const { kv, sent, send } = await setup();
    expect(await requestMagicLink(kv, "nobody@example.com", send)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("is single-use", async () => {
    const { kv, entitlement, sent, send } = await setup();
    const token = await requestMagicLink(kv, "buyer@example.com", send);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].text).toContain(`/access?token=${token}`);
    expect(await consumeMagicLink(kv, token!)).toBe(entitlement.id);
    expect(await consumeMagicLink(kv, token!)).toBeNull();
  });

  it("expires after 15 minutes", async () => {
    const { kv, send, advance } = await setup();
    const token = (await requestMagicLink(kv, "buyer@example.com", send))!;
    advance(MAGIC_LINK_TTL_SECONDS);
    expect(await consumeMagicLink(kv, token)).toBeNull();
  });

  it("rejects malformed tokens without touching KV", async () => {
    const { kv } = await setup();
    expect(await consumeMagicLink(kv, "short")).toBeNull();
  });
});
