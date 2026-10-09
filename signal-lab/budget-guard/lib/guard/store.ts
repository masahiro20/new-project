import { randomBytes } from "node:crypto";
import type { ConsentRecord } from "../consent";
import { getJSON, key, setJSON, type KV } from "../redis";
import type { Connection, Notice } from "./check";
import { encryptSecret, maskSecret } from "./crypto";
import { isDemoToken } from "./demo";
import type { GuardState } from "./evaluate";
import type { Target } from "./providers";
import type { StopMode } from "./stop";

// Per-account data lives under `budget-guard:bg:{entitlementId}:…`. Tokens are only
// ever written sealed; `tokenHint` is the masked form shown in the UI.

export const MAX_CONNECTIONS = 3;
const LOG_SIZE = 50;

export interface StoredConnection extends Connection {
  tokenHint: string;
  createdAt: string;
  /** Vercel only: Spend Management webhook secret, sealed with AAD `${id}:webhook`. */
  sealedWebhookSecret?: string;
  /** Consent given when this connection was added (stored with the connection: no extra write). */
  consent?: ConsentRecord;
  /** Added with the offline "demo" token: indexed in `bg:democonns`, not in the real work list (R3-02). */
  demo?: true;
}

export interface AccountSettings {
  /** Slack incoming webhook URL (it is a secret), sealed with AAD `${acct}:slack`. */
  sealedSlackUrl?: string;
  slackHint?: string;
}

export interface Snapshot {
  spendUsd: number;
  ratio: number;
  level: "ok" | "warn" | "limit";
  checkedAt: string;
  error?: string;
  /** Check interval (hours) when the cron took this snapshot — shown on the dashboard. */
  intervalHours?: number;
  /** When the cron will check next (ISO). */
  nextCheckAt?: string;
}

export interface LogEntry extends Notice {
  at: string;
}

const k = {
  accounts: () => key("bg", "accounts"),
  conns: (acct: string) => key("bg", acct, "conns"),
  state: (acct: string, id: string) => key("bg", acct, "state", id),
  /** Activity log + latest snapshot of every connection, in ONE key per account: the dashboard reads it with one command. */
  activity: (acct: string) => key("bg", acct, "activity"),
  owner: (id: string) => key("bg", "owner", id),
  settings: (acct: string) => key("bg", acct, "settings"),
  hook: (id: string, event: string) => key("bg", "hook", id, event),
  /** Every connection as `${acct}|${connId}`: the hourly cron's work list (one SMEMBERS). */
  allConns: () => key("bg", "allconns"),
  /**
   * Connections that use the offline "demo" token (R3-02). Kept out of allconns so visitors of a
   * demo deployment can't stretch everyone's check interval; the cron checks a few per hour.
   */
  demoConns: () => key("bg", "democonns"),
  connLock: (id: string) => key("bg", "lock", id),
};

/** Raw keys, for batched reads/writes (MGET / MSET: one Upstash command for several keys). */
export const storeKeys = {
  conns: k.conns,
  state: k.state,
  activity: k.activity,
  settings: k.settings,
  connLock: k.connLock,
};

export interface Activity {
  log: LogEntry[];
  snaps: Record<string, Snapshot>;
}
export function parseActivity(raw: string | null | undefined): Activity {
  const a = raw ? (JSON.parse(raw) as Partial<Activity>) : {};
  return { log: a.log ?? [], snaps: a.snaps ?? {} };
}
export const getActivity = async (kv: KV, acct: string) => parseActivity(await kv.get(k.activity(acct)));
const saveActivity = (kv: KV, acct: string, a: Activity) => setJSON(kv, k.activity(acct), a);

/** Newest first, capped — same order appendLog writes. */
export function mergeLog(log: LogEntry[], entries: LogEntry[]): LogEntry[] {
  return [...[...entries].reverse(), ...log].slice(0, LOG_SIZE);
}

export const connRef = (acct: string, id: string) => `${acct}|${id}`;
export function parseConnRef(ref: string): { acct: string; id: string } | null {
  const i = ref.lastIndexOf("|");
  return i > 0 ? { acct: ref.slice(0, i), id: ref.slice(i + 1) } : null;
}
/** Real connections (the cron's work list; their count sets the check interval). */
export const listConnRefs = (kv: KV) => kv.smembers(k.allConns());
/** Connections with the offline demo token (R3-02). */
export const listDemoConnRefs = (kv: KV) => kv.smembers(k.demoConns());
const indexOf = (demo: boolean | undefined) => (demo ? k.demoConns() : k.allConns());

/** Cron: a connection found to use the demo token in the real index (data from before R3-02) moves to the demo index. */
export async function moveToDemoIndex(kv: KV, ref: string): Promise<void> {
  await kv.srem(k.allConns(), ref);
  await kv.sadd(k.demoConns(), ref);
}
/** Cron: drop a ref whose connection is gone or whose account is no longer monitored (re-added by reindexAccount). */
export const dropFromIndex = (kv: KV, ref: string, demo: boolean) => kv.srem(indexOf(demo), ref);

/** Put an account's connections back into the cron's index (its subscription became active again). */
export async function reindexAccount(kv: KV, acct: string): Promise<number> {
  const conns = await listConnections(kv, acct);
  const real = conns.filter((c) => !c.demo).map((c) => connRef(acct, c.id));
  const demo = conns.filter((c) => c.demo).map((c) => connRef(acct, c.id));
  if (real.length) await kv.sadd(k.allConns(), ...real);
  if (demo.length) await kv.sadd(k.demoConns(), ...demo);
  return conns.length;
}

/** Rebuild the connection index from accounts (one-off for data written before the index existed). */
export async function rebuildConnIndex(kv: KV): Promise<number> {
  let n = 0;
  for (const acct of await listAccounts(kv)) n += await reindexAccount(kv, acct);
  return n;
}

/**
 * Per-connection mutex around a check (cron, "Check now", Vercel webhook), so two
 * checks of one connection never run at the same time — the stop action and the
 * once-a-month notices are decided from state that the first check is about to write.
 * Expires on its own if the holder dies.
 */
export async function withConnLock<T>(kv: KV, id: string, ttlSeconds: number, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  if (!(await kv.set(k.connLock(id), String(Date.now()), { nx: true, ex: ttlSeconds }))) return { ok: false };
  try {
    return { ok: true, value: await fn() };
  } finally {
    // Plain DEL (one request): the lock can only belong to someone else if ours outlived its TTL.
    await kv.del(k.connLock(id));
  }
}

export async function listConnections(kv: KV, acct: string): Promise<StoredConnection[]> {
  return (await getJSON<StoredConnection[]>(kv, k.conns(acct))) ?? [];
}

export async function addConnection(
  kv: KV,
  acct: string,
  input: { label: string; target: Target; budgetUsd: number; token: string; consent?: ConsentRecord },
  encKey?: Buffer,
): Promise<StoredConnection> {
  const conns = await listConnections(kv, acct);
  if (conns.length >= MAX_CONNECTIONS) throw new Error(`Your plan allows ${MAX_CONNECTIONS} connections`);
  if (conns.some((c) => c.label === input.label)) throw new Error("Label already in use");
  const id = `conn_${randomBytes(8).toString("hex")}`;
  const demo = isDemoToken(input.token);
  const conn: StoredConnection = {
    id,
    label: input.label,
    target: input.target,
    budgetUsd: input.budgetUsd,
    stopMode: "test", // every connection starts in test mode
    sealedToken: encryptSecret(input.token, id, encKey),
    tokenHint: maskSecret(input.token),
    createdAt: new Date().toISOString(),
    ...(input.consent && { consent: input.consent }),
    ...(demo && { demo: true as const }),
  };
  await setJSON(kv, k.conns(acct), [...conns, conn]);
  await kv.set(k.owner(id), acct);
  await kv.sadd(k.accounts(), acct);
  await kv.sadd(indexOf(demo), connRef(acct, id));
  return conn;
}

export async function getConnection(kv: KV, acct: string, id: string): Promise<StoredConnection | undefined> {
  return (await listConnections(kv, acct)).find((c) => c.id === id);
}

export async function updateConnection(
  kv: KV,
  acct: string,
  id: string,
  patch: { stopMode?: StopMode; budgetUsd?: number; sealedWebhookSecret?: string | undefined },
): Promise<void> {
  const conns = await listConnections(kv, acct);
  const i = conns.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Connection not found");
  conns[i] = { ...conns[i], ...patch };
  await setJSON(kv, k.conns(acct), conns);
}

export async function removeConnection(kv: KV, acct: string, id: string): Promise<void> {
  const conns = await listConnections(kv, acct);
  await setJSON(kv, k.conns(acct), conns.filter((c) => c.id !== id));
  await kv.del(k.state(acct, id), k.owner(id));
  // The snapshot and this connection's log entries go with it (R1-09). Webhook dedupe keys
  // (bg:hook:{id}:…) hold no personal data and expire on their own (40 days).
  const activity = await getActivity(kv, acct);
  const log = activity.log.filter((e) => e.connectionId !== id);
  if (activity.snaps[id] || log.length !== activity.log.length) {
    delete activity.snaps[id];
    await saveActivity(kv, acct, { ...activity, log });
  }
  // Both indexes: a connection the cron moved to the demo index carries no `demo` flag.
  await kv.srem(k.allConns(), connRef(acct, id));
  await kv.srem(k.demoConns(), connRef(acct, id));
}

/** Which account owns a connection (for inbound webhooks, which carry no session). */
export const ownerOf = (kv: KV, id: string) => kv.get(k.owner(id));

export async function getSettings(kv: KV, acct: string): Promise<AccountSettings> {
  return (await getJSON<AccountSettings>(kv, k.settings(acct))) ?? {};
}
export const saveSettings = (kv: KV, acct: string, s: AccountSettings) => setJSON(kv, k.settings(acct), s);

/** True the first time a given webhook event is seen (Vercel retries for up to 24h). */
export const claimHookEvent = (kv: KV, id: string, event: string, ttlSeconds = 40 * 24 * 3600) => kv.set(k.hook(id, event), "1", { nx: true, ex: ttlSeconds });

export const listAccounts = (kv: KV) => kv.smembers(k.accounts());
export const getState = (kv: KV, acct: string, id: string) => getJSON<GuardState>(kv, k.state(acct, id));
export const saveState = (kv: KV, acct: string, id: string, s: GuardState) => setJSON(kv, k.state(acct, id), s);

export const getSnapshot = async (kv: KV, acct: string, id: string): Promise<Snapshot | null> => (await getActivity(kv, acct)).snaps[id] ?? null;
export async function saveSnapshot(kv: KV, acct: string, id: string, s: Snapshot): Promise<void> {
  const activity = await getActivity(kv, acct);
  activity.snaps[id] = s;
  await saveActivity(kv, acct, activity);
}

export async function appendLog(kv: KV, acct: string, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const activity = await getActivity(kv, acct);
  activity.log = mergeLog(activity.log, entries);
  await saveActivity(kv, acct, activity);
}

export async function getLog(kv: KV, acct: string): Promise<LogEntry[]> {
  return (await getActivity(kv, acct)).log;
}
