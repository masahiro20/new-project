import { vi } from "vitest";
import { demoFetch } from "@/lib/guard/demo";

// Since R3-02, connections added with the "demo" token go to the demo index (checked every
// 12 hours, a few per hour) instead of the cron's real work list. Tests of the real path use a
// non-demo token and answer the provider calls with the same offline data through a stubbed
// global fetch (what providerFetch calls).

/** A made-up, non-demo token (never a real key). */
export const FAKE_TOKEN = "sk-test-0000-not-a-real-key";

/** Stub global fetch with the offline provider data; returns the stub (its `calls` list). Undo with vi.unstubAllGlobals(). */
export function stubProviders(spend?: Parameters<typeof demoFetch>[0], wrap?: (f: ReturnType<typeof demoFetch>) => typeof fetch) {
  const f = demoFetch(spend);
  vi.stubGlobal("fetch", wrap ? wrap(f) : f);
  return f;
}
