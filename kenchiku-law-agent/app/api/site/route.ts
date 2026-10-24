import { checkAccess } from "@/lib/access";
import { allow, clientIp } from "@/lib/ratelimit";
import { lookupSite, type SiteStepId } from "@/lib/site";

// GET /api/site?address=静岡県浜松市中央区元城町103-2
// Geocodes the address and reads the MLIT GIS layers for that point.
// With &stream=1 it answers in NDJSON: {"type":"step","id":"plan"} as each data group
// comes back, then {"type":"site","site":…} (or {"type":"error",…}) as the last line.
export async function GET(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`site:${clientIp(request)}`, 60, 60 * 60 * 1000)) {
    return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  }
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim() ?? "";
  if (address.length < 3 || address.length > 200) return Response.json({ error: "住所を入力してください。" }, { status: 400 });
  const failed = "位置情報の取得に失敗しました。時間をおいて再度お試しください。";

  if (params.get("stream") === "1") {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        try {
          const site = await lookupSite(address, (id: SiteStepId) => send({ type: "step", id }));
          send({ type: "site", site });
        } catch (e) {
          console.error("site lookup failed", e);
          send({ type: "error", error: failed });
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }

  try {
    const site = await lookupSite(address);
    return Response.json(site, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    console.error("site lookup failed", e);
    return Response.json({ error: failed }, { status: 502 });
  }
}
