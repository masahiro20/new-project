import { checkAccess } from "@/lib/access";
import { lookupChiban, municipality, type ChibanResult } from "@/lib/chiban";
import { lookupKozu, splitChiban, type KozuResult } from "@/lib/kozu";
import { allow, clientIp } from "@/lib/ratelimit";

// GET /api/lot?address=…&lat=…&lon=…
// 公図（住所の地番で登記所備付地図を引く）を優先し、地番が無い・見つからないときは
// 公共座標の地図から代表点の筆を探す。
export async function GET(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`lot:${clientIp(request)}`, 120, 60 * 60 * 1000)) return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  const q = new URL(request.url).searchParams;
  const address = (q.get("address") ?? "").trim().slice(0, 200);
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!(lat > 20 && lat < 46 && lon > 122 && lon < 154)) return Response.json({ error: "位置が正しくありません。" }, { status: 400 });
  let kozu: KozuResult | null = null;
  let chiban: ChibanResult | null = null;
  try {
    const muni = await municipality(lat, lon);
    if (muni && splitChiban(address)) kozu = await lookupKozu(address, muni.muniCd);
  } catch (e) {
    console.error("lot: municipality failed", e);
  }
  if (kozu?.status !== "ok") chiban = await lookupChiban(lat, lon);
  return Response.json({ kozu, chiban }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
