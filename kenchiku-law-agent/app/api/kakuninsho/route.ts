import { z } from "zod";
import { checkAccess } from "@/lib/access";
import { buildKakuninsho, kakuninshoFileName, surveySchema } from "@/lib/kakuninsho";
import { planSchema } from "@/lib/plan";
import { allow, clientIp } from "@/lib/ratelimit";
import type { PartialReport } from "@/lib/report";
import { unseal } from "@/lib/sealed";
import { lookupSite, mergeSiteIntoPlan } from "@/lib/site";
import { municipality } from "@/lib/chiban";
import { lookupKozu, splitChiban } from "@/lib/kozu";

// 法令制限確認書（社内の Excel 書式）を作って返す。
//   POST /api/kakuninsho  { plan, survey, report? }   … 画面から（アクセスキー必須）
//   GET  /api/kakuninsho?t=<sealed>                    … Claude（MCP）が渡すリンクから

const bodySchema = z.object({
  plan: z.unknown(),
  survey: z.unknown().optional(),
  report: z
    .object({ summary: z.object({ verdict: z.string().max(40), topRisks: z.array(z.string().max(200)).max(3) }).partial() })
    .partial()
    .nullable()
    .optional()
    .catch(null),
});

export type KakuninshoRequest = { plan: unknown; survey?: unknown; report?: PartialReport | null };

async function respond(input: KakuninshoRequest): Promise<Response> {
  const parsed = bodySchema.safeParse(input);
  // The sheet does not need the plan text; fill it so a lot-only request still validates.
  const rawPlan = (parsed.success && parsed.data.plan && typeof parsed.data.plan === "object" ? parsed.data.plan : {}) as Record<string, unknown>;
  const description = String(rawPlan.description ?? "").trim();
  const plan = planSchema.safeParse({ ...rawPlan, description: description.length >= 5 ? description : "（計画内容の指定なし）" });
  if (!parsed.success || !plan.success) return Response.json({ error: "入力が正しくありません。" }, { status: 400 });
  const survey = surveySchema.parse(parsed.data.survey ?? {});
  let site = null;
  if (plan.data.address.trim().length >= 3) {
    try {
      site = await lookupSite(plan.data.address);
    } catch (e) {
      console.error("site lookup failed for kakuninsho", e);
    }
  }
  const merged = mergeSiteIntoPlan(plan.data, site);
  // 該当地が空なら、住所の地番で公図データを引いて「地番（公図の種類・図上面積）」を入れる。
  if (!survey.lot && site?.lat != null && site.lon != null && splitChiban(plan.data.address)) {
    try {
      const muni = await municipality(site.lat, site.lon);
      const k = muni ? await lookupKozu(plan.data.address, muni.muniCd) : null;
      if (k?.status === "ok") survey.lot = `${k.district ?? ""}${k.query?.chiban ?? ""}（公図：${k.map?.kind ?? ""}・図上 約${k.area}㎡／地積・地目は登記簿で確認）`;
    } catch (e) {
      console.error("kozu for kakuninsho failed", e);
    }
  }
  const xlsx = buildKakuninsho({ survey, plan: merged, site, report: (parsed.data.report as PartialReport | null) ?? null });
  const name = kakuninshoFileName(merged, survey);
  return new Response(Buffer.from(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kakuninsho.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;
  if (!allow(`kakuninsho:${clientIp(request)}`, 60, 60 * 60 * 1000)) return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as KakuninshoRequest | null;
  if (!body) return Response.json({ error: "入力が正しくありません。" }, { status: 400 });
  return respond(body);
}

export async function GET(request: Request) {
  if (!allow(`kakuninsho:${clientIp(request)}`, 60, 60 * 60 * 1000)) return Response.json({ error: "リクエストが多すぎます。" }, { status: 429 });
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const payload = unseal<KakuninshoRequest>(token);
  if (!payload) return new Response("リンクの期限が切れているか、正しくありません。Claude でもう一度作成してください。", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return respond(payload);
}
