// How often each connection is checked, by the total number of connections.
//
// THE one place to tune it. The tiers come from the Upstash free-tier estimate in
// docs/deploy-cloudflare.md §7.1 (500k commands/month, counted the worst way: every
// key of an MGET/MSET as one command), including dashboard use (10 opens a day per
// person; one MGET of 2 keys per request since the sign-out check, R2-02), a reserve for
// demo-token connections (R3-02: at most 2 checks an hour) and 1,000 page views a day.
// tests/upstash-budget.test.ts recomputes that
// estimate and fails if a tier stops fitting.

export type IntervalTier = { upTo: number; hours: number };

/** Up to `upTo` connections (inclusive) → checked every `hours` hours. */
export const CHECK_INTERVAL_TIERS: readonly IntervalTier[] = [
  { upTo: 50, hours: 1 },
  { upTo: 90, hours: 2 },
  { upTo: 120, hours: 3 },
  { upTo: 150, hours: 4 },
  { upTo: 190, hours: 6 },
  { upTo: 225, hours: 8 },
  { upTo: Infinity, hours: 12 }, // beyond ~225: still not guaranteed to fit — upgrade Upstash (see docs)
];

export function intervalFor(connections: number, tiers: readonly IntervalTier[] = CHECK_INTERVAL_TIERS): number {
  return (tiers.find((t) => connections <= t.upTo) ?? tiers[tiers.length - 1]).hours;
}

/** Hours since the epoch (UTC). */
export const hourIndex = (date: Date) => Math.floor(date.getTime() / 3_600_000);

/** Stable slot 0…interval-1 for a connection (FNV-1a), so the load spreads evenly over the hours. */
export function slotOf(connId: string, interval: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < connId.length; i++) {
    h ^= connId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % interval;
}

/** Is this connection checked in the hour of `date`? */
export const isDue = (connId: string, date: Date, interval: number) => slotOf(connId, interval) === hourIndex(date) % interval;

/** Start of the next hour (after `date`'s hour) in which the connection is due. */
export function nextCheckHour(connId: string, date: Date, interval: number): Date {
  const h = hourIndex(date);
  const slot = slotOf(connId, interval);
  let next = h + 1;
  while (next % interval !== slot) next++;
  return new Date(next * 3_600_000);
}

export function intervalLabel(hours: number): string {
  return hours === 1 ? "every hour" : `every ${hours} hours`;
}
