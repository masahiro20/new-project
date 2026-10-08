import { after } from "next/server";
import { getKV } from "@/lib/redis";
import { handleVercelWebhook } from "@/lib/guard/service";

// Vercel Spend Management webhook, one URL per connection. Verified with the
// connection's own secret (x-vercel-signature); the follow-up runs after the 2xx.
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/vercel/[id]">) {
  const { id } = await ctx.params;
  if (!/^conn_[a-f0-9]{16}$/.test(id)) return Response.json({ error: "invalid_signature" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 10_000) return Response.json({ error: "too_large" }, { status: 413 });
  const { outcome, followUp } = await handleVercelWebhook(getKV(), id, raw, request.headers.get("x-vercel-signature"));
  if (followUp) after(() => followUp().catch((err) => console.error("[vercel-webhook] follow-up failed", err)));
  return Response.json({ result: outcome.result }, { status: outcome.status });
}
