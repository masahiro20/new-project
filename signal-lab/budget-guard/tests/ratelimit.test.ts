import { describe, expect, it } from "vitest";
import { getStats, track } from "@/lib/analytics";
import { rateLimit } from "@/lib/ratelimit";
import { createMemoryKV } from "@/lib/redis";

describe("rate limit + analytics", () => {
  it("allows `limit` hits per window", async () => {
    let now = 0;
    const kv = createMemoryKV(() => now);
    for (let i = 0; i < 3; i++) expect(await rateLimit(kv, "ip", 3, 60)).toBe(true);
    expect(await rateLimit(kv, "ip", 3, 60)).toBe(false);
    now += 60_000;
    expect(await rateLimit(kv, "ip", 3, 60)).toBe(true);
  });

  it("counts events per day", async () => {
    const kv = createMemoryKV();
    const day = new Date("2026-10-08T12:00:00Z");
    await track(kv, "pageview", day);
    await track(kv, "pageview", day);
    await track(kv, "purchase", day);
    const stats = await getStats(kv, 2, day);
    expect(stats["2026-10-08"]).toMatchObject({ pageview: 2, purchase: 1, signup: 0 });
    expect(stats["2026-10-07"].pageview).toBe(0);
  });
});
