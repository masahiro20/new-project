import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { runStartupChecks } from "@/lib/startup-checks";

// instrumentation.ts → lib/startup-checks.ts: the setup errors that should stop the server at start
// (Node / Vercel, and Cloudflare Workers — cf-prelude.ts makes the hook load there).

const good = {
  NODE_ENV: "production",
  PAYMENTS_MODE: "demo",
  ACCESS_SECRET: randomBytes(24).toString("base64"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(32).toString("base64url"),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startup checks", () => {
  it("a complete setup passes quietly (no error log)", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(runStartupChecks(good)).toEqual({ mode: "demo" });
    expect(err).not.toHaveBeenCalled();
  });

  it("PAYMENTS_MODE=stripe without STRIPE_SECRET_KEY fails", () => {
    expect(() => runStartupChecks({ ...good, PAYMENTS_MODE: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("PAYMENTS_MODE must be written out in production (no automatic demo fallback)", () => {
    const { PAYMENTS_MODE: _, ...auto } = good;
    expect(() => runStartupChecks(auto)).toThrow(/PAYMENTS_MODE is not set/);
    expect(() => runStartupChecks({ ...auto, NODE_ENV: "development" })).not.toThrow();
  });

  it("a missing ACCESS_SECRET fails outside development / test", () => {
    const { ACCESS_SECRET: _, ...noSecret } = good;
    expect(() => runStartupChecks(noSecret)).toThrow(/ACCESS_SECRET/);
    expect(() => runStartupChecks({ ...noSecret, NODE_ENV: undefined })).toThrow(/ACCESS_SECRET/);
  });

  it("a missing or malformed TOKEN_ENCRYPTION_KEY fails", () => {
    const { TOKEN_ENCRYPTION_KEY: _, ...noKey } = good;
    expect(() => runStartupChecks(noKey)).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => runStartupChecks({ ...good, TOKEN_ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
    expect(() => runStartupChecks({ ...good, CRON_SECRET: "" })).toThrow(/CRON_SECRET is not set/);
  });

  it("register() runs the checks, and skips them while `next build` prerenders", async () => {
    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(register()).rejects.toThrow(/STRIPE_SECRET_KEY/);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await expect(register()).resolves.toBeUndefined();
  });
});
