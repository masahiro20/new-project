import { checkAccess } from "@/lib/access";
import { allow, clientIp } from "@/lib/ratelimit";
import { loadNotes, nearbyNotes, saveNotes, sharedNotesSchema, sharingAvailable } from "@/lib/sharednotes";

// 役所調査の共有メモ（社内のみ。アクセスキー必須）。
// GET /api/notes?address=…&city=…&lat=…&lon=…  → この住所の共有メモと、近くの調査結果
// POST /api/notes {address, city, lat, lon, notes, by} → 保存
export async function GET(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!sharingAvailable()) return Response.json({ available: false, own: null, nearby: [] });
  const q = new URL(request.url).searchParams;
  const address = (q.get("address") ?? "").trim().slice(0, 200);
  if (address.length < 3) return Response.json({ error: "住所を入れてください。" }, { status: 400 });
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  try {
    const [own, nearby] = await Promise.all([
      loadNotes(address),
      lat > 20 && lon > 122 ? nearbyNotes(q.get("city") ?? "", lat, lon, address) : Promise.resolve([]),
    ]);
    return Response.json({ available: true, own, nearby }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("notes get failed", e);
    return Response.json({ available: true, own: null, nearby: [], error: "共有メモを読み込めませんでした。" });
  }
}

export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!sharingAvailable()) return Response.json({ error: "共有の保存先が設定されていません。" }, { status: 503 });
  if (!allow(`notes:${clientIp(request)}`, 60, 60 * 60 * 1000)) return Response.json({ error: "保存が多すぎます。少し時間をおいてください。" }, { status: 429 });
  const parsed = sharedNotesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力が正しくありません。" }, { status: 400 });
  try {
    return Response.json({ saved: await saveNotes(parsed.data) });
  } catch (e) {
    console.error("notes save failed", e);
    return Response.json({ error: "保存に失敗しました。" }, { status: 500 });
  }
}
