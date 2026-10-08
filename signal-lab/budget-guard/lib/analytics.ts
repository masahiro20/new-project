import { config } from "./config";
import type { KV } from "./redis";

// Anonymous daily counters: HINCRBY stats:{slug}:{YYYY-MM-DD} <event> 1. No per-person data.
export const EVENTS = ["pageview", "cta_click", "checkout_start", "purchase", "signup"] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];
/** Events browsers may send to /api/track; the rest are counted server-side only. */
export const CLIENT_EVENTS = ["pageview", "cta_click"] as const satisfies readonly AnalyticsEvent[];

const RETENTION_SECONDS = 400 * 24 * 60 * 60;
const day = (d: Date) => d.toISOString().slice(0, 10);
export const statsKey = (date: Date) => `stats:${config.slug}:${day(date)}`;

export async function track(kv: KV, event: AnalyticsEvent, date = new Date()): Promise<void> {
  const k = statsKey(date);
  await kv.hincrby(k, event, 1);
  await kv.expire(k, RETENTION_SECONDS);
}

export async function getStats(kv: KV, days: number, until = new Date()): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(until.getTime() - i * 86_400_000);
    const raw = await kv.hgetall(statsKey(d));
    out[day(d)] = Object.fromEntries(EVENTS.map((e) => [e, Number(raw[e] ?? 0)]));
  }
  return out;
}
