// 「土地のまとめ」: the at-a-glance land sheet shown before any AI runs.
// Everything here is deterministic — public map data for the address plus the
// statutory numbers below, each read from e-Gov on 2026-10-19:
//   建築基準法52条2項（前面道路幅員×4/10・6/10）, 55条（絶対高さ10m・12m）,
//   56条1項2号・3号（隣地斜線 20m+1.25／31m+2.5、北側斜線 5m／10m+1.25）,
//   別表第三（道路斜線 1.25／1.5）, 別表第四（日影規制の対象建築物）.

import { lawUrl } from "./egov";
import { FUDE_SOURCE, GSI_VT_SOURCE } from "./nearby";
import type { PlanInput } from "./plan";
import type { Certainty } from "./report";
import type { SiteContext } from "./site";

export type Tone = "ok" | "info" | "warn" | "danger" | "muted";
export type FactSource = "国の公開データ" | "条文から算出" | "入力値" | "要確認";

export type Cite = { label: string; url: string };

export type LandFact = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  source: FactSource;
  /** How sure the value is (入力 = as typed by the user, not checked). */
  certainty: Certainty | "入力";
  /** Where the value comes from. Always at least one unless the value is unknown. */
  cites: Cite[];
  link?: Cite;
};

type Draft = Omit<LandFact, "certainty" | "cites">;

const KENKIHO = "325AC0000000201";
const LOW = ["第一種低層住居専用地域", "第二種低層住居専用地域", "田園住居地域"];
const MID = ["第一種中高層住居専用地域", "第二種中高層住居専用地域"];
const RES = ["第一種住居地域", "第二種住居地域", "準住居地域"];
const COMMERCIAL_INDUSTRIAL = ["近隣商業地域", "商業地域", "準工業地域", "工業地域", "工業専用地域"];

/** "60%" / "60" / "６０％" → 60 */
export function parsePercent(v: string | undefined): number | null {
  if (!v) return null;
  const half = v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = half.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** 法52条2項: 前面道路12m未満の容積率上限（%）。住居系 4/10、その他 6/10（特定行政庁の指定で異なる場合あり）。 */
export function roadFarLimit(zoning: PlanInput["zoning"], roadWidth: number | null): number | null {
  if (roadWidth === null || roadWidth >= 12 || zoning === "不明") return null;
  const factor = [...LOW, ...MID, ...RES].includes(zoning) ? 0.4 : 0.6;
  return Math.round(roadWidth * factor * 1000) / 10;
}

export function heightRules(zoning: PlanInput["zoning"]): { value: string; sub: string } | null {
  if (LOW.includes(zoning))
    return { value: "高さ10mまたは12m以下", sub: "北側斜線 5m＋1.25／道路斜線 1.25。日影規制は軒高7m超か3階以上が対象" };
  if (MID.includes(zoning))
    return { value: "北側斜線 10m＋1.25", sub: "道路斜線 1.25／隣地斜線 20m＋1.25。日影規制は高さ10m超が対象（日影の指定区域は北側斜線なし）" };
  if (RES.includes(zoning)) return { value: "道路斜線 1.25", sub: "隣地斜線 20m＋1.25。日影規制は高さ10m超が対象" };
  if (COMMERCIAL_INDUSTRIAL.includes(zoning)) return { value: "道路斜線 1.5", sub: "隣地斜線 31m＋2.5" };
  if (zoning === "用途地域の指定なし") return { value: "道路斜線 1.25か1.5", sub: "隣地斜線 20m＋1.25か31m＋2.5（特定行政庁が区域ごとに指定）" };
  return null;
}

const layer = (site: SiteContext | null, id: string) => site?.layers.find((l) => l.id === id);

export function landFacts(plan: PlanInput, site: SiteContext | null): LandFact[] {
  return draftFacts(plan, site).map((f) => annotate(f, site));
}

const srcCite = (src?: { label: string; url: string; year: string }): Cite[] => (src ? [{ label: `${src.label}${src.year ? `（${src.year}）` : ""}`, url: src.url }] : []);
const law = (article: string, label: string): Cite => ({ label: `建築基準法${label}`, url: lawUrl(KENKIHO, article) });

/**
 * Certainty and sources for each tile. Map data is judged at the geocoded point,
 * so anything measured as a distance (農地・川) or read from a 250m mesh (液状化)
 * is an estimate, and so is everything when only the town could be located.
 */
function annotate(f: Draft, site: SiteContext | null): LandFact {
  const precise = site?.precise !== false;
  const boundary = (id: string) => (layer(site, id)?.features.length ?? 0) > 1;
  const data = (id: string): Pick<LandFact, "certainty" | "cites"> => ({
    certainty: !precise ? "推測" : boundary(id) ? "要確認" : "確定",
    cites: srcCite(layer(site, id)?.source),
  });
  let extra: Pick<LandFact, "certainty" | "cites">;
  if (f.source === "要確認") extra = { certainty: "要確認", cites: [] };
  else if (f.source === "入力値") extra = { certainty: "入力", cites: [] };
  else
    switch (f.key) {
      case "area":
        extra = data("XKT001");
        break;
      case "zoning":
        extra = data("XKT002");
        break;
      case "ratio":
        extra = { ...data("XKT002"), cites: [...data("XKT002").cites, ...(f.link ? [f.link] : [])] };
        break;
      case "height":
        extra = { certainty: data("XKT002").certainty, cites: [law("56", "56条（斜線制限）"), law("55", "55条（絶対高さ）"), { label: "建築基準法 別表第三・第四（道路斜線・日影規制）", url: lawUrl(KENKIHO) }] };
        break;
      case "fire":
        extra = data("XKT014");
        break;
      case "farm":
        extra = { certainty: "推測", cites: [{ label: FUDE_SOURCE.label, url: FUDE_SOURCE.url }] };
        break;
      case "water":
        extra = { certainty: "推測", cites: [{ label: GSI_VT_SOURCE.label, url: GSI_VT_SOURCE.url }] };
        break;
      case "flood":
        extra = data("XKT026");
        break;
      case "dosha":
        extra = data("XKT029");
        break;
      case "ekijo":
        extra = { certainty: "推測", cites: srcCite(layer(site, "XKT025")?.source) };
        break;
      case "plan": {
        // 地区計画 is read directly; 居住誘導区域の外 is inferred from the 立地適正化計画 layer, so it stays 要確認.
        const kc = layer(site, "XKT023")?.status === "hit";
        extra = { certainty: kc ? data("XKT023").certainty : "要確認", cites: [...srcCite(layer(site, kc ? "XKT023" : "XKT003")?.source)] };
        break;
      }
      default:
        extra = { certainty: "要確認", cites: f.link ? [f.link] : [] };
    }
  // Nothing is shown as 確定 without a source to check it against.
  if (extra.certainty === "確定" && extra.cites.length === 0) extra = { ...extra, certainty: "要確認" };
  return { ...f, ...extra };
}

function draftFacts(plan: PlanInput, site: SiteContext | null): Draft[] {
  const facts: Draft[] = [];
  const auto = Boolean(site?.apiAvailable);
  const fromData = (v: string | undefined) => (auto && v ? "国の公開データ" : "入力値") as FactSource;

  // 区域区分
  const area = plan.areaDivision;
  facts.push({
    key: "area",
    label: "区域区分",
    value: area === "不明" ? "不明" : area,
    sub:
      area === "市街化調整区域"
        ? "原則として建築できない区域。許可の条件に当てはまるかが最初の関門"
        : area === "市街化区域"
          ? "建築を進める区域"
          : area === "不明"
            ? "都市計画課で確認"
            : undefined,
    tone: area === "市街化調整区域" ? "danger" : area === "不明" ? "muted" : "ok",
    source: area === "不明" ? "要確認" : fromData(site?.derived.areaDivision),
  });

  // 用途地域
  const z = plan.zoning;
  facts.push({
    key: "zoning",
    label: "用途地域",
    value: z === "不明" ? "不明" : z,
    sub: z === "工業専用地域" ? "住宅は建てられません" : z === "不明" ? "都市計画図で確認" : undefined,
    tone: z === "工業専用地域" ? "danger" : z === "不明" ? "muted" : "info",
    source: z === "不明" ? "要確認" : fromData(site?.derived.zoning),
  });

  // 建蔽率・容積率
  const kenpei = parsePercent(site?.derived.kenpei);
  const yoseki = parsePercent(site?.derived.yoseki);
  const roadLimit = roadFarLimit(z, plan.roadWidth);
  const effYoseki = yoseki !== null && roadLimit !== null ? Math.min(yoseki, roadLimit) : yoseki;
  const subs: string[] = [];
  if (roadLimit !== null && yoseki !== null && roadLimit < yoseki) subs.push(`前面道路${plan.roadWidth}mで容積率は${roadLimit}%まで`);
  if (plan.siteArea !== null && kenpei !== null && effYoseki !== null)
    subs.push(`敷地${plan.siteArea}㎡なら建築面積${Math.floor((plan.siteArea * kenpei) / 100)}㎡・延べ${Math.floor((plan.siteArea * effYoseki) / 100)}㎡まで（目安）`);
  else if (kenpei !== null) subs.push("敷地面積を入れると上限面積の目安を出します");
  facts.push({
    key: "ratio",
    label: "建蔽率／容積率",
    value: kenpei !== null || yoseki !== null ? `${kenpei ?? "—"}%／${yoseki ?? "—"}%` : "不明",
    sub: subs.join("。") || (z === "用途地域の指定なし" ? "用途地域のない区域は特定行政庁が定める値（市の告示で確認）" : "都市計画図で確認"),
    tone: kenpei !== null ? "info" : "muted",
    source: kenpei !== null ? (subs.length && roadLimit !== null ? "条文から算出" : "国の公開データ") : "要確認",
    link: roadLimit !== null && yoseki !== null ? { label: "建築基準法52条", url: lawUrl(KENKIHO, "52") } : undefined,
  });

  // 高さ
  const h = heightRules(z);
  facts.push({
    key: "height",
    label: "高さ制限",
    value: h?.value ?? "用途地域が決まると表示",
    sub: h ? `${h.sub}。高度地区は都市計画図で確認` : undefined,
    tone: h ? (LOW.includes(z) || MID.includes(z) ? "warn" : "info") : "muted",
    source: h ? "条文から算出" : "要確認",
    link: h ? { label: "建築基準法56条", url: lawUrl(KENKIHO, "56") } : undefined,
  });

  // 防火
  const f = plan.fireZone;
  facts.push({
    key: "fire",
    label: "防火指定",
    value: f === "不明" ? "不明" : f,
    sub:
      f === "防火地域" || f === "準防火地域"
        ? "外壁・開口部・屋根に防火仕様が必要"
        : f === "法22条区域"
          ? "屋根の不燃化、延焼のおそれのある外壁"
          : f === "指定なし"
            ? "法22条区域かは市で確認"
            : "建築指導課で確認",
    tone: f === "防火地域" || f === "準防火地域" ? "warn" : f === "不明" ? "muted" : "info",
    source: f === "不明" ? "要確認" : fromData(site?.derived.fireZone),
  });

  // 接道
  const road =
    plan.roadWidth !== null || plan.frontage !== null
      ? `幅員${plan.roadWidth ?? "?"}m・接道${plan.frontage ?? "?"}m`
      : "未確認";
  const roadBad = (plan.frontage !== null && plan.frontage < 2) || (plan.roadWidth !== null && plan.roadWidth < 4);
  facts.push({
    key: "road",
    label: "前面道路",
    value: road,
    sub: roadBad
      ? "接道2m未満か幅員4m未満。セットバックや43条の許可を確認"
      : road === "未確認"
        ? "法上の道路か・幅員・接道長さを現地と道路台帳で確認"
        : "法上の道路の種別は道路台帳で確認",
    tone: roadBad ? "danger" : road === "未確認" ? "muted" : "info",
    source: road === "未確認" ? "要確認" : "入力値",
  });

  // 農地・川
  const sg = plan.signals;
  if (sg.farmland !== "不明")
    facts.push({
      key: "farm",
      label: "農地",
      value: sg.farmland === "敷地が農地の可能性" ? `現況が${sg.farmlandType || "農地"}の可能性` : sg.farmland === "周辺に農地" ? `約${sg.farmlandMeters}m先に${sg.farmlandType}` : "周辺に農地なし",
      sub: sg.farmland === "敷地が農地の可能性" ? "登記が宅地でも農地転用の手続きが要ることがある" : sg.farmland === "周辺に農地" ? "農道・水路・過去の転用許可に注意" : undefined,
      tone: sg.farmland === "敷地が農地の可能性" ? "danger" : sg.farmland === "周辺に農地" ? "warn" : "ok",
      source: "国の公開データ",
    });
  if (sg.waterMeters !== null || sg.waterKind === "なし")
    facts.push({
      key: "water",
      label: "川・水路",
      value: sg.waterMeters === null ? "150m以内になし" : `約${sg.waterMeters}m先`,
      sub: sg.waterMeters === null ? undefined : `${sg.waterKind}${sg.floodRivers.length ? `。近くの川：${sg.floodRivers.map((r) => r.replace(/（.*）/, "")).join("・")}` : ""}`,
      tone: sg.waterMeters === null ? "ok" : sg.waterMeters <= 20 ? "danger" : sg.waterMeters <= 60 ? "warn" : "info",
      source: "国の公開データ",
    });

  // 災害
  if (site?.apiAvailable) {
    const flood = layer(site, "XKT026");
    const dosha = layer(site, "XKT029");
    const ekijo = layer(site, "XKT025");
    const red = dosha?.status === "hit" && dosha.features.some((x) => ["2", "4"].includes(String(x.A33_002)));
    facts.push({
      key: "flood",
      label: "浸水想定（最大規模）",
      value: flood?.status === "hit" ? flood.summary[0]?.replace(/^.*浸水深\s*/, "") ?? "該当" : "区域外",
      sub: flood?.status === "hit" ? (flood.summary.length > 1 ? `ほか${flood.summary.length - 1}河川。床高さ・設備位置に反映` : "床高さ・設備位置に反映") : undefined,
      tone: flood?.status === "hit" ? "warn" : "ok",
      source: "国の公開データ",
    });
    facts.push({
      key: "dosha",
      label: "土砂災害",
      value: dosha?.status === "hit" ? (red ? "特別警戒区域（レッド）" : "警戒区域（イエロー）") : "区域外",
      sub: red ? "構造規制・開発許可の対象" : dosha?.status === "hit" ? "避難計画・がけ側の配置に注意" : undefined,
      tone: red ? "danger" : dosha?.status === "hit" ? "warn" : "ok",
      source: "国の公開データ",
    });
    if (ekijo && ekijo.status !== "skipped")
      facts.push({
        key: "ekijo",
        label: "液状化のしやすさ",
        value: ekijo.status === "hit" ? String(ekijo.features[0]?.note ?? "データあり") : "データなし",
        sub: ekijo.status === "hit" ? `地形区分：${String(ekijo.features[0]?.topographic_classification_name_ja ?? "")}。地盤調査で確認` : undefined,
        tone: ekijo.status === "hit" && /しやすい|やや/.test(String(ekijo.features[0]?.note ?? "")) ? "warn" : "info",
        source: "国の公開データ",
      });
    const kc = layer(site, "XKT023");
    const ritteki = layer(site, "XKT003");
    const outsideKyoju = plan.hazards.includes("立地適正化計画区域（居住誘導区域外の可能性）");
    facts.push({
      key: "plan",
      label: "地区計画・誘導区域",
      value: kc?.status === "hit" ? "地区計画あり" : outsideKyoju ? "居住誘導区域の外" : ritteki?.status === "hit" ? "居住誘導区域内" : "データ上なし",
      sub: kc?.status === "hit" ? kc.summary[0] : outsideKyoju ? "3戸以上の住宅などは届出の対象" : "景観・風致地区・建築協定は市で確認",
      tone: kc?.status === "hit" ? "warn" : outsideKyoju ? "warn" : "info",
      source: "国の公開データ",
    });
  }
  return facts;
}
