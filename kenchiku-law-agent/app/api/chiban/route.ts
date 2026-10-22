import { checkAccess } from "@/lib/access";
import { lookupChiban } from "@/lib/chiban";
import { allow, clientIp } from "@/lib/ratelimit";

// GET /api/chiban?lat=35.414&lon=136.767 — 代表点の筆（地番・形）と周りの筆。
export async function GET(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`chiban:${clientIp(request)}`, 120, 60 * 60 * 1000)) return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!(lat > 20 && lat < 46 && lon > 122 && lon < 154)) return Response.json({ error: "位置が正しくありません。" }, { status: 400 });
  const result = await lookupChiban(lat, lon);
  return Response.json(result, { headers: { "Cache-Control": "private, max-age=3600" } });
}
