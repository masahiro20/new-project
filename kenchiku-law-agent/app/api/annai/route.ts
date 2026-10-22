import { ANNAI_STYLES, renderAnnai, type AnnaiStyle } from "@/lib/annai";
import { allow, clientIp } from "@/lib/ratelimit";

// GET /api/annai?lat=35.414&lon=136.772&z=16&style=std&w=1000&h=700
// 案内図（国土地理院タイル＋ピン）の PNG。公開地図の合成だけなのでキー不要、レート制限のみ。
export async function GET(request: Request) {
  if (!allow(`annai:${clientIp(request)}`, 240, 60 * 60 * 1000)) return new Response("Too many requests", { status: 429 });
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const z = Number(q.get("z") ?? 16);
  const style = (q.get("style") ?? "std") as AnnaiStyle;
  const width = Math.min(1600, Math.max(200, Number(q.get("w") ?? 1000)));
  const height = Math.min(1200, Math.max(200, Number(q.get("h") ?? 700)));
  // bare=1: no pin or scale (background imagery); fmt=jpg for photos.
  const bare = q.get("bare") === "1";
  const format = q.get("fmt") === "jpg" ? "jpg" : "png";
  // Japan only.
  if (!(lat > 20 && lat < 46 && lon > 122 && lon < 154) || !(style in ANNAI_STYLES) || !Number.isFinite(z)) return new Response("Bad request", { status: 400 });
  try {
    const img = await renderAnnai({ lat, lon, z, style, width: Math.round(width), height: Math.round(height), bare, format });
    return new Response(new Uint8Array(img), {
      headers: { "Content-Type": format === "jpg" ? "image/jpeg" : "image/png", "Cache-Control": "public, max-age=86400, s-maxage=604800", "Content-Disposition": `inline; filename="annai-${style}-z${z}.${format}"` },
    });
  } catch (e) {
    console.error("annai failed", e);
    return new Response("地図を作れませんでした", { status: 502 });
  }
}
