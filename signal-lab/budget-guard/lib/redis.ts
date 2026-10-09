import { Redis } from "@upstash/redis";
import { config } from "./config";
import { isExplicitDemo } from "./payments/mode";
import { isBuildPhase, isProduction, warnOnce } from "./site";

/**
 * The small key-value surface the template (and products) use. Upstash in
 * production; an in-memory store with the same semantics when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset. Values are strings
 * (use getJSON/setJSON for objects). TTLs are in seconds.
 */
export interface KV {
  get(key: string): Promise<string | null>;
  /** One command for several string keys (Upstash bills per command, not per key). */
  mget(...keys: string[]): Promise<(string | null)[]>;
  /** One command for several string keys, no TTL. */
  mset(entries: Record<string, string>): Promise<void>;
  /** Returns true if the value was written (false when `nx` and the key exists). */
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  /** Atomically read and delete (single-use tokens). */
  getdel(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  hset(key: string, fields: Record<string, string>): Promise<number>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
}

/** Namespaced key: one Upstash DB is shared across launches via `{slug}:` prefixes. */
export const key = (...parts: string[]) => [config.slug, ...parts].join(":");

export async function getJSON<T>(kv: KV, k: string): Promise<T | null> {
  const v = await kv.get(k);
  return v === null ? null : (JSON.parse(v) as T);
}

export function setJSON(kv: KV, k: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<boolean> {
  return kv.set(k, JSON.stringify(value), opts);
}

// ---------- in-memory fallback ----------

type Entry = { value: string | Map<string, string> | Set<string>; expiresAt?: number };

export function createMemoryKV(now: () => number = Date.now): KV {
  const data = new Map<string, Entry>();

  const live = (k: string): Entry | undefined => {
    const e = data.get(k);
    if (e?.expiresAt !== undefined && e.expiresAt <= now()) {
      data.delete(k);
      return undefined;
    }
    return e;
  };
  function typed<T extends Entry["value"]>(k: string, check: (v: Entry["value"]) => v is T): T | undefined {
    const e = live(k);
    if (e && !check(e.value)) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e?.value as T | undefined;
  }
  const isStr = (v: Entry["value"]): v is string => typeof v === "string";
  const isHash = (v: Entry["value"]): v is Map<string, string> => v instanceof Map;
  const isSet = (v: Entry["value"]): v is Set<string> => v instanceof Set;
  const hash = (k: string) => {
    let h = typed(k, isHash);
    if (!h) data.set(k, { value: (h = new Map()) });
    return h;
  };
  const set_ = (k: string) => {
    let s = typed(k, isSet);
    if (!s) data.set(k, { value: (s = new Set()) });
    return s;
  };

  return {
    async get(k) {
      return typed(k, isStr) ?? null;
    },
    async mget(...keys) {
      return keys.map((k) => {
        const e = live(k);
        return e && typeof e.value === "string" ? e.value : null; // Redis MGET: nil for non-strings
      });
    },
    async mset(entries) {
      for (const [k, v] of Object.entries(entries)) data.set(k, { value: v });
    },
    async set(k, value, opts = {}) {
      if (opts.nx && live(k)) return false;
      data.set(k, { value, expiresAt: opts.ex ? now() + opts.ex * 1000 : undefined });
      return true;
    },
    async getdel(k) {
      const v = typed(k, isStr) ?? null;
      data.delete(k);
      return v;
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) if (live(k) && data.delete(k)) n++;
      return n;
    },
    async incr(k) {
      const e = live(k);
      const current = e ? typed(k, isStr)! : "0";
      if (!/^-?\d+$/.test(current)) throw new Error("ERR value is not an integer or out of range");
      const next = Number(current) + 1;
      data.set(k, { value: String(next), expiresAt: e?.expiresAt }); // INCR keeps the TTL
      return next;
    },
    async expire(k, seconds) {
      const e = live(k);
      if (!e) return false;
      e.expiresAt = now() + seconds * 1000;
      return true;
    },
    async hset(k, fields) {
      const h = hash(k);
      let added = 0;
      for (const [f, v] of Object.entries(fields)) {
        if (!h.has(f)) added++;
        h.set(f, v);
      }
      return added;
    },
    async hincrby(k, field, by) {
      const h = hash(k);
      const next = Number(h.get(field) ?? 0) + by;
      h.set(field, String(next));
      return next;
    },
    async hgetall(k) {
      return Object.fromEntries(typed(k, isHash) ?? []);
    },
    async sadd(k, ...members) {
      const s = set_(k);
      let added = 0;
      for (const m of members) if (!s.has(m) && s.add(m)) added++;
      return added;
    },
    async srem(k, ...members) {
      const s = typed(k, isSet);
      if (!s) return 0;
      let removed = 0;
      for (const m of members) if (s.delete(m)) removed++;
      if (s.size === 0) data.delete(k);
      return removed;
    },
    async smembers(k) {
      return [...(typed(k, isSet) ?? [])];
    },
    async scard(k) {
      return typed(k, isSet)?.size ?? 0;
    },
  };
}

// ---------- Upstash adapter ----------

function createUpstashKV(url: string, token: string): KV {
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    get: (k) => r.get<string>(k),
    mget: (...keys) => (keys.length ? r.mget<(string | null)[]>(...keys) : Promise.resolve([])),
    async mset(entries) {
      if (Object.keys(entries).length) await r.mset(entries);
    },
    async set(k, value, opts = {}) {
      const res = opts.nx
        ? opts.ex
          ? await r.set(k, value, { nx: true, ex: opts.ex })
          : await r.set(k, value, { nx: true })
        : opts.ex
          ? await r.set(k, value, { ex: opts.ex })
          : await r.set(k, value);
      return res === "OK";
    },
    getdel: (k) => r.getdel<string>(k),
    del: (...keys) => (keys.length ? r.del(...keys) : Promise.resolve(0)),
    incr: (k) => r.incr(k),
    expire: async (k, s) => (await r.expire(k, s)) === 1,
    hset: (k, fields) => r.hset(k, fields),
    hincrby: (k, f, by) => r.hincrby(k, f, by),
    hgetall: async (k) => (await r.hgetall<Record<string, string>>(k)) ?? {},
    sadd: (k, ...members) => (members.length ? r.sadd(k, members[0], ...members.slice(1)) : Promise.resolve(0)),
    srem: (k, ...members) => (members.length ? r.srem(k, ...members) : Promise.resolve(0)),
    smembers: (k) => r.smembers(k),
    scard: (k) => r.scard(k),
  };
}

// Survive dev HMR reloads so the in-memory store isn't wiped on every edit.
const globalForKV = globalThis as unknown as { __slabKV?: KV };

export function getKV(): KV {
  if (globalForKV.__slabKV) return globalForKV.__slabKV;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    globalForKV.__slabKV = createUpstashKV(url, token);
  } else {
    // Explicit PAYMENTS_MODE=demo may run in production without Upstash (single
    // instance only; data is lost on restart). Never in stripe / auto mode.
    if (isProduction() && !isBuildPhase() && !isExplicitDemo()) {
      throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN must be set in production (or PAYMENTS_MODE=demo for a throwaway demo)");
    }
    warnOnce("kv", "[kv] Upstash is not configured — using an in-memory store (data is lost on restart; not shared between instances).");
    globalForKV.__slabKV = createMemoryKV();
  }
  return globalForKV.__slabKV;
}
