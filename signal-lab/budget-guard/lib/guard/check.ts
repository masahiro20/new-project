import { adapterFor, isAuthFailure, type Target } from "./providers";
import { currentState, evaluate, periodStart, type Evaluation, type GuardState } from "./evaluate";
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

  const evaluation = evaluate(deps.forceLimit ? Math.max(spendUsd, conn.budgetUsd) : spendUsd, conn.budgetUsd, state, {
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
  if (evaluation.runStop) {
    try {
      const plan = await adapter.planStop(conn.target, deps.token, conn.budgetUsd, deps.fetchImpl);
      stop = await runStop(plan, conn.stopMode, adapter.authHeaders(deps.token), deps.fetchImpl);
      if (stop.dryRun) {
        state.stoppedAt = stamp; // test mode: record once per period so we don't spam
        notices.push({ kind: "stop-test", connectionId: conn.id, message: `TEST MODE — would have run: ${plan.summary}` });
      } else if (stop.ok) {
        state.stoppedAt = stamp;
        notices.push({ kind: "stopped", connectionId: conn.id, message: `Stopped: ${plan.summary} Undo: ${plan.undo}` });
      } else {
        // Leave stoppedAt unset so the next hourly pass retries.
        notices.push({ kind: "stop-failed", connectionId: conn.id, message: `Stop failed: ${stop.requests.map((r) => r.error ?? r.status).join("; ")}` });
      }
    } catch (err) {
      notices.push({ kind: "stop-failed", connectionId: conn.id, message: `Stop planning failed: ${err instanceof Error ? err.message : err}` });
    }
  }

  return { state, evaluation, spendUsd, stop, notices };
}
