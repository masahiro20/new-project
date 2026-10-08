import type { FetchLike } from "./stop";

// Offline stand-in for the three provider APIs, used when a connection's token is
// "demo" (dev only) and in tests. Spend is fixed per provider so the dashboard shows
// one connection in each state.
export const DEMO_TOKEN = "demo";

export function isDemoToken(token: string): boolean {
  return token === DEMO_TOKEN;
}

export function demoFetch(spend: { vercel?: number; openai?: number; anthropicCents?: number } = {}): FetchLike & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const u = new URL(url);
    const method = init.method ?? "GET";
    if (method !== "GET") return new Response(JSON.stringify({ ok: true, status: "inactive" }), { status: 200 });
    if (u.host === "api.vercel.com") {
      const v = spend.vercel ?? 42.5;
      const lines = [
        { BilledCost: v / 2, BillingCurrency: "USD", ChargeCategory: "Usage" },
        { BilledCost: String(v / 2), BillingCurrency: "USD", ChargeCategory: "Usage" },
      ];
      return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });
    }
    if (u.host === "api.openai.com") {
      return Response.json({ data: [{ results: [{ amount: { value: spend.openai ?? 85, currency: "usd" } }] }], has_more: false, next_page: null });
    }
    if (u.pathname.endsWith("/cost_report")) {
      const ws = u.searchParams.get("workspace_id") ?? "wrkspc_demo";
      return Response.json({
        data: [{ results: [{ amount: String(spend.anthropicCents ?? 12000), currency: "USD", workspace_id: "wrkspc_demo" }, { amount: "999", currency: "USD", workspace_id: `${ws}_other` }] }],
        has_more: false,
        next_page: null,
      });
    }
    if (u.pathname.endsWith("/api_keys")) {
      return Response.json({ data: [{ id: "apikey_demo_1" }, { id: "apikey_demo_2" }], has_more: false, last_id: "apikey_demo_2" });
    }
    return new Response("not found", { status: 404 });
  };
  return Object.assign(impl, { calls });
}
