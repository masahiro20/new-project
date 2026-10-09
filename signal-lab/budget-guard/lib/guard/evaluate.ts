// Pure budget logic: given current spend and what we already did this period,
// decide whether to notify (>= warn ratio) or stop (>= 100%). Each fires once per period.

export type Level = "ok" | "warn" | "limit";

export interface GuardState {
  /** Billing period key, e.g. "2026-10" (UTC calendar month). */
  period: string;
  warnedAt?: string;
  limitNotifiedAt?: string;
  stoppedAt?: string;
  /** UTC hour ("2026-10-09T03") the hourly cron last checked this connection: a second cron run of that hour skips it. */
  lastHour?: string;
}

export interface Evaluation {
  level: Level;
  ratio: number;
  notifyWarn: boolean;
  notifyLimit: boolean;
  runStop: boolean;
}

export const WARN_RATIO = 0.8;

export function periodKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function periodStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Drop state from an earlier period so alerts re-arm each month. */
export function currentState(state: GuardState | undefined, now: Date): GuardState {
  const period = periodKey(now);
  return state?.period === period ? state : { period };
}

export function evaluate(
  spendUsd: number,
  budgetUsd: number,
  state: GuardState,
  opts: { warnRatio?: number; stopEnabled: boolean } = { stopEnabled: true },
): Evaluation {
  if (!(budgetUsd > 0)) throw new Error("budgetUsd must be positive");
  const ratio = Math.max(0, spendUsd) / budgetUsd;
  const level: Level = ratio >= 1 ? "limit" : ratio >= (opts.warnRatio ?? WARN_RATIO) ? "warn" : "ok";
  return {
    level,
    ratio,
    // Crossing straight to 100% sends the limit mail only, not both.
    notifyWarn: level === "warn" && !state.warnedAt && !state.limitNotifiedAt,
    notifyLimit: level === "limit" && !state.limitNotifiedAt,
    runStop: level === "limit" && opts.stopEnabled && !state.stoppedAt,
  };
}
