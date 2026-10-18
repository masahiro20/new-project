import { fetchArticle, keywordSearch, searchLaws } from "@/lib/egov";
import { LAWS, lawByTitle, normalizeArticle } from "@/lib/laws";
import { allow, clientIp } from "@/lib/ratelimit";

// GET /api/law?law=建築基準法&article=43   -> one article (e-Gov live text)
// GET /api/law?title=宅地造成              -> law search
// GET /api/law?keyword=住宅用防災機器      -> full-text search
export async function GET(request: Request) {
  if (!allow(`law:${clientIp(request)}`, 120, 60 * 60 * 1000)) {
    return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  }
  const url = new URL(request.url);
  const law = url.searchParams.get("law");
  const article = url.searchParams.get("article");
  const title = url.searchParams.get("title");
  const keyword = url.searchParams.get("keyword");

  try {
    if (law && article) {
      const key = lawByTitle(law);
      const lawId = key ? LAWS[key].id : /^\d{3}[A-Z]{2}\d{10}$/.test(law) ? law : null;
      const art = normalizeArticle(article);
      if (!lawId || !art) return Response.json({ error: "law または article の形式が不正です。" }, { status: 400 });
      const result = await fetchArticle(lawId, art);
      if (!result) return Response.json({ error: "条文が見つかりませんでした。" }, { status: 404 });
      return Response.json(result, { headers: { "Cache-Control": "public, max-age=3600" } });
    }
    if (title) return Response.json({ laws: await searchLaws(title) });
    if (keyword) return Response.json({ hits: await keywordSearch(keyword) });
    return Response.json({ error: "law&article、title、keyword のいずれかを指定してください。" }, { status: 400 });
  } catch (e) {
    console.error("law api failed", e);
    return Response.json({ error: "e-Gov 法令API に接続できませんでした。" }, { status: 502 });
  }
}
