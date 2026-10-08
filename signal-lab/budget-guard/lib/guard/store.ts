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
};

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
  await kv.sadd(k.accounts(), acct);
  return conn;
}

export async function getConnection(kv: KV, acct: string, id: string): Promise<StoredConnection | undefined> {
  return (await listConnections(kv, acct)).find((c) => c.id === id);
}

export async function updateConnection(kv: KV, acct: string, id: string, patch: { stopMode?: StopMode; budgetUsd?: number }): Promise<void> {
  const conns = await listConnections(kv, acct);
  const i = conns.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Connection not found");
  conns[i] = { ...conns[i], ...patch };
  await setJSON(kv, k.conns(acct), conns);
}

export async function removeConnection(kv: KV, acct: string, id: string): Promise<void> {
  const conns = await listConnections(kv, acct);
  await setJSON(kv, k.conns(acct), conns.filter((c) => c.id !== id));
  await kv.del(k.state(acct, id), k.snap(acct, id));
}

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
