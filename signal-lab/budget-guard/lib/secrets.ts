import { createHash } from "node:crypto";

// Every server secret, and the rules a production value must meet (Atlas VERIFY #1, R1-13).
//
// Outside development / test (NODE_ENV), a secret that is empty, too short, low-entropy, a
// placeholder or a published example value is refused — whatever PAYMENTS_MODE says (a public demo
// deployment holds real provider tokens and real cookies too). There is no "allow dummy" switch: for
// a local workerd preview, `npm run cf:dev-vars` writes a .dev.vars with fresh random values.
//
// Enforced in three places:
//   1. at start — instrumentation.ts → lib/startup-checks.ts (Node / Vercel, and Workers), and
//      cf-worker.ts once per isolate before the first request / cron run (if the hook didn't run);
//   2. where each secret is used (accessSecret, encryptionKey, the cron route, admin, Stripe webhook),
//      so a bad value can't be used even if 1 was bypassed.

type Env = Record<string, string | undefined>;

export const DEV_ENVS = new Set(["development", "test"]);
/** Development / test: dev fallbacks and dummy values are fine. Everything else counts as production. */
export const isDevEnv = (env: Env = process.env) => DEV_ENVS.has(env.NODE_ENV ?? "");

/** Minimum length of the free-form secrets (ACCESS_SECRET, CRON_SECRET, ADMIN_TOKEN). `openssl rand -base64 32` gives 44. */
export const MIN_SECRET_LENGTH = 32;

/** Values published in this repository (example files, docs, dev fallbacks) — never valid in production. */
const PUBLISHED = new Set([
  "local-dummy-access-secret-change-me-0123456789",
  "local-dummy-cron-secret",
  "signal-lab-dev-secret-do-not-use-in-production-0000",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
]);
/** sha256 of the published values, to also catch them base64-decoded (keys). */
const PUBLISHED_KEYS = new Set([createHash("sha256").update("budget-guard-dev-only-key").digest("hex")]);
const PLACEHOLDER = /dummy|change[-_ ]?me|replace[-_ ]?me|__generate|example|placeholder|xxxx|not[-_ ]a[-_ ]real|do[-_ ]?not[-_ ]?use|your[-_ ]?(secret|token|key)/i;

/**
 * Runs of consecutive codes (abcdef…, 0123…, bytes 00 01 02…): at least half of the neighbouring
 * pairs step by exactly +1 or −1. A random value has about 1 such pair in 32 (bytes: 1 in 128), so
 * this costs nothing for real secrets and catches hand-typed sequences (Atlas re-check #2).
 */
export function isSequential(codes: ArrayLike<number>): boolean {
  if (codes.length < 8) return false;
  let steps = 0;
  for (let i = 1; i < codes.length; i++) if (Math.abs(codes[i] - codes[i - 1]) === 1) steps++;
  return steps >= (codes.length - 1) / 2;
}

function weakString(value: string, min = MIN_SECRET_LENGTH): string | null {
  if (!value.trim()) return "is empty";
  if (PUBLISHED.has(value)) return "is a published example value";
  if (PLACEHOLDER.test(value)) return "looks like a placeholder";
  if (value.length < min) return `is shorter than ${min} characters`;
  if (new Set(value).size < 10) return "has too few distinct characters";
  if (isSequential([...value].map((c) => c.charCodeAt(0)))) return "is a run of consecutive characters";
  return null;
}

/** A 32-byte base64 key: decodes to 32 bytes, not one repeated byte, not a published key. */
export function keyProblem(raw: string): string | null {
  if (!raw.trim()) return "is empty";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) return "must be 32 bytes, base64-encoded";
  if (PUBLISHED.has(raw) || PUBLISHED_KEYS.has(key.toString("hex"))) return "is a published example value";
  if (new Set(key).size < 8) return "is not random (too few distinct bytes)";
  if (isSequential(key)) return "is not random (a run of consecutive bytes)";
  return null;
}

type Rule = { name: string; required: (env: Env) => boolean; problem: (value: string, env: Env) => string | null; hint: string };

const stripeMode = (env: Env) => (env.PAYMENTS_MODE?.trim().toLowerCase() || (env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "demo")) === "stripe";

/** All server secrets. `required`: must be set in production. Optional ones are checked when set. */
export const SECRET_RULES: readonly Rule[] = [
  { name: "ACCESS_SECRET", required: () => true, problem: (v) => weakString(v), hint: `≥ ${MIN_SECRET_LENGTH} characters (openssl rand -base64 32)` },
  { name: "TOKEN_ENCRYPTION_KEY", required: () => true, problem: (v) => keyProblem(v), hint: "32 random bytes, base64 (openssl rand -base64 32)" },
  {
    name: "TOKEN_ENCRYPTION_KEY_PREVIOUS",
    required: () => false,
    problem: (v, env) => {
      for (const part of v.split(",").map((s) => s.trim()).filter(Boolean)) {
        const p = keyProblem(part);
        if (p) return `has an entry that ${p}`;
        if (part === env.TOKEN_ENCRYPTION_KEY) return "repeats the current key";
      }
      return null;
    },
    hint: "comma-separated 32-byte base64 keys",
  },
  { name: "CRON_SECRET", required: () => true, problem: (v) => weakString(v), hint: `≥ ${MIN_SECRET_LENGTH} characters` },
  { name: "ADMIN_TOKEN", required: () => false, problem: (v) => weakString(v), hint: `≥ ${MIN_SECRET_LENGTH} characters; unset = /api/admin/stats off` },
  {
    name: "STRIPE_SECRET_KEY",
    required: (env) => stripeMode(env),
    problem: (v) => (/^(sk|rk)_(live|test)_[A-Za-z0-9]{20,}$/.test(v) ? null : "is not a Stripe secret key (sk_live_… / sk_test_… / rk_…)"),
    hint: "from the Stripe dashboard",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: (env) => stripeMode(env),
    problem: (v) => (/^whsec_[A-Za-z0-9+/=_-]{20,}$/.test(v) ? null : "is not a Stripe webhook signing secret (whsec_…)"),
    hint: "from the Stripe webhook endpoint",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: (env) => !!env.UPSTASH_REDIS_REST_URL?.trim(),
    problem: (v) => weakString(v, 20),
    hint: "from the Upstash console (with UPSTASH_REDIS_REST_URL)",
  },
  { name: "RESEND_API_KEY", required: () => false, problem: (v) => (/^re_[A-Za-z0-9_]{10,}$/.test(v) ? null : "is not a Resend API key (re_…)"), hint: "from Resend" },
];

/** Problems with the server secrets (names and reasons only — never values). Empty outside production. */
export function secretProblems(env: Env = process.env): string[] {
  if (isDevEnv(env)) return [];
  const out: string[] = [];
  for (const rule of SECRET_RULES) {
    const value = env[rule.name];
    if (value === undefined || value === "") {
      if (rule.required(env)) out.push(`${rule.name} is not set (${rule.hint})`);
      continue;
    }
    const p = rule.problem(value, env);
    if (p) out.push(`${rule.name} ${p} (${rule.hint})`);
  }
  return out;
}

/** Throws (production) when the named secret is set but fails its rule. Used where the secret is read. */
export function assertSecretUsable(name: string, value: string, env: Env = process.env): void {
  if (isDevEnv(env)) return;
  const rule = SECRET_RULES.find((r) => r.name === name);
  const p = rule?.problem(value, env);
  if (p) throw new Error(`${name} ${p} (${rule!.hint})`);
}

/**
 * The secret's value if it may be used, else null (unset, or failing its rule in production).
 * For bearer-token checks (cron route, admin): null means "deny".
 */
export function usableSecret(name: string, env: Env = process.env): string | null {
  const value = env[name];
  if (!value) return null;
  try {
    assertSecretUsable(name, value, env);
    return value;
  } catch (err) {
    console.error(`[secrets] ${err instanceof Error ? err.message : err} — refusing to use it`);
    return null;
  }
}
