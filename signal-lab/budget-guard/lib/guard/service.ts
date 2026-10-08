import { createHash } from "node:crypto";
import { accessSecret } from "../access";
import { getEntitlement, isActive } from "../entitlements";
import { sendMail } from "../mail";
import type { KV } from "../redis";
import { isProduction, siteUrl } from "../site";
import { checkConnection, type Notice } from "./check";
import { decryptSecret } from "./crypto";
import { demoFetch, isDemoToken } from "./demo";
import { adapterFor } from "./providers";
import type { FetchLike, StopPlan } from "./stop";
import { appendLog, getState, listAccounts, listConnections, saveSnapshot, saveState, type StoredConnection } from "./store";

// Glue between the pure guard logic and the template's KV, mail and entitlements.

/** Real fetch, or the offline demo for the "demo" token (refused in production). */
export function fetchFor(token: string): FetchLike {
  if (!isDemoToken(token)) return fetch;
  if (isProduction()) throw new Error("The demo token is disabled in production");
  return demoFetch();
}

export function openToken(conn: StoredConnection): string {
  return decryptSecret(conn.sealedToken, conn.id);
}

/** Separate HMAC key for stop confirmations, derived from ACCESS_SECRET. */
export function challengeSecret(): string {
  return createHash("sha256").update(accessSecret()).update("budget-guard:stop-challenge").digest("base64url");
}

export async function planFor(conn: StoredConnection): Promise<StopPlan> {
  const token = openToken(conn);
  return adapterFor(conn.target).planStop(conn.target, token, conn.budgetUsd, fetchFor(token));
}

const SUBJECT: Record<Notice["kind"], string> = {
  warn: "80% of budget reached",
  limit: "Budget reached",
  stopped: "Stop action executed",
  "stop-test": "Stop action (test mode) would have run",
  "stop-failed": "Stop action FAILED",
  error: "Usage check failed",
};

async function notify(email: string, notices: Notice[]): Promise<void> {
  for (const n of notices) {
    if (n.kind === "error") continue; // shown on the dashboard; mailing every hourly failure is noise
    await sendMail({ to: email, subject: `[Budget Guard] ${SUBJECT[n.kind]}`, text: `${n.message}\n\nDashboard: ${siteUrl()}/app` });
  }
}

export async function checkAccount(kv: KV, acct: string, email: string, now = new Date(), only?: string): Promise<Notice[]> {
  const all: Notice[] = [];
  for (const conn of await listConnections(kv, acct)) {
    if (only && conn.id !== only) continue;
    let token: string;
    let fetchImpl: FetchLike;
    try {
      token = openToken(conn);
      fetchImpl = fetchFor(token);
    } catch (err) {
      all.push({ kind: "error", connectionId: conn.id, message: `${conn.label}: ${err instanceof Error ? err.message : err}` });
      continue;
    }
    const result = await checkConnection(conn, (await getState(kv, acct, conn.id)) ?? undefined, { token, fetchImpl, now });
    await saveState(kv, acct, conn.id, result.state);
    await saveSnapshot(kv, acct, conn.id, {
      spendUsd: result.spendUsd ?? 0,
      ratio: result.evaluation?.ratio ?? 0,
      level: result.evaluation?.level ?? "ok",
      checkedAt: now.toISOString(),
      error: result.notices.find((n) => n.kind === "error")?.message,
    });
    all.push(...result.notices);
  }
  await appendLog(kv, acct, all.map((n) => ({ ...n, at: now.toISOString() })));
  await notify(email, all);
  return all;
}

/** Hourly cron: every account with an active entitlement. */
export async function checkAll(kv: KV, now = new Date()): Promise<{ accounts: number; notices: number }> {
  let accounts = 0;
  let notices = 0;
  for (const acct of await listAccounts(kv)) {
    const ent = await getEntitlement(kv, acct);
    if (!isActive(ent)) continue; // lapsed subscriptions stop being monitored
    accounts++;
    notices += (await checkAccount(kv, acct, ent.email, now)).length;
  }
  return { accounts, notices };
}
