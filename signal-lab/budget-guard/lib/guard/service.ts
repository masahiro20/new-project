import { createHash } from "node:crypto";
import { accessSecret } from "../access";
import { entitlementKey, getEntitlement, isActive, trialEnded, type Entitlement } from "../entitlements";
import { sendMail } from "../mail";
import type { KV } from "../redis";
import { siteUrl } from "../site";
import { checkConnection, migrateLegacyStop, type Notice } from "./check";
import { decryptSecret, encryptSecret } from "./crypto";
import { currentState, periodKey } from "./evaluate";
import { DEMO_SLACK_URL, postSlack, spendPayloadSchema, verifyVercelSignature } from "./notify-channels";
import { demoFetch, demoTokensAllowed, isDemoToken } from "./demo";
import { adapterFor } from "./providers";
import { isDemoMode } from "../payments/mode";

/** Active, and (for demo entitlements) only while demo mode is on — mirrors entitlementUsable. */
export const monitored = (e: Entitlement | null): e is Entitlement => isActive(e) && (e.source !== "demo" || (isDemoMode() && !trialEnded(e)));
import { runStop, type FetchLike, type StopPlan, type StopResult } from "./stop";
import {
  appendLog,
  claimHookEvent,
  getConnection,
  getSettings,
  getState,
  listAccounts,
  listConnections,
  mergeLog,
  ownerOf,
  parseActivity,
  saveSettings,
  saveState,
  storeKeys,
  updateConnection,
  withConnLock,
  type AccountSettings,
  type Snapshot,
  type StoredConnection,
} from "./store";
import type { GuardState } from "./evaluate";

// Glue between the pure guard logic and the template's KV, mail and entitlements.

/**
 * Provider calls run under the per-connection lock (CONN_LOCK_SECONDS). Without a timeout a
 * hung request could outlive the lock, letting a second check run at the same time (double
 * notices / stops) and the first one's unlock delete the second one's lock.
 */
export const PROVIDER_TIMEOUT_MS = 20_000;

/**
 * Provider fetch (R3-05): bounded in time, and never follows redirects (a redirect would carry
 * the admin token — x-api-key is not stripped cross-origin — and replay POST bodies to another
 * host). redirect "manual" + refusing 3xx rather than "error", which Workers may not accept.
 */
export const providerFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, { ...init, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (res.status >= 300 && res.status < 400) throw new Error(`${new URL(url).host} answered ${res.status} (redirect refused)`);
  return res;
};

/** Real fetch, or the offline demo for the "demo" token (see demoTokensAllowed). */
export function fetchFor(token: string): FetchLike {
  if (!isDemoToken(token)) return providerFetch;
  if (!demoTokensAllowed()) throw new Error("The demo token is disabled in production");
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
  "key-invalid": "Provider token rejected — monitoring is paused for this connection",
  "vercel-alert": "Vercel Spend Management alert",
  info: "Notice",
};

// --- Slack -------------------------------------------------------------------

export async function setSlackUrl(kv: KV, acct: string, url: string | null): Promise<void> {
  const settings = await getSettings(kv, acct);
  if (url === null) {
    delete settings.sealedSlackUrl;
    delete settings.slackHint;
  } else {
    if (url === DEMO_SLACK_URL && !demoTokensAllowed()) throw new Error("The demo Slack URL only works in development");
    settings.sealedSlackUrl = encryptSecret(url, `${acct}:slack`);
    settings.slackHint = url === DEMO_SLACK_URL ? "demo" : `hooks.slack.com/…${url.slice(-4)}`;
  }
  await saveSettings(kv, acct, settings);
}

async function slackUrl(kv: KV, acct: string): Promise<string | null> {
  const { sealedSlackUrl } = await getSettings(kv, acct);
  return sealedSlackUrl ? decryptSecret(sealedSlackUrl, `${acct}:slack`) : null;
}

export async function sendSlackTest(kv: KV, acct: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const url = await slackUrl(kv, acct);
  if (!url) throw new Error("No Slack webhook saved");
  await postSlack(url, "Budget Guard test message: alerts for this account will appear here.", fetchImpl);
}

// --- Notifications -----------------------------------------------------------

/** Email every notice except routine errors; mirror the same to Slack when configured. */
export async function notify(
  kv: KV,
  acct: string,
  email: string,
  notices: Notice[],
  fetchImpl: FetchLike = fetch,
  /** Already-read settings (saves the KV read when the caller fetched them in an MGET). */
  settings?: AccountSettings,
): Promise<void> {
  const mailable = notices.filter((n) => n.kind !== "error" && n.kind !== "info");
  if (mailable.length === 0) return;
  for (const n of mailable) {
    await sendMail({ to: email, subject: `[Budget Guard] ${SUBJECT[n.kind]}`, text: `${n.message}\n\nDashboard: ${siteUrl()}/app` });
  }
  let url: string | null = null;
  try {
    url = settings ? (settings.sealedSlackUrl ? decryptSecret(settings.sealedSlackUrl, `${acct}:slack`) : null) : await slackUrl(kv, acct);
  } catch {
    url = null;
  }
  if (!url) return;
  try {
    await postSlack(url, mailable.map((n) => `*${SUBJECT[n.kind]}* — ${n.message}`).join("\n"), fetchImpl);
  } catch (err) {
    // A broken Slack hook must not block email or stop actions; surface it on the dashboard.
    await appendLog(kv, acct, [{ kind: "error", connectionId: "", message: `Slack delivery failed: ${err instanceof Error ? err.message : err}`, at: new Date().toISOString() }]);
  }
}

export async function checkAccount(
  kv: KV,
  acct: string,
  email: string,
  now = new Date(),
  only?: string,
  opts: { vercelLimitReached?: boolean; notifyFetch?: FetchLike } = {},
): Promise<Notice[]> {
  return (await checkAccountDetailed(kv, acct, email, now, only, opts)).notices;
}

/** Longest a single connection check may hold its lock (provider calls + stop). */
export const CONN_LOCK_SECONDS = 120;

/**
 * Like checkAccount, and also reports connections skipped because another check of
 * the same connection was running (per-connection lock) — callers retry those later
 * instead of checking twice at once.
 */
export async function checkAccountDetailed(
  kv: KV,
  acct: string,
  email: string,
  now = new Date(),
  only?: string,
  opts: { vercelLimitReached?: boolean; notifyFetch?: FetchLike } = {},
): Promise<{ notices: Notice[]; busy: string[]; checked: number }> {
  const ids = only ? [only] : (await listConnections(kv, acct)).map((c) => c.id);
  const all: Notice[] = [];
  const busy: string[] = [];
  let checked = 0;
  for (const id of ids) {
    const r = await checkConnectionLocked(kv, acct, id, now, { ...opts, email });
    if (r.status === "busy") busy.push(id);
    if (r.status === "checked") {
      checked++;
      all.push(...r.notices);
    }
  }
  return { notices: all, busy, checked };
}

export type LockedCheck =
  | { status: "busy" } // another check of this connection holds the lock
  | { status: "missing" } // the connection was removed
  | { status: "inactive" } // entitlement lapsed (only with requireEntitlement)
  | { status: "already" } // cron: already checked in this hour
  | { status: "demo" } // cron: a demo-token connection found in the real index (moved to the demo index)
  | { status: "checked"; notices: Notice[]; /** The sealed token could not be opened (R1-01): monitoring is off for it. */ tokenError?: true };

const parse = <T>(raw: string | null): T | null => (raw === null ? null : (JSON.parse(raw) as T));
const pickSchedule = (s: Snapshot | undefined) => (s?.intervalHours ? { intervalHours: s.intervalHours, nextCheckAt: s.nextCheckAt } : {});

/**
 * One connection, end to end, under its lock: fetch spend, evaluate against this
 * month's state (notices / stop once a month), save, log, notify. Upstash commands:
 * SET NX (lock) + one MGET (entitlement, connections, state, activity, settings) + one
 * MSET (state, activity = snapshot + log) + DEL (unlock) = 4 — or 1 + 5 + 2 + 1 = 9 if
 * Upstash counts every key of MGET/MSET (worst case), with or without notices.
 */
export async function checkConnectionLocked(
  kv: KV,
  acct: string,
  connId: string,
  now: Date,
  opts: {
    email?: string;
    requireEntitlement?: boolean;
    /**
     * Vercel Spend Management reported 100% (webhook). Counts as "budget reached" only for a
     * connection that opted in (vercelLimitStops, R3-03); otherwise this is a normal check of the
     * spend we fetch now, against the Budget Guard budget.
     */
    vercelLimitReached?: boolean;
    notifyFetch?: FetchLike;
    /** Cron: skip if this connection was already checked in this UTC hour (and record it). */
    hour?: string;
    /** Cron: the current check interval and next due time, stored in the snapshot for the dashboard. */
    schedule?: { intervalHours: number; nextCheckAt: string };
    /** Cron, item from the real index: a demo-token connection is not checked here (R3-02). */
    realOnly?: boolean;
  } = {},
): Promise<LockedCheck> {
  const r = await withConnLock(kv, connId, CONN_LOCK_SECONDS, async (): Promise<LockedCheck> => {
    const [entRaw, connsRaw, stateRaw, activityRaw, settingsRaw] = await kv.mget(
      entitlementKey(acct),
      storeKeys.conns(acct),
      storeKeys.state(acct, connId),
      storeKeys.activity(acct),
      storeKeys.settings(acct),
    );
    let email = opts.email ?? "";
    if (opts.requireEntitlement) {
      const ent = parse<Entitlement>(entRaw);
      if (!monitored(ent)) return { status: "inactive" }; // lapsed subscriptions stop being monitored
      email = ent.email;
    }
    const conn = (parse<StoredConnection[]>(connsRaw) ?? []).find((c) => c.id === connId);
    if (!conn) return { status: "missing" };
    const activity = parseActivity(activityRaw);
    // R3-01: a legacy stoppedAt written by a test-mode dry run becomes stopTestedAt (no extra command).
    const prevState = migrateLegacyStop(parse<GuardState>(stateRaw) ?? undefined, activity.log, connId, now);
    // Read under the lock, so two cron runs of one hour can't both check (the second sees lastHour).
    if (opts.hour && prevState?.lastHour === opts.hour) return { status: "already" };

    const notices: Notice[] = [];
    const writes: Record<string, string> = {};
    let activityChanged = false;
    let token: string | undefined;
    let fetchImpl: FetchLike | undefined;
    let opened = false;
    try {
      token = openToken(conn);
      opened = true;
      if (opts.realOnly && isDemoToken(token)) return { status: "demo" };
      fetchImpl = fetchFor(token);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (opened) {
        // The token opened but can't be used here (the "demo" token outside a demo deployment): the
        // user's to fix, not a key problem — logged apart from R1-01 so the two aren't confused (Ren QA).
        console.warn(`[guard] token refused for ${conn.id}: ${reason}`);
        token = undefined;
      } else {
        // The user can't fix this (missing / rotated TOKEN_ENCRYPTION_KEY): monitoring is off for
        // this connection, so tell the operator. Only the id and the reason, never the sealed value.
        console.error(`[guard] cannot open token for ${conn.id}: ${reason}`);
      }
      notices.push({ kind: "error", connectionId: conn.id, message: `${conn.label}: ${reason}` });
    }
    if (token !== undefined && fetchImpl) {
      const forceLimit = !!opts.vercelLimitReached && conn.target.provider === "vercel" && conn.vercelLimitStops === true;
      const result = await checkConnection(conn, prevState, { token, fetchImpl, now, forceLimit });
      const saved: GuardState = { ...result.state, stopModel: 2 };
      if (opts.hour) saved.lastHour = opts.hour;
      writes[storeKeys.state(acct, conn.id)] = JSON.stringify(saved);
      activity.snaps[conn.id] = {
        spendUsd: result.spendUsd ?? 0,
        ratio: result.evaluation?.ratio ?? 0,
        level: result.evaluation?.level ?? "ok",
        checkedAt: now.toISOString(),
        error: result.notices.find((n) => n.kind === "error" || n.kind === "key-invalid")?.message,
        // Keep the cron's schedule on manual checks too.
        ...(opts.schedule ?? pickSchedule(activity.snaps[conn.id])),
      } satisfies Snapshot;
      activityChanged = true;
      notices.push(...result.notices);
    } else if (opts.hour) {
      writes[storeKeys.state(acct, conn.id)] = JSON.stringify({ ...(prevState ?? { period: periodKey(now) }), stopModel: 2, lastHour: opts.hour });
    }
    if (notices.length) {
      activity.log = mergeLog(activity.log, notices.map((n) => ({ ...n, at: now.toISOString() })));
      activityChanged = true;
    }
    if (activityChanged) writes[storeKeys.activity(acct)] = JSON.stringify(activity);
    await kv.mset(writes);
    await notify(kv, acct, email, notices, opts.notifyFetch, parse<AccountSettings>(settingsRaw) ?? {});
    return { status: "checked", notices, ...(!opened && { tokenError: true as const }) };
  });
  return r.ok ? r.value : { status: "busy" };
}

/**
 * "Stop now" from the dashboard (R3-11): under the connection's lock, like every check, and it
 * records stoppedAt so the automatic stop doesn't run a second time this month.
 */
export async function manualStopLocked(
  kv: KV,
  acct: string,
  conn: StoredConnection,
  plan: StopPlan,
  now = new Date(),
): Promise<{ status: "busy" } | { status: "done"; ok: boolean; result: StopResult }> {
  const r = await withConnLock(kv, conn.id, CONN_LOCK_SECONDS, async () => {
    const token = openToken(conn);
    const result = await runStop(plan, "live", adapterFor(conn.target).authHeaders(token), fetchFor(token));
    const at = now.toISOString();
    if (result.ok) {
      const state = currentState((await getState(kv, acct, conn.id)) ?? undefined, now);
      await saveState(kv, acct, conn.id, { ...state, stoppedAt: at, stopModel: 2 });
    }
    await appendLog(kv, acct, [
      result.ok
        ? { kind: "stopped", connectionId: conn.id, message: `Manual stop: ${plan.summary} Undo: ${plan.undo}`, at }
        : { kind: "stop-failed", connectionId: conn.id, message: `Manual stop failed: ${result.requests.map((x) => x.error ?? x.status).join("; ")}`, at },
    ]);
    return { status: "done" as const, ok: result.ok, result };
  });
  return r.ok ? r.value : { status: "busy" };
}

// --- Vercel Spend Management webhook --------------------------------------------

export async function setVercelWebhookSecret(kv: KV, acct: string, connId: string, secret: string | null): Promise<void> {
  await updateConnection(kv, acct, connId, { sealedWebhookSecret: secret === null ? undefined : encryptSecret(secret, `${connId}:webhook`) });
}

export type HookOutcome =
  | { status: 200; result: "handled" | "duplicate" | "inactive" }
  | { status: 400 | 401 | 404; result: string };

/**
 * Verifies and records a Spend Management webhook for one connection. Returns a
 * follow-up to run after the response (Vercel times out at 30s), so the route can
 * hand it to after().
 */
export async function handleVercelWebhook(
  kv: KV,
  connId: string,
  rawBody: string,
  signature: string | null,
  now = new Date(),
): Promise<{ outcome: HookOutcome; followUp?: () => Promise<unknown> }> {
  // Unknown connection, wrong provider, no secret and bad signature all look the same to the caller.
  const unauthorized = { outcome: { status: 401, result: "invalid_signature" } as HookOutcome };
  const acct = await ownerOf(kv, connId);
  const conn = acct ? await getConnection(kv, acct, connId) : undefined;
  if (!acct || !conn || conn.target.provider !== "vercel" || !conn.sealedWebhookSecret) return unauthorized;
  if (!verifyVercelSignature(rawBody, signature, decryptSecret(conn.sealedWebhookSecret, `${conn.id}:webhook`))) return unauthorized;

  let payload;
  try {
    payload = spendPayloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return { outcome: { status: 400, result: "invalid_payload" } };
  }
  if (payload.teamId !== conn.target.teamId) return { outcome: { status: 400, result: "team_mismatch" } };

  const ent = await getEntitlement(kv, acct);
  if (!monitored(ent)) return { outcome: { status: 200, result: "inactive" } };
  // R2-04: the payload has no timestamp, so a signed body stays valid forever. Remember every body
  // (hash) for 400 days: a replay in a later month is a duplicate, not a fresh "100%" (forced stop).
  // A real alert of a new month differs in currentSpend / budget, so it gets through.
  const bodyHash = createHash("sha256").update(rawBody).digest("base64url").slice(0, 32);
  if (!(await claimHookEvent(kv, conn.id, `body:${bodyHash}`, 400 * 24 * 3600))) return { outcome: { status: 200, result: "duplicate" } };
  if (!(await claimHookEvent(kv, conn.id, `${periodKey(now)}:${payload.thresholdPercent}`))) {
    return { outcome: { status: 200, result: "duplicate" } };
  }

  const notice: Notice = {
    kind: "vercel-alert",
    connectionId: conn.id,
    message: `${conn.label}: Vercel Spend Management reports $${payload.currentSpend} of its $${payload.budgetAmount} on-demand budget (${payload.thresholdPercent}% threshold).`,
  };
  await appendLog(kv, acct, [{ ...notice, at: now.toISOString() }]);
  const reachedLimit = payload.thresholdPercent >= 100;
  return {
    outcome: { status: 200, result: "handled" },
    // Mail the alert, then re-check now instead of waiting for the hourly cron: fetch the spend
    // and judge it against the Budget Guard budget, like every check (R3-03). Vercel's own 100%
    // counts as the limit only when the connection opted in ("Stop on Vercel's 100% alert").
    followUp: async () => {
      await notify(kv, acct, ent.email, [notice]);
      // If the cron (or a "Check now") holds this connection right now, wait for it rather than skip this check.
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await checkAccountDetailed(kv, acct, ent.email, now, conn.id, { vercelLimitReached: reachedLimit });
        if (r.busy.length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    },
  };
}

/** Every account in one go (tests / tools). The cron uses lib/guard/cron.ts (sliced, locked). */
export async function checkAll(kv: KV, now = new Date()): Promise<{ accounts: number; notices: number }> {
  let accounts = 0;
  let notices = 0;
  for (const acct of await listAccounts(kv)) {
    const ent = await getEntitlement(kv, acct);
    if (!monitored(ent)) continue; // lapsed subscriptions stop being monitored
    accounts++;
    notices += (await checkAccount(kv, acct, ent.email, now)).length;
  }
  return { accounts, notices };
}
