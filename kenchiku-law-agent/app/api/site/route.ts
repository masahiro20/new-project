import { checkAccess } from "@/lib/access";
import { allow, clientIp } from "@/lib/ratelimit";
import { lookupSite } from "@/lib/site";

// GET /api/site?address=静岡県浜松市中央区元城町103-2
// Geocodes the address and reads the MLIT GIS layers for that point.
export async function GET(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`site:${clientIp(request)}`, 60, 60 * 60 * 1000)) {
    return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  }
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (address.length < 3 || address.length > 200) return Response.json({ error: "住所を入力してください。" }, { status: 400 });
  try {
    const site = await lookupSite(address);
    return Response.json(site, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    console.error("site lookup failed", e);
    return Response.json({ error: "位置情報の取得に失敗しました。時間をおいて再度お試しください。" }, { status: 502 });
  }
}
