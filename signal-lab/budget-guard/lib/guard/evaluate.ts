// Pure budget logic: given current spend and what we already did this period,
// decide whether to notify (>= warn ratio) or stop (>= 100%). Each fires once per period.

export type Level = "ok" | "warn" | "limit";

export interface GuardState {
  /** Billing period key, e.g. "2026-10" (UTC calendar month). */
  period: string;
  warnedAt?: string;
  limitNotifiedAt?: string;
  stoppedAt?: string;
  /** Test mode recorded a would-be stop this period. Kept apart from stoppedAt so arming "live" later in the month still stops. */
  stopTestedAt?: string;
  /**
   * 2 = written by code that keeps dry runs in stopTestedAt. A state without it may carry a
   * stoppedAt that an old test-mode dry run wrote (R3-01): see migrateLegacyStop.
   */
  stopModel?: 2;
  /** First failed stop attempt this period: mailed once, then retried hourly without a mail each time (R3-11). */
  stopFailedAt?: string;
  /** UTC hour ("2026-10-09T03") the hourly cron last checked this connection: a second cron run of that hour skips it. */
  lastHour?: string;
  /** Set when the provider rejected the token (401/403) and we told the user; cleared by the next successful fetch. Survives the monthly reset. */
  keyInvalidAt?: string;
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
  if (state?.period === period) return state;
  // New month: alerts and stops re-arm, but "we already told you the key is invalid" carries over.
  return state?.keyInvalidAt ? { period, keyInvalidAt: state.keyInvalidAt } : { period };
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
