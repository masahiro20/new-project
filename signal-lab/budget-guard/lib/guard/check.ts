import { adapterFor, isAuthFailure, type Target } from "./providers";
import { currentState, evaluate, periodKey, periodStart, type Evaluation, type GuardState } from "./evaluate";
import { runStop, type FetchLike, type StopMode, type StopResult } from "./stop";

export interface Connection {
  id: string;
  label: string;
  target: Target;
  budgetUsd: number;
  stopMode: StopMode;
  /** AES-GCM sealed provider token (see crypto.ts). */
  sealedToken: string;
}

export interface Notice {
  kind: "warn" | "limit" | "stopped" | "stop-test" | "stop-failed" | "error" | "key-invalid" | "vercel-alert" | "info";
  connectionId: string;
  message: string;
}

export interface CheckResult {
  state: GuardState;
  evaluation?: Evaluation;
  spendUsd?: number;
  stop?: StopResult;
  notices: Notice[];
}

export interface CheckDeps {
  token: string;
  fetchImpl: FetchLike;
  now: Date;
  /** The provider itself reported the limit (Vercel Spend Management at 100%). */
  forceLimit?: boolean;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** One hourly pass for one connection: fetch spend, compare, notify once, stop once. */
export async function checkConnection(conn: Connection, prev: GuardState | undefined, deps: CheckDeps): Promise<CheckResult> {
  const state = { ...currentState(prev, deps.now) };
  const adapter = adapterFor(conn.target);
  const notices: Notice[] = [];
  const stamp = deps.now.toISOString();

  let spendUsd: number;
  try {
    ({ spendUsd } = await adapter.fetchSpend(conn.target, deps.token, periodStart(deps.now), deps.now, deps.fetchImpl));
    // NaN / Infinity (an unexpected amount format) would evaluate as "ok" forever: report it instead of failing open.
    if (!Number.isFinite(spendUsd)) throw new Error(`Provider returned a non-numeric spend (${spendUsd})`);
  } catch (err) {
    const message = `Usage fetch failed: ${err instanceof Error ? err.message : err}`;
    if (isAuthFailure(err) && !state.keyInvalidAt) {
      // Mailed (and posted to Slack) once; the dashboard keeps showing the error on every failed check.
      state.keyInvalidAt = stamp;
      notices.push({
        kind: "key-invalid",
        connectionId: conn.id,
        message: `${conn.label}: the provider rejected the token (${message.replace("Usage fetch failed: ", "")}). Budget Guard can't read spend or stop anything for this connection until you add a new token (delete the connection and add it again with a new key).`,
      });
    } else {
      notices.push({ kind: "error", connectionId: conn.id, message });
    }
    return { state, notices };
  }
  if (state.keyInvalidAt) delete state.keyInvalidAt; // the key works again: the next failure is reported again

  // A test-mode dry run must not count as "already stopped" once the connection is armed live (R3-01).
  // In test mode either a dry run or a real stop this month means "done" (no TEST MODE mail after a real stop).
  const stopState = conn.stopMode === "live" ? state : { ...state, stoppedAt: state.stopTestedAt ?? state.stoppedAt };
  const evaluation = evaluate(deps.forceLimit ? Math.max(spendUsd, conn.budgetUsd) : spendUsd, conn.budgetUsd, stopState, {
    stopEnabled: conn.stopMode !== "off",
  });
  const pct = Math.round(evaluation.ratio * 100);
  const line = deps.forceLimit
    ? `${conn.label}: Vercel Spend Management reported 100% of its budget (our fetch: ${usd(spendUsd)} of ${usd(conn.budgetUsd)})`
    : `${conn.label}: ${usd(spendUsd)} of ${usd(conn.budgetUsd)} (${pct}%)`;

  if (evaluation.notifyWarn) {
    state.warnedAt = stamp;
    notices.push({ kind: "warn", connectionId: conn.id, message: `${line} — passed the 80% alert line.` });
  }
  if (evaluation.notifyLimit) {
    state.limitNotifiedAt = stamp;
    notices.push({ kind: "limit", connectionId: conn.id, message: `${line} — budget reached.` });
  }

  let stop: StopResult | undefined;
  // R3-11: a stop that keeps failing is retried every check, but mailed once a month (the first time).
  const failed = (message: string) => {
    if (state.stopFailedAt) return void console.error(`[guard] ${conn.id}: ${message} (retrying; already reported)`);
    state.stopFailedAt = stamp;
    notices.push({ kind: "stop-failed", connectionId: conn.id, message: `${message} Budget Guard retries at every check.` });
  };
  if (evaluation.runStop) {
    try {
      const plan = await adapter.planStop(conn.target, deps.token, conn.budgetUsd, deps.fetchImpl);
      stop = await runStop(plan, conn.stopMode, adapter.authHeaders(deps.token), deps.fetchImpl);
      if (stop.dryRun) {
        state.stopTestedAt = stamp; // test mode: record once per period so we don't spam (not stoppedAt: arming live must still stop)
        notices.push({ kind: "stop-test", connectionId: conn.id, message: `TEST MODE — would have run: ${plan.summary}` });
      } else if (stop.ok) {
        state.stoppedAt = stamp;
        notices.push({ kind: "stopped", connectionId: conn.id, message: `Stopped: ${plan.summary} Undo: ${plan.undo}` });
      } else {
        // Leave stoppedAt unset so the next hourly pass retries.
        failed(`Stop failed: ${stop.requests.map((r) => r.error ?? r.status).join("; ")}`);
      }
    } catch (err) {
      failed(`Stop planning failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { state, evaluation, spendUsd, stop, notices };
}

/**
 * R3-01 data migration, applied when a state is read (under the connection lock, before the
 * check), so there is no window between a deploy and a one-off script.
 *
 * Before the fix a test-mode dry run wrote `stoppedAt`, which then blocked the real stop for the
 * rest of the month once the connection was armed live. A dry run and its "TEST MODE" log entry
 * share one timestamp, so a legacy `stoppedAt` of this month is moved to `stopTestedAt` only when
 * the log proves it was a dry run. If the entry has scrolled out of the capped log we keep it as a
 * real stop: a second live stop in the same month (after the user resumed by hand) is the worse
 * failure. Returns the state marked stopModel 2 (unchanged otherwise).
 */
export function migrateLegacyStop(
  prev: GuardState | undefined,
  log: ReadonlyArray<{ kind: string; connectionId: string; at: string; message: string }>,
  connId: string,
  now: Date,
): GuardState | undefined {
  if (!prev || prev.stopModel === 2) return prev;
  const next: GuardState = { ...prev, stopModel: 2 };
  if (!prev.stoppedAt || prev.period !== periodKey(now)) return next;
  const dryRun = log.some((e) => e.connectionId === connId && e.at === prev.stoppedAt && e.kind === "stop-test" && e.message.startsWith("TEST MODE"));
  if (!dryRun) return next;
  const { stoppedAt, ...rest } = next;
  return { ...rest, stopTestedAt: prev.stopTestedAt ?? stoppedAt };
}
