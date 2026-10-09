import type { KV } from "../redis";
import { periodKey } from "./evaluate";
import type { GuardState } from "./evaluate";
import type { ProviderId } from "./providers";
import { listConnRefs, parseActivity, parseConnRef, storeKeys, type StoredConnection } from "./store";

// Trial metrics for GET /api/admin/stats. Reuses the cron's connection index instead of
// scanning keys: SMEMBERS index + MGET (connections + activity per account) + MGET
// (state per connection) = 3 Upstash commands (1 + 2·accounts + connections if every key
// of an MGET counts). Admin calls are rare, so this doesn't move the free-tier estimate.

export type TrialMetrics = {
  month: string;
  accounts: number;
  connections: { total: number; byProvider: Record<ProviderId, number>; demoToken: number };
  stopMode: { off: number; test: number; live: number };
  thisMonth: {
    /** Connections whose 80% alert went out this month. */
    warned: number;
    /** Connections that reached 100% this month (limit alert sent). */
    reachedLimit: number;
    /** "Stop action (test mode) would have run" + manual test runs logged this month (activity log keeps the last 50 entries per account). */
    testStopRecords: number;
    /** Connections whose token was rejected (401/403) and not fixed yet. */
    keyInvalid: number;
  };
  lastCheckedAt: string | null;
  /** The longest-unchecked connection — spots a stalled cron. */
  oldestCheckedAt: string | null;
  neverChecked: number;
};

const CHUNK = 200;
async function mgetAll(kv: KV, keys: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) out.push(...(await kv.mget(...keys.slice(i, i + CHUNK))));
  return out;
}

export async function trialMetrics(kv: KV, now = new Date()): Promise<TrialMetrics> {
  const month = periodKey(now);
  const refs = (await listConnRefs(kv)).map(parseConnRef).filter((r): r is { acct: string; id: string } => !!r);
  const accounts = [...new Set(refs.map((r) => r.acct))];
  const perAccount = await mgetAll(kv, accounts.flatMap((a) => [storeKeys.conns(a), storeKeys.activity(a)]));

  const m: TrialMetrics = {
    month,
    accounts: 0,
    connections: { total: 0, byProvider: { vercel: 0, openai: 0, anthropic: 0 }, demoToken: 0 },
    stopMode: { off: 0, test: 0, live: 0 },
    thisMonth: { warned: 0, reachedLimit: 0, testStopRecords: 0, keyInvalid: 0 },
    lastCheckedAt: null,
    oldestCheckedAt: null,
    neverChecked: 0,
  };
  const live: { acct: string; conn: StoredConnection }[] = [];
  accounts.forEach((acct, i) => {
    const conns = perAccount[2 * i] ? (JSON.parse(perAccount[2 * i]!) as StoredConnection[]) : [];
    const activity = parseActivity(perAccount[2 * i + 1]);
    if (conns.length) m.accounts++;
    for (const conn of conns) {
      live.push({ acct, conn });
      m.connections.total++;
      m.connections.byProvider[conn.target.provider]++;
      if (conn.tokenHint === "••••") m.connections.demoToken++; // maskSecret("demo")
      m.stopMode[conn.stopMode]++;
      const checked = activity.snaps[conn.id]?.checkedAt;
      if (!checked) m.neverChecked++;
      else {
        if (!m.lastCheckedAt || checked > m.lastCheckedAt) m.lastCheckedAt = checked;
        if (!m.oldestCheckedAt || checked < m.oldestCheckedAt) m.oldestCheckedAt = checked;
      }
    }
    // kind "stop-test" also records mode changes and arming; count only actual test runs.
    m.thisMonth.testStopRecords += activity.log.filter(
      (e) => e.kind === "stop-test" && e.at.startsWith(month) && (e.message.startsWith("Manual test:") || e.message.startsWith("TEST MODE")),
    ).length;
  });

  const states = await mgetAll(kv, live.map(({ acct, conn }) => storeKeys.state(acct, conn.id)));
  for (const raw of states) {
    if (!raw) continue;
    const s = JSON.parse(raw) as GuardState;
    if (s.keyInvalidAt) m.thisMonth.keyInvalid++;
    if (s.period !== month) continue;
    if (s.warnedAt) m.thisMonth.warned++;
    if (s.limitNotifiedAt) m.thisMonth.reachedLimit++;
  }
  return m;
}
