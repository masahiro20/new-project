import { getPlan } from "../config";
import type { Account } from "../api";
import type { KV } from "../redis";
import { siteUrl } from "../site";
import { challengeSecret, planFor } from "./service";
import { issueChallenge, type StopPlan } from "./stop";
import { getLog, getSettings, getSnapshot, listConnections, MAX_CONNECTIONS, type LogEntry, type Snapshot, type StoredConnection } from "./store";
import type { ProviderId } from "./providers";
import type { StopMode } from "./stop";

// JSON shapes returned by /api/app/* to the client-rendered dashboard. Never include
// sealed tokens / secrets: only the masked hint and booleans.

export type Me = { email: string; planLabel: string; status: string; demo: boolean; billing: boolean };

export type ConnView = {
  id: string;
  label: string;
  provider: ProviderId;
  tokenHint: string;
  budgetUsd: number;
  stopMode: StopMode;
  snapshot: Snapshot | null;
};

export type DashboardView = { me: Me; connections: ConnView[]; maxConnections: number; slackHint: string | null; log: LogEntry[] };

export type ConnectionDetailView = {
  me: Me;
  connection: ConnView & { webhookSecretSet: boolean; webhookUrl: string | null };
  plan: StopPlan | null;
  planError: string | null;
  /** HMAC-signed, 5 min, bound to connection + action + plan fingerprint (lib/guard/stop.ts). */
  challenges: { "arm-live": string; "stop-now": string } | null;
};

export function meOf(account: Account): Me {
  const e = account.entitlement;
  return {
    email: e.email,
    planLabel: getPlan(e.plan)?.label ?? e.plan,
    status: e.status,
    demo: e.source === "demo",
    billing: (e.source === "stripe" && !!e.subscriptionId) || e.source === "demo",
  };
}

const connView = (c: StoredConnection, snapshot: Snapshot | null): ConnView => ({
  id: c.id,
  label: c.label,
  provider: c.target.provider,
  tokenHint: c.tokenHint,
  budgetUsd: c.budgetUsd,
  stopMode: c.stopMode,
  snapshot,
});

export async function dashboardView(kv: KV, account: Account): Promise<DashboardView> {
  const [conns, log, settings] = await Promise.all([listConnections(kv, account.id), getLog(kv, account.id), getSettings(kv, account.id)]);
  const snaps = await Promise.all(conns.map((c) => getSnapshot(kv, account.id, c.id)));
  return {
    me: meOf(account),
    connections: conns.map((c, i) => connView(c, snaps[i])),
    maxConnections: MAX_CONNECTIONS,
    slackHint: settings.slackHint ?? null,
    log,
  };
}

export async function connectionDetailView(kv: KV, account: Account, conn: StoredConnection, now = Date.now()): Promise<ConnectionDetailView> {
  let plan: StopPlan | null = null;
  let planError: string | null = null;
  try {
    plan = await planFor(conn);
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err);
  }
  const secret = challengeSecret();
  return {
    me: meOf(account),
    connection: {
      ...connView(conn, await getSnapshot(kv, account.id, conn.id)),
      webhookSecretSet: !!conn.sealedWebhookSecret,
      webhookUrl: conn.target.provider === "vercel" ? `${siteUrl()}/api/webhooks/vercel/${conn.id}` : null,
    },
    plan,
    planError,
    challenges: plan ? { "arm-live": issueChallenge(conn.id, "arm-live", plan, secret, now), "stop-now": issueChallenge(conn.id, "stop-now", plan, secret, now) } : null,
  };
}
