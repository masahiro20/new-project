import { checkAccess } from "@/lib/access";
import { checkCase, parseCases, summarize } from "@/lib/accuracy";
import { allow, clientIp } from "@/lib/ratelimit";

export const maxDuration = 300;

// POST /api/accuracy {csv} → 案件ごとの比較と項目ごとの正答率（1回20件まで）。
export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`accuracy:${clientIp(request)}`, 10, 60 * 60 * 1000)) return Response.json({ error: "実行回数が多すぎます。少し時間をおいてください。" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { csv?: string };
  const cases = parseCases(String(body.csv ?? "").slice(0, 20000)).filter((c) => c.住所.length >= 3);
  if (!cases.length) return Response.json({ error: "住所の入った行がありません。" }, { status: 400 });
  if (cases.length > 20) return Response.json({ error: "1回20件までです。分けて実行してください。" }, { status: 400 });
  const results = [];
  for (const c of cases) {
    try {
      results.push(await checkCase(c));
    } catch (e) {
      results.push({ address: c.住所, fields: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ results, summary: summarize(results) });
}
