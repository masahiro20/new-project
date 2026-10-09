import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envVar } from "./env.js";
import { UserFacingError } from "../core/errors.js";
import { utcDay, type DailyRows, type UsageFile } from "./usage.js";

/**
 * Per-user API tokens and usage limits. Works with no external service: tokens live in a local JSON
 * file (only SHA-256 hashes are stored); the per-minute counters live in memory and the daily row counts in memory
 * plus a file in the data directory (usage.ts). For more than one server instance, swap the limiter for a shared
 * store (e.g. Redis) behind the same interface.
 */

export type Plan = "solo" | "studio" | "dev";

export interface PlanLimits {
  /** Requests per minute (token bucket). */
  perMinute: number;
  /** String rows checked per UTC day. */
  rowsPerDay: number;
  /** Hosted glossaries per user. */
  glossaries: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  solo: { perMinute: 30, rowsPerDay: 200_000, glossaries: 10 },
  studio: { perMinute: 120, rowsPerDay: 1_000_000, glossaries: 50 },
  dev: { perMinute: Infinity, rowsPerDay: Infinity, glossaries: Infinity },
};

export interface Principal {
  user: string;
  plan: Plan;
}

export interface TokenRecord {
  user: string;
  plan: Plan;
  label?: string;
  hash: string;
  /** First characters of the token, safe to show for identification. */
  prefix: string;
  createdAt: string;
  revokedAt?: string;
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * User id of a KOTOMARK_API_TOKENS token (B-06): derived from the token itself, so reordering, adding or removing
 * tokens never hands one token's glossaries and quota to another, and it cannot collide with tokens.json users
 * (the env- prefix is reserved). A separate, domain-separated hash: the id says nothing about the stored token hash.
 * Ids of the old scheme (env-<position>) are migrated on startup (src/server/migrate.ts).
 */
export const envUserId = (token: string) => `env-${createHash("sha256").update(`kotomark-env-user-v1\0${token}`).digest("hex").slice(0, 16)}`;
/** The pre-B-06 id of the token at `index` in KOTOMARK_API_TOKENS. */
export const legacyEnvUserId = (index: number) => `env-${index + 1}`;

export class TokenStore {
  private records: TokenRecord[] = [];
  private byHash = new Map<string, TokenRecord>();
  private mtime = 0;

  constructor(private file?: string, private envTokens: string[] = []) {
    this.reload();
  }

  /** True when no token source is configured at all (local development). */
  get open(): boolean {
    this.reload();
    return !this.envTokens.length && !this.records.length;
  }

  private reload() {
    if (this.file && existsSync(this.file)) {
      const m = statSync(this.file).mtimeMs;
      if (m !== this.mtime) {
        this.records = JSON.parse(readFileSync(this.file, "utf8")) as TokenRecord[];
        this.mtime = m;
      }
    }
    this.byHash = new Map(this.records.filter((r) => !r.revokedAt).map((r) => [r.hash, r]));
    for (const t of this.envTokens) this.byHash.set(hashToken(t), { user: envUserId(t), plan: "studio", hash: hashToken(t), prefix: "", createdAt: "" });
  }

  /** Resolve a bearer token to a principal. Picks up tokens added by the CLI without a restart. */
  verify(token: string): Principal | undefined {
    this.reload();
    const r = this.byHash.get(hashToken(token));
    return r ? { user: r.user, plan: r.plan } : undefined;
  }

  /** Create a token. The plain token is returned once and never stored. */
  create(user: string, plan: Plan, label?: string): { token: string; record: TokenRecord } {
    if (!this.file) throw new Error("No token file configured");
    if (!/^[\w.@+-]{1,64}$/.test(user)) throw new Error("User id must be 1–64 chars of letters, digits, . @ + - _");
    // env-… belongs to KOTOMARK_API_TOKENS and dev to open mode: sharing the id would share glossaries and quotas.
    if (/^(env-.*|dev)$/i.test(user)) throw new Error(`User id "${user}" is reserved`);
    this.reload();
    const token = `yrg_${randomBytes(32).toString("base64url")}`;
    const record: TokenRecord = { user, plan, label, hash: hashToken(token), prefix: token.slice(0, 10), createdAt: new Date().toISOString() };
    this.records.push(record);
    this.save();
    return { token, record };
  }

  /** Revoke by user id (all their tokens) or by token prefix. Returns how many were revoked. */
  revoke(userOrPrefix: string): number {
    this.reload();
    let n = 0;
    for (const r of this.records) {
      if (!r.revokedAt && (r.user === userOrPrefix || (userOrPrefix.length >= 8 && r.prefix.startsWith(userOrPrefix)))) {
        r.revokedAt = new Date().toISOString();
        n++;
      }
    }
    if (n) this.save();
    return n;
  }

  list(): Omit<TokenRecord, "hash">[] {
    this.reload();
    return this.records.map(({ hash: _hash, ...r }) => r);
  }

  private save() {
    mkdirSync(dirname(this.file!), { recursive: true, mode: 0o700 });
    writeFileSync(this.file!, JSON.stringify(this.records, null, 2), { mode: 0o600 });
    this.mtime = statSync(this.file!).mtimeMs;
    this.reload();
  }
}

export const envTokensFromEnv = (env = process.env) => (envVar("API_TOKENS", env) ?? "").split(",").map((t) => t.trim()).filter(Boolean);

export function tokenStoreFromEnv(env = process.env): TokenStore {
  const file = envVar("TOKENS_FILE", env) ?? join(envVar("DATA_DIR", env) ?? ".kotomark-data", "tokens.json");
  return new TokenStore(file, envTokensFromEnv(env));
}

export class QuotaError extends UserFacingError {
  constructor(message: string, readonly retryAfterSec: number) {
    super(message);
  }
}

/**
 * Limiter: a token bucket for request rate (in memory) and a daily row counter per user (in memory, and on disk when
 * a UsageFile is given, so a restart or Fly.io's auto-stop does not reset the daily quota).
 */
export class Limiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private rows: Map<string, DailyRows>;

  constructor(private now: () => number = Date.now, private persist?: UsageFile) {
    this.rows = persist?.load() ?? new Map();
  }

  /** Write pending usage to disk now (shutdown). */
  flush(): void {
    this.persist?.flushPending();
  }

  /** Move a user's daily usage to a new id (data migration, B-06). Same-day counts are added. */
  renameUser(from: string, to: string): boolean {
    const u = this.rows.get(from);
    if (!u) return false;
    const day = utcDay(this.now());
    const t = this.rows.get(to);
    this.rows.set(to, { day, used: (u.day === day ? u.used : 0) + (t && t.day === day ? t.used : 0) });
    this.rows.delete(from);
    this.persist?.schedule(() => this.rows);
    return true;
  }

  /** Take one request from the user's bucket or throw QuotaError. */
  hit(p: Principal) {
    const limit = PLANS[p.plan].perMinute;
    if (!Number.isFinite(limit)) return;
    const t = this.now();
    const b = this.buckets.get(p.user) ?? { tokens: limit, at: t };
    b.tokens = Math.min(limit, b.tokens + ((t - b.at) / 60_000) * limit);
    b.at = t;
    if (b.tokens < 1) {
      this.buckets.set(p.user, b);
      throw new QuotaError(`Rate limit: ${limit} requests per minute on the ${p.plan} plan`, Math.ceil(((1 - b.tokens) / limit) * 60));
    }
    b.tokens -= 1;
    this.buckets.set(p.user, b);
  }

  /** Count rows against the daily quota, or throw QuotaError without counting. */
  consumeRows(p: Principal, n: number) {
    const limit = PLANS[p.plan].rowsPerDay;
    if (!Number.isFinite(limit)) return;
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const u = this.rows.get(p.user);
    const used = u && u.day === day ? u.used : 0;
    if (used + n > limit) {
      const midnight = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
      throw new QuotaError(`Daily quota: ${used + n} rows would exceed ${limit} on the ${p.plan} plan (resets 00:00 UTC)`, Math.ceil((midnight - this.now()) / 1000));
    }
    this.rows.set(p.user, { day, used: used + n });
    this.persist?.schedule(() => this.rows);
  }

  usage(p: Principal) {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const u = this.rows.get(p.user);
    const limits = PLANS[p.plan];
    return {
      plan: p.plan,
      rowsToday: u && u.day === day ? u.used : 0,
      rowsPerDay: Number.isFinite(limits.rowsPerDay) ? limits.rowsPerDay : null,
      requestsPerMinute: Number.isFinite(limits.perMinute) ? limits.perMinute : null,
      glossaries: Number.isFinite(limits.glossaries) ? limits.glossaries : null,
    };
  }
}
