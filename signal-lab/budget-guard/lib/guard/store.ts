import { randomBytes } from "node:crypto";
import { getJSON, key, setJSON, type KV } from "../redis";
import type { Connection, Notice } from "./check";
import { encryptSecret, maskSecret } from "./crypto";
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
}

export interface LogEntry extends Notice {
  at: string;
}

const k = {
  accounts: () => key("bg", "accounts"),
  conns: (acct: string) => key("bg", acct, "conns"),
  state: (acct: string, id: string) => key("bg", acct, "state", id),
  snap: (acct: string, id: string) => key("bg", acct, "snap", id),
  log: (acct: string) => key("bg", acct, "log"),
  owner: (id: string) => key("bg", "owner", id),
  settings: (acct: string) => key("bg", acct, "settings"),
  hook: (id: string, event: string) => key("bg", "hook", id, event),
  /** Every connection as `${acct}|${connId}`: the hourly cron's work list (one SMEMBERS). */
  allConns: () => key("bg", "allconns"),
  connLock: (id: string) => key("bg", "lock", id),
};

export const connRef = (acct: string, id: string) => `${acct}|${id}`;
export function parseConnRef(ref: string): { acct: string; id: string } | null {
  const i = ref.lastIndexOf("|");
  return i > 0 ? { acct: ref.slice(0, i), id: ref.slice(i + 1) } : null;
}
export const listConnRefs = (kv: KV) => kv.smembers(k.allConns());

/** Rebuild the connection index from accounts (one-off for data written before the index existed). */
export async function rebuildConnIndex(kv: KV): Promise<number> {
  const refs: string[] = [];
  for (const acct of await listAccounts(kv)) for (const c of await listConnections(kv, acct)) refs.push(connRef(acct, c.id));
  if (refs.length) await kv.sadd(k.allConns(), ...refs);
  return refs.length;
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
  input: { label: string; target: Target; budgetUsd: number; token: string },
  encKey?: Buffer,
): Promise<StoredConnection> {
  const conns = await listConnections(kv, acct);
  if (conns.length >= MAX_CONNECTIONS) throw new Error(`Your plan allows ${MAX_CONNECTIONS} connections`);
  if (conns.some((c) => c.label === input.label)) throw new Error("Label already in use");
  const id = `conn_${randomBytes(8).toString("hex")}`;
  const conn: StoredConnection = {
    id,
    label: input.label,
    target: input.target,
    budgetUsd: input.budgetUsd,
    stopMode: "test", // every connection starts in test mode
    sealedToken: encryptSecret(input.token, id, encKey),
    tokenHint: maskSecret(input.token),
    createdAt: new Date().toISOString(),
  };
  await setJSON(kv, k.conns(acct), [...conns, conn]);
  await kv.set(k.owner(id), acct);
  await kv.sadd(k.accounts(), acct);
  await kv.sadd(k.allConns(), connRef(acct, id));
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
  await kv.del(k.state(acct, id), k.snap(acct, id), k.owner(id));
  await kv.srem(k.allConns(), connRef(acct, id));
}

/** Which account owns a connection (for inbound webhooks, which carry no session). */
export const ownerOf = (kv: KV, id: string) => kv.get(k.owner(id));

export async function getSettings(kv: KV, acct: string): Promise<AccountSettings> {
  return (await getJSON<AccountSettings>(kv, k.settings(acct))) ?? {};
}
export const saveSettings = (kv: KV, acct: string, s: AccountSettings) => setJSON(kv, k.settings(acct), s);

/** True the first time a given webhook event is seen (Vercel retries for up to 24h). */
export const claimHookEvent = (kv: KV, id: string, event: string) => kv.set(k.hook(id, event), "1", { nx: true, ex: 40 * 24 * 3600 });

export const listAccounts = (kv: KV) => kv.smembers(k.accounts());
export const getState = (kv: KV, acct: string, id: string) => getJSON<GuardState>(kv, k.state(acct, id));
export const saveState = (kv: KV, acct: string, id: string, s: GuardState) => setJSON(kv, k.state(acct, id), s);
export const getSnapshot = (kv: KV, acct: string, id: string) => getJSON<Snapshot>(kv, k.snap(acct, id));
export const saveSnapshot = (kv: KV, acct: string, id: string, s: Snapshot) => setJSON(kv, k.snap(acct, id), s);

export async function appendLog(kv: KV, acct: string, entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const log = (await getJSON<LogEntry[]>(kv, k.log(acct))) ?? [];
  await setJSON(kv, k.log(acct), [...entries.reverse(), ...log].slice(0, LOG_SIZE));
}

export async function getLog(kv: KV, acct: string): Promise<LogEntry[]> {
  return (await getJSON<LogEntry[]>(kv, k.log(acct))) ?? [];
}
