import { getOffer } from "@/lib/offers";

// Outbound affiliate links go through here so every click is counted in the
// server logs (search for "affiliate_click") without storing visitor data.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const offer = getOffer((await params).id);
  if (!offer) return new Response("Not found", { status: 404 });

  let from = "";
  try {
    from = new URL(request.headers.get("referer") ?? "").pathname;
  } catch {
    // Missing or malformed referer: log the click without a source page.
  }
  console.log(JSON.stringify({ event: "affiliate_click", offer: offer.id, category: offer.category, from }));

  return new Response(null, {
    status: 302,
    headers: { Location: offer.url, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
