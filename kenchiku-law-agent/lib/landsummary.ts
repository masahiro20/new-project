// 「土地情報まとめ」（1段目）: the land sheet shown before any AI runs, in the
// order the 土地情報確認AIツール used — 基本情報 → 必須チェック12項目 → 災害リスク
// → その他の法令・周辺 → 確認先. The 法令チェック (2段目) builds on top of it.
// Everything here is deterministic — public map data for the address plus the
// statutory numbers below, each read from e-Gov on 2026-10-19:
//   建築基準法52条2項（前面道路幅員×4/10・6/10）, 55条（絶対高さ10m・12m）,
//   56条1項2号・3号（隣地斜線 20m+1.25／31m+2.5、北側斜線 5m／10m+1.25）,
//   別表第三（道路斜線 1.25／1.5）, 別表第四（日影規制の対象建築物）.

import { fireClass } from "./designcheck";
import { lawUrl } from "./egov";
import { FUDE_SOURCE, GSI_VT_SOURCE } from "./nearby";
import type { PlanInput } from "./plan";
import type { Certainty } from "./report";
import type { SiteContext } from "./site";
import { ELEVATION_SOURCE, LANDPRICE_SOURCE } from "./siteextras";
import { ROAD_SOURCE, roadLine } from "./roads";
import { frontageLine, type Frontage } from "./frontage";
import type { Survey } from "./survey";

export type Tone = "ok" | "info" | "warn" | "danger" | "muted";
export type FactSource = "国の公開データ" | "条文から算出" | "入力値" | "要確認";

export type Cite = { label: string; url: string };

export type FactGroup = "basic" | "must" | "hazard" | "other";
export const FACT_GROUPS: { id: FactGroup; title: string; en: string }[] = [
  { id: "basic", title: "基本情報", en: "Basic" },
  { id: "must", title: "必須チェック 12項目", en: "Must check" },
  { id: "hazard", title: "災害リスク（ハザード）", en: "Hazard" },
  { id: "other", title: "その他の法令・周辺", en: "Others" },
];

/** 土地情報確認AIツールの必須チェック項目（この順で必ず出す）。 */
export const MUST_KEYS = ["zoning", "kenpei", "yoseki", "height", "wallSetback", "roadType", "road", "fire", "waterSupply", "sewer", "gas", "hazard"] as const;

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
  group: FactGroup;
  /** 確認先（窓口）。要確認・未確認のときに「どこで確かめるか」。 */
  ask?: string;
};

type Draft = Omit<LandFact, "certainty" | "cites"> & Partial<Pick<LandFact, "certainty" | "cites">>;

/** Optional inputs from the 敷地調査 form (customer side), used when present. */
export type SurveyFacts = Partial<Pick<Survey, "wallSetback" | "heightDistrict" | "water" | "sewage" | "gas" | "roadNote" | "roadLedgerNote" | "waterNote" | "sewerNote" | "gasNote">> & {
  /** 筆の形と道路縁から測った接道の見込み（公図・地番図が引けたとき）。 */
  frontage?: Frontage | null;
};

/** 役所調査の結果を、該当する項目の補足に足す（入力どおり。窓口で聞いた内容として扱う）。 */
const NOTE_OF: Record<string, (s: SurveyFacts) => string> = {
  roadType: (s) => s.roadNote ?? "",
  road: (s) => [s.roadLedgerNote, s.roadNote].filter(Boolean).join("／"),
  waterSupply: (s) => s.waterNote ?? "",
  sewer: (s) => s.sewerNote ?? "",
  gas: (s) => s.gasNote ?? "",
};

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

export function landFacts(plan: PlanInput, site: SiteContext | null, survey: SurveyFacts = {}): LandFact[] {
  return draftFacts(plan, site, survey)
    .map((f) => annotate(f, site))
    .map((f) => {
      const note = NOTE_OF[f.key]?.(survey).trim();
      return note ? { ...f, sub: `役所調査：${note}${f.sub ? `。${f.sub}` : ""}` } : f;
    });
}

/** Facts in display order, grouped. */
export function groupFacts(facts: LandFact[]): { id: FactGroup; title: string; en: string; facts: LandFact[] }[] {
  return FACT_GROUPS.map((g) => ({ ...g, facts: facts.filter((f) => f.group === g.id) })).filter((g) => g.facts.length > 0);
}

/** この土地のポイント: counts and the facts that need attention first. */
export function landPoints(facts: LandFact[]) {
  // The ハザード row only sums up the hazard rows; count those, not the summary.
  const own = facts.filter((f) => f.key !== "hazard" || !facts.some((x) => x.group === "hazard"));
  const danger = own.filter((f) => f.tone === "danger");
  const warn = own.filter((f) => f.tone === "warn");
  const check = own.filter((f) => f.certainty === "要確認" || f.value === "未確認" || f.value.startsWith("未入力"));
  return { danger, warn, check };
}

/** 確認先: which office to ask about which items (only the ones not settled yet). */
export function askList(facts: LandFact[]): { office: string; items: string[] }[] {
  const map = new Map<string, string[]>();
  for (const f of facts) {
    if (!f.ask) continue;
    // Settled (確定) or typed in (入力) and harmless: nothing to ask.
    if ((f.certainty === "確定" || f.certainty === "入力") && f.tone !== "danger" && f.tone !== "warn") continue;
    const list = map.get(f.ask) ?? [];
    list.push(f.label);
    map.set(f.ask, list);
  }
  return [...map.entries()].map(([office, items]) => ({ office, items }));
}

const BOUNDARY_KEY: Record<string, string> = { XKT001: "area_classification_ja", XKT002: "use_area_ja", XKT014: "fire_prevention_ja" };

const srcCite = (src?: { label: string; url: string; year: string }): Cite[] => (src ? [{ label: `${src.label}${src.year ? `（${src.year}）` : ""}`, url: src.url }] : []);
const law = (article: string, label: string): Cite => ({ label: `建築基準法${label}`, url: lawUrl(KENKIHO, article) });

/**
 * Certainty and sources for each tile. Map data is judged at the geocoded point,
 * so anything measured as a distance (農地・川) or read from a 250m mesh (液状化)
 * is an estimate, and so is everything when only the town could be located.
 */
function annotate(f: Draft, site: SiteContext | null): LandFact {
  const precise = site?.precise !== false;
  // Near a boundary when the point falls in more than one *different* designation
  // (several flood rivers or overlapping planning polygons with the same value are not a boundary).
  const boundary = (id: string) => {
    const key = BOUNDARY_KEY[id];
    if (!key) return false;
    const values = new Set((layer(site, id)?.features ?? []).map((x) => String(x[key] ?? "")).filter((v) => !id.startsWith("XKT001") || v.includes("市街化")));
    return values.size > 1;
  };
  const data = (id: string): Pick<LandFact, "certainty" | "cites"> => ({
    certainty: !precise ? "推測" : boundary(id) ? "要確認" : "確定",
    cites: srcCite(layer(site, id)?.source),
  });
  let extra: Pick<LandFact, "certainty" | "cites">;
  if (f.certainty) extra = { certainty: !precise && f.certainty === "確定" ? "推測" : f.certainty, cites: f.cites ?? [] };
  else if (f.source === "要確認") extra = { certainty: "要確認", cites: f.cites ?? [] };
  else if (f.source === "入力値") extra = { certainty: "入力", cites: [] };
  else
    switch (f.key) {
      case "area":
        extra = data("XKT001");
        break;
      case "zoning":
        extra = data("XKT002");
        break;
      case "kenpei":
        extra = data("XKT002");
        break;
      case "yoseki":
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
  const { certainty: _c, cites: _s, ...rest } = f;
  return { ...rest, ...extra };
}

const tsubo = (m2: number) => Math.round((m2 / 3.30578) * 100) / 100;

function draftFacts(plan: PlanInput, site: SiteContext | null, survey: SurveyFacts): Draft[] {
  const facts: Draft[] = [];
  const auto = Boolean(site?.apiAvailable);
  const fromData = (v: string | undefined) => (auto && v ? "国の公開データ" : "入力値") as FactSource;
  const hit = (id: string) => layer(site, id)?.status === "hit";
  const known = (id: string) => {
    const st = layer(site, id)?.status;
    return st === "hit" || st === "none";
  };
  const lp = site?.landPrices?.status === "ok" ? site.landPrices.points[0] : undefined;
  const lpRef = (k: "water" | "sewer" | "gas", name: string) =>
    lp && lp[k] !== null ? `参考：最寄りの地価公示・調査地点（約${lp.meters}m）は${name}${lp[k] ? "あり" : "なし"}` : "";
  const lpCite: Cite[] = lp ? [LANDPRICE_SOURCE] : [];

  // ------------------------------------------------------------ 基本情報
  if (site?.lat != null && site.lon != null)
    facts.push({
      key: "location",
      group: "basic",
      label: "所在・位置",
      value: site.matched ?? site.address,
      sub: `北緯${site.lat.toFixed(5)}・東経${site.lon.toFixed(5)}（住所の代表点。境界は反映していません）`,
      tone: site.precise === false ? "warn" : "info",
      source: "国の公開データ",
      certainty: site.precise === false ? "推測" : "確定",
      cites: [{ label: "国土地理院 住所検索API", url: "https://msearch.gsi.go.jp/address-search/AddressSearch" }],
    });
  if (site?.elevation)
    facts.push({
      key: "elevation",
      group: "basic",
      label: "標高",
      value: `約${site.elevation.meters}m`,
      sub: `代表点の標高${site.elevation.source ? `（${site.elevation.source}）` : ""}。前面道路・隣地との高低差は現地で確認`,
      tone: "info",
      source: "国の公開データ",
      certainty: "推測",
      cites: [ELEVATION_SOURCE],
    });
  const sg = plan.signals;
  const lc = plan.landCategory;
  facts.push({
    key: "landCategory",
    group: "basic",
    label: "地目",
    value: lc !== "不明" ? lc : sg.farmland === "敷地が農地の可能性" ? `登記は未確認（現況は${sg.farmlandType || "農地"}の可能性）` : "登記簿で確認",
    sub:
      lc === "田・畑（農地）" || sg.farmland === "敷地が農地の可能性"
        ? "農地なら転用の手続き（市街化区域は届出、それ以外は許可）。農用地区域（青地）なら先に農振除外"
        : lc === "山林"
          ? "造成・擁壁・がけ条例の有無を確認"
          : "地目・地積・所有者は登記事項証明書で確認",
    tone: lc === "田・畑（農地）" || (lc === "不明" && sg.farmland === "敷地が農地の可能性") ? "warn" : lc === "不明" ? "muted" : "info",
    source: lc !== "不明" ? "入力値" : "要確認",
    ...(lc === "不明" && sg.farmland === "敷地が農地の可能性" ? { certainty: "推測" as const, cites: [{ label: FUDE_SOURCE.label, url: FUDE_SOURCE.url }] } : {}),
    ask: lc === "田・畑（農地）" || sg.farmland === "敷地が農地の可能性" ? "法務局・農業委員会" : "法務局",
  });
  facts.push({
    key: "siteArea",
    group: "basic",
    label: "敷地面積",
    value: plan.siteArea !== null ? `${plan.siteArea}㎡（約${tsubo(plan.siteArea)}坪）` : "未入力",
    sub: plan.siteArea !== null ? "入力値。登記の地積と実測が違うことがある" : "登記簿・測量図の面積を入れると建築面積・延べ面積の上限が出ます",
    tone: plan.siteArea !== null ? "info" : "muted",
    source: plan.siteArea !== null ? "入力値" : "要確認",
    ask: plan.siteArea !== null ? undefined : "法務局",
  });
  for (const [id, key, label] of [
    ["XKT004", "school1", "小学校区"],
    ["XKT005", "school2", "中学校区"],
  ] as const) {
    const l = layer(site, id);
    if (!l || l.status === "skipped") continue;
    facts.push({
      key,
      group: "basic",
      label,
      value: l.status === "hit" ? String(l.features[0]?.[id === "XKT004" ? "A27_004_ja" : "A32_004_ja"] ?? l.summary[0] ?? "該当あり") : l.status === "none" ? "データ上なし" : "取得できず",
      sub: "学区は見直されることがあるため、教育委員会で最新を確認",
      tone: "info",
      source: "国の公開データ",
      certainty: "要確認",
      cites: srcCite(l.source),
    });
  }
  if (site?.landPrices && site.landPrices.status !== "skipped")
    facts.push({
      key: "landPrice",
      group: "basic",
      label: "近隣の地価（参考）",
      value: lp ? `${lp.price || "—"}` : site.landPrices.status === "error" ? "取得できず" : "近くに地点なし",
      sub: lp ? `約${lp.meters}m先の${lp.use || "標準地"}（${lp.location}、${lp.year}${lp.change ? `、対前年${lp.change}` : ""}）。敷地そのものの価格ではありません` : undefined,
      tone: "info",
      source: "国の公開データ",
      certainty: "推測",
      cites: lpCite,
    });

  // ------------------------------------------------------------ 必須チェック 12項目
  const z = plan.zoning;
  facts.push({
    key: "zoning",
    group: "must",
    label: "用途地域",
    value: z === "不明" ? "不明" : z,
    sub: z === "工業専用地域" ? "住宅は建てられません" : z === "不明" ? "都市計画図で確認" : undefined,
    tone: z === "工業専用地域" ? "danger" : z === "不明" ? "muted" : "info",
    source: z === "不明" ? "要確認" : fromData(site?.derived.zoning),
    ask: "都市計画課",
  });

  const kenpei = parsePercent(site?.derived.kenpei);
  const yoseki = parsePercent(site?.derived.yoseki);
  const ratioSrc = site?.derived.ratioSource;
  const f = plan.fireZone;
  const bonus: string[] = [];
  if (f === "防火地域") bonus.push("防火地域の耐火建築物等は+10%");
  else if (f === "準防火地域") bonus.push("準防火地域の耐火・準耐火建築物等は+10%");
  bonus.push("角地指定なら+10%");
  facts.push({
    key: "kenpei",
    group: "must",
    label: "建蔽率",
    value: kenpei !== null ? `${kenpei}%` : "不明",
    sub:
      kenpei !== null
        ? `${ratioSrc ? "用途地域のない区域の値（県の告示）。" : ""}緩和の可能性：${bonus.join("、")}（建築基準法53条3項）`
        : z === "用途地域の指定なし"
          ? "用途地域のない区域は特定行政庁が定める値（市の告示で確認）"
          : "都市計画図で確認",
    tone: kenpei !== null ? "info" : "muted",
    source: kenpei !== null ? "国の公開データ" : "要確認",
    ...(kenpei !== null && ratioSrc ? { certainty: "確定" as const, cites: [ratioSrc] } : {}),
    ask: ratioSrc ? "建築指導課（特定行政庁）" : "都市計画課",
  });

  const roadLimit = roadFarLimit(z, plan.roadWidth);
  const effYoseki = yoseki !== null && roadLimit !== null ? Math.min(yoseki, roadLimit) : yoseki;
  const ysubs: string[] = [];
  if (roadLimit !== null && yoseki !== null && roadLimit < yoseki) ysubs.push(`前面道路${plan.roadWidth}mで${roadLimit}%まで（法52条2項）`);
  if (plan.siteArea !== null && kenpei !== null && effYoseki !== null)
    ysubs.push(`敷地${plan.siteArea}㎡なら建築面積${Math.floor((plan.siteArea * kenpei) / 100)}㎡・延べ${Math.floor((plan.siteArea * effYoseki) / 100)}㎡まで（目安）`);
  else if (yoseki !== null) ysubs.push(plan.roadWidth === null ? "前面道路が12m未満なら幅員×0.4（住居系）か0.6との小さい方。幅員を入れると計算します" : "敷地面積を入れると上限面積の目安を出します");
  facts.push({
    key: "yoseki",
    group: "must",
    label: "容積率",
    value: yoseki !== null ? (roadLimit !== null && roadLimit < yoseki ? `指定${yoseki}%→実効${roadLimit}%` : `${yoseki}%`) : "不明",
    sub: ysubs.join("。") || "都市計画図で確認",
    tone: yoseki !== null ? (roadLimit !== null && roadLimit < yoseki ? "warn" : "info") : "muted",
    source: yoseki !== null ? (roadLimit !== null ? "条文から算出" : "国の公開データ") : "要確認",
    link: roadLimit !== null && yoseki !== null ? { label: "建築基準法52条", url: lawUrl(KENKIHO, "52") } : undefined,
    ...(yoseki !== null && ratioSrc
      ? { certainty: "確定" as const, cites: [ratioSrc, ...(roadLimit !== null ? [{ label: "建築基準法52条", url: lawUrl(KENKIHO, "52") }] : [])] }
      : {}),
    ask: ratioSrc ? "建築指導課（特定行政庁）" : "都市計画課",
  });

  const h = heightRules(z);
  const hd = survey.heightDistrict?.trim();
  const lpHeight = lp?.heightDistrict;
  facts.push({
    key: "height",
    group: "must",
    label: "高さ制限",
    value: h?.value ?? "用途地域が決まると表示",
    sub: h
      ? `${h.sub}。${hd ? `高度地区：${hd}（入力）` : lpHeight ? `近くの地価公示地点に「${lpHeight}」の指定。高度地区を都市計画図で確認` : "高度地区は都市計画図で確認"}`
      : undefined,
    tone: h ? (LOW.includes(z) || MID.includes(z) || lpHeight ? "warn" : "info") : "muted",
    source: h ? "条文から算出" : "要確認",
    link: h ? { label: "建築基準法56条", url: lawUrl(KENKIHO, "56") } : undefined,
    ask: "都市計画課",
  });

  const ws = survey.wallSetback?.trim();
  const kcHit = hit("XKT023");
  facts.push({
    key: "wallSetback",
    group: "must",
    label: "壁面後退",
    value: ws ? ws : kcHit ? "地区計画の区域内" : LOW.includes(z) ? "外壁後退の指定の可能性" : known("XKT002") || z !== "不明" ? "用途地域による定めなし" : "未確認",
    sub: ws
      ? "入力値"
      : kcHit
        ? `${layer(site, "XKT023")?.summary[0] ?? "地区計画"}。壁面の位置・高さ・最低敷地面積・垣柵の定めを計画書で確認`
        : LOW.includes(z)
          ? "低層住居専用地域は都市計画で1mか1.5mの外壁後退が定められていることがある（法54条）"
          : "地区計画・建築協定・景観計画で定める場合があるので市で確認",
    tone: ws ? "info" : kcHit ? "warn" : LOW.includes(z) ? "warn" : "info",
    source: ws ? "入力値" : "要確認",
    cites: kcHit ? srcCite(layer(site, "XKT023")?.source) : LOW.includes(z) ? [law("54", "54条（外壁の後退距離）")] : [],
    ask: "都市計画課",
  });

  const rt = plan.roadType;
  const rw = plan.roadWidth;
  const near = site?.roads?.status === "ok" ? (site.roads.roads[0] ?? null) : null;
  const setback = rt.startsWith("2項") && rw !== null && rw < 4 ? Math.round(((4 - rw) / 2) * 100) / 100 : null;
  facts.push({
    key: "roadType",
    group: "must",
    label: "前面道路の種別",
    value: rt === "不明" ? "未確認" : rt,
    sub:
      rt === "不明"
        ? `${near ? `地図上は${near.direction === "敷地上" ? "" : `${near.direction}側に`}${near.kind}（推測）。` : ""}建築基準法上の道路か（42条の項・号）は指定道路図・道路台帳（建築指導課・道路管理課）で確認`
        : rt.startsWith("道路に該当しない")
          ? "接道義務（幅員4m以上の道路に2m以上）を満たさず原則建築不可。43条2項の許可・認定を確認"
          : rt.startsWith("2項")
            ? `道路中心線から2m後退${setback !== null ? `（現況${rw}mなら約${setback}m）` : ""}。後退部分は敷地面積に入らない`
            : rt.startsWith("位置指定")
              ? "私道の持分・通行掘削承諾の有無を確認"
              : undefined,
    tone: rt.startsWith("道路に該当しない") ? "danger" : rt.startsWith("2項") ? "warn" : rt === "不明" ? "muted" : "info",
    source: rt === "不明" ? "要確認" : "入力値",
    link: rt.startsWith("2項") ? { label: "建築基準法42条2項", url: lawUrl(KENKIHO, "42") } : undefined,
    ask: "建築指導課（道路）",
  });

  const road = rw !== null || plan.frontage !== null ? `幅員${rw ?? "?"}m・接道${plan.frontage ?? "?"}m` : "未確認";
  const roadBad = (plan.frontage !== null && plan.frontage < 2) || (rw !== null && rw < 4);
  const roads = site?.roads?.status === "ok" ? site.roads : null;
  const fr = survey.frontage?.status === "ok" ? survey.frontage : null;
  if (road === "未確認" && (roads || fr) && site?.precise !== false) {
    // No measured width yet: show the map's estimate, clearly as 推測.
    const narrow = (roads?.roads ?? []).some((r) => r.rankWidth === "3m未満") || (fr?.sides ?? []).some((s) => s.rankWidth === "3m未満");
    const short = fr !== null && fr.totalM < 2;
    facts.push({
      key: "road",
      group: "must",
      label: "幅員・接道長さ",
      value: fr?.sides.length
        ? `地図上：接道 約${fr.totalM}m（${fr.sides.map((s) => `${s.direction}側${s.rankWidth ? ` 幅${s.rankWidth}` : ""}`).join("・")}）`
        : near
          ? `地図上：${near.rankWidth ? `幅 ${near.rankWidth}` : near.kind}${near.edgeWidthM !== null ? `（道路縁の間 約${near.edgeWidthM}m）` : ""}`
          : "近くに道路の表示なし",
      sub: [
        fr ? `公図と道路縁から：${frontageLine(fr)}` : "",
        near ? `まわりの道路：${(roads?.roads ?? []).map(roadLine).join("／")}` : roads ? `半径${roads.radius}m以内に地図上の道路がありません。旗竿地・通路・私道の可能性があるので、接道を必ず確認` : "",
        "地図から読んだ見込みで、認定幅員・境界・側溝・2項道路の後退は道路台帳と現地計測で確認",
        short ? "地図上の接道が2m未満。旗竿地の路地幅・接道義務（法43条）を必ず確認" : "",
        narrow ? "幅3m未満の道があり、2項道路（セットバック）の可能性" : "",
      ]
        .filter(Boolean)
        .join("。"),
      tone: short ? "danger" : !near && !fr?.sides.length ? "warn" : narrow ? "warn" : "info",
      source: "国の公開データ",
      certainty: "推測",
      cites: [{ label: ROAD_SOURCE.label, url: ROAD_SOURCE.url }, ...(fr ? [{ label: "法務省 登記所備付地図データ（G空間情報センター）", url: "https://front.geospatial.jp/moj-chizu-xml-download/" }] : [])],
      ask: "現地調査・道路管理課",
    });
  } else
    facts.push({
      key: "road",
      group: "must",
      label: "幅員・接道長さ",
      value: road,
      sub: roadBad
        ? "接道2m未満か幅員4m未満。セットバックや43条の許可を確認"
        : road === "未確認"
          ? "現地で計測するか道路台帳で確認"
          : rw !== null && rw < 12
            ? "幅員12m未満なので容積率に道路幅員の制限がかかる"
            : undefined,
      tone: roadBad ? "danger" : road === "未確認" ? "muted" : "info",
      source: road === "未確認" ? "要確認" : "入力値",
      ask: "現地調査・道路管理課",
    });

  const fc = fireClass(plan);
  facts.push({
    key: "fire",
    group: "must",
    label: "防火地域",
    value: f === "不明" ? "不明" : f,
    sub:
      fc.required !== "要確認" && fc.required !== "なし"
        ? fc.plain
        : f === "防火地域"
          ? "3階以上か延べ100㎡超は耐火建築物等、それ以外は準耐火建築物等。階数・延べ面積を入れると判定"
          : f === "準防火地域"
            ? "2階以下・500㎡以下の木造は延焼のおそれのある部分の外壁・軒裏を防火構造＋開口部に防火設備、3階建て・500㎡超は準耐火建築物等"
            : f === "指定なし"
              ? "法22条区域かは市で確認"
              : "建築指導課で確認",
    tone: f === "防火地域" ? "danger" : f === "準防火地域" ? "warn" : f === "不明" ? "muted" : "info",
    source: f === "不明" ? "要確認" : fromData(site?.derived.fireZone),
    ask: "建築指導課",
  });

  const W: Record<string, string> = { 引込有: "引込あり", 引込無: "引込なし（新設が必要）", 要確認: "未確認" };
  const sw = survey.water ? W[survey.water] : "";
  facts.push({
    key: "waterSupply",
    group: "must",
    label: "上水道",
    value: sw || "未確認",
    sub: sw && sw !== "未確認" ? (survey.water === "引込無" ? "引込工事・加入金を見込む" : "引込の口径（φ13なら増径が要ることが多い）を確認") : ["水道課で給水管・配水管図を照会", lpRef("water", "水道")].filter(Boolean).join("。"),
    tone: survey.water === "引込無" ? "warn" : sw && sw !== "未確認" ? "info" : "muted",
    source: sw && sw !== "未確認" ? "入力値" : "要確認",
    ...(sw && sw !== "未確認" ? {} : { cites: lpCite }),
    ask: "水道課",
  });
  const sewage = survey.sewage;
  facts.push({
    key: "sewer",
    group: "must",
    label: "下水道",
    value: sewage || "未確認",
    sub: sewage
      ? sewage === "個別浄化槽"
        ? "浄化槽の設置スペースと放流先（側溝・水路）、放流同意の要否を確認"
        : "公共桝の有無・位置・深さを確認"
      : ["下水道課で下水道台帳（本管・公共桝）を照会", lpRef("sewer", "下水道")].filter(Boolean).join("。"),
    tone: sewage === "個別浄化槽" ? "warn" : sewage ? "info" : "muted",
    source: sewage ? "入力値" : "要確認",
    ...(sewage ? {} : { cites: lpCite }),
    ask: "下水道課",
  });
  const gas = survey.gas;
  facts.push({
    key: "gas",
    group: "must",
    label: "ガス",
    value: gas || "未確認",
    sub: gas ? (gas === "都市ガス" ? "本管の位置・口径と引込の有無を確認" : undefined) : ["ガス事業者に埋設管を照会", lpRef("gas", "都市ガス")].filter(Boolean).join("。"),
    tone: gas ? "info" : "muted",
    source: gas ? "入力値" : "要確認",
    ...(gas ? {} : { cites: lpCite }),
    ask: "ガス事業者",
  });

  // ハザード（まとめ）: the detail rows follow in the 災害リスク group.
  if (site?.apiAvailable) {
    const flood = layer(site, "XKT026");
    const dosha = layer(site, "XKT029");
    const red = dosha?.status === "hit" && dosha.features.some((x) => ["2", "4"].includes(String(x.A33_002)));
    const named: [string, string][] = [
      ["XKT026", "洪水浸水"],
      ["XKT027", "高潮浸水"],
      ["XKT028", "津波浸水"],
      ["XKT029", red ? "土砂災害（特別警戒）" : "土砂災害"],
      ["XKT016", "災害危険区域"],
      ["XKT022", "急傾斜地崩壊危険区域"],
      ["XKT021", "地すべり防止区域"],
      ["XKT020", "大規模盛土造成地"],
    ];
    const hits = named.filter(([id]) => hit(id));
    const severe = red || hit("XKT016") || hit("XKT022");
    facts.push({
      key: "hazard",
      group: "must",
      label: "ハザード",
      value: hits.length ? hits.map(([, n]) => n).join("・") : "主な災害区域に該当なし",
      sub: hits.length ? `詳細は下の「災害リスク」。${flood?.status === "hit" ? "床の高さ・設備の位置に反映" : "配置・構造・避難を確認"}` : "洪水・高潮・津波・土砂・災害危険区域・急傾斜地・地すべり・大規模盛土のデータで判定",
      tone: severe ? "danger" : hits.length ? "warn" : "ok",
      source: "国の公開データ",
      certainty: site.precise === false ? "推測" : "確定",
      cites: (hits.length ? hits : named.slice(0, 2)).flatMap(([id]) => srcCite(layer(site, id)?.source)).filter((c, i, a) => a.findIndex((x) => x.url === c.url) === i),
      ask: severe ? "建築指導課・土木事務所" : undefined,
    });
  }

  // ------------------------------------------------------------ 災害リスク（詳細）
  if (site?.apiAvailable) {
    const flood = layer(site, "XKT026");
    const dosha = layer(site, "XKT029");
    const ekijo = layer(site, "XKT025");
    const red = dosha?.status === "hit" && dosha.features.some((x) => ["2", "4"].includes(String(x.A33_002)));
    facts.push({
      key: "flood",
      group: "hazard",
      label: "洪水浸水想定（最大規模）",
      value: flood?.status === "hit" ? flood.summary[0]?.replace(/^.*浸水深\s*/, "") ?? "該当" : "区域外",
      sub: flood?.status === "hit" ? (flood.summary.length > 1 ? `ほか${flood.summary.length - 1}河川。床高さ・設備位置に反映` : "床高さ・設備位置に反映") : undefined,
      tone: flood?.status === "hit" ? "warn" : "ok",
      source: "国の公開データ",
    });
    for (const [id, key, label, onHit] of [
      ["XKT027", "highTide", "高潮浸水想定", "床高さ・設備位置に反映"],
      ["XKT028", "tsunami", "津波浸水想定", "避難経路と床高さを確認"],
    ] as const) {
      const l = layer(site, id);
      if (!l || l.status === "skipped") continue;
      facts.push({
        key,
        group: "hazard",
        label,
        value: l.status === "hit" ? "区域内" : l.status === "none" ? "区域外" : "取得できず",
        sub: l.status === "hit" ? `${l.summary[0] ?? ""}。${onHit}` : undefined,
        tone: l.status === "hit" ? "warn" : l.status === "none" ? "ok" : "muted",
        source: "国の公開データ",
        ...(l.status === "error" ? { certainty: "要確認" as const, cites: srcCite(l.source) } : { cites: srcCite(l.source), certainty: "確定" as const }),
        ask: l.status === "hit" ? "防災担当課" : undefined,
      });
    }
    facts.push({
      key: "dosha",
      group: "hazard",
      label: "土砂災害",
      value: dosha?.status === "hit" ? (red ? "特別警戒区域（レッド）" : "警戒区域（イエロー）") : "区域外",
      sub: red ? "構造規制・開発許可の対象" : dosha?.status === "hit" ? "避難計画・がけ側の配置に注意" : undefined,
      tone: red ? "danger" : dosha?.status === "hit" ? "warn" : "ok",
      source: "国の公開データ",
      ask: dosha?.status === "hit" ? "土木事務所（砂防）" : undefined,
    });
    for (const [id, key, label, onHit, tone] of [
      ["XKT016", "disasterZone", "災害危険区域", "条例で建築の制限（床の高さ・構造など）。条例を確認", "danger"],
      ["XKT022", "steepSlope", "急傾斜地崩壊危険区域", "区域内の工事は許可が必要。がけ側の配置・擁壁を確認", "danger"],
      ["XKT021", "landslide", "地すべり防止区域", "区域内の工事は許可が必要", "warn"],
      ["XKT020", "embankment", "大規模盛土造成地", "盛土の上の可能性。地盤調査・擁壁の状況を確認", "warn"],
    ] as const) {
      const l = layer(site, id);
      if (!l || l.status === "skipped") continue;
      facts.push({
        key,
        group: "hazard",
        label,
        value: l.status === "hit" ? "区域内" : l.status === "none" ? "区域外" : "取得できず",
        sub: l.status === "hit" ? `${l.summary[0] ?? ""}。${onHit}` : undefined,
        tone: l.status === "hit" ? tone : l.status === "none" ? "ok" : "muted",
        source: "国の公開データ",
        ...(l.status === "error" ? { certainty: "要確認" as const, cites: srcCite(l.source) } : { cites: srcCite(l.source), certainty: "確定" as const }),
        ask: l.status === "hit" ? (id === "XKT016" ? "建築指導課" : "土木事務所") : undefined,
      });
    }
    if (ekijo && ekijo.status !== "skipped")
      facts.push({
        key: "ekijo",
        group: "hazard",
        label: "液状化のしやすさ",
        value: ekijo.status === "hit" ? String(ekijo.features[0]?.note ?? "データあり") : "データなし",
        sub: ekijo.status === "hit" ? `地形区分：${String(ekijo.features[0]?.topographic_classification_name_ja ?? "")}。地盤調査で確認` : undefined,
        tone: ekijo.status === "hit" && /しやすい|やや/.test(String(ekijo.features[0]?.note ?? "")) ? "warn" : "info",
        source: "国の公開データ",
      });
  }

  // ------------------------------------------------------------ その他の法令・周辺
  const area = plan.areaDivision;
  facts.push({
    key: "area",
    group: "other",
    label: "区域区分",
    value: area === "不明" ? "不明" : area,
    sub:
      area === "市街化調整区域"
        ? "原則として建築できない区域。許可の条件に当てはまるかが最初の関門"
        : area === "市街化区域"
          ? "建築を進める区域"
          : area === "非線引き都市計画区域"
            ? "調整区域のような原則禁止はない。開発許可は3,000㎡以上が対象"
            : area === "不明"
              ? "都市計画課で確認"
              : undefined,
    tone: area === "市街化調整区域" ? "danger" : area === "不明" ? "muted" : "ok",
    source: area === "不明" ? "要確認" : fromData(site?.derived.areaDivision),
    ask: area === "市街化調整区域" ? "開発指導課" : "都市計画課",
  });
  if (site?.apiAvailable) {
    const kc = layer(site, "XKT023");
    const ritteki = layer(site, "XKT003");
    const outsideKyoju = plan.hazards.includes("立地適正化計画区域（居住誘導区域外の可能性）");
    facts.push({
      key: "plan",
      group: "other",
      label: "地区計画・誘導区域",
      value: kc?.status === "hit" ? "地区計画あり" : outsideKyoju ? "居住誘導区域の外" : ritteki?.status === "hit" ? "居住誘導区域内" : "データ上なし",
      sub: kc?.status === "hit" ? kc.summary[0] : outsideKyoju ? "3戸以上の住宅などは届出の対象" : "景観・風致地区・建築協定は市で確認",
      tone: kc?.status === "hit" ? "warn" : outsideKyoju ? "warn" : "info",
      source: "国の公開データ",
      ask: "都市計画課",
    });
    const cpr = layer(site, "XKT030");
    if (cpr && cpr.status !== "skipped")
      facts.push({
        key: "cityRoad",
        group: "other",
        label: "都市計画道路",
        value: cpr.status === "hit" ? "付近にあり（約40m以内）" : cpr.status === "none" ? "付近になし" : "取得できず",
        sub: cpr.status === "hit" ? `${cpr.summary[0] ?? ""}。計画線にかかると法53条の許可（2階以下・地階なし・木造等なら許可）` : undefined,
        tone: cpr.status === "hit" ? "warn" : "ok",
        source: "国の公開データ",
        certainty: cpr.status === "hit" || cpr.status === "error" ? "要確認" : "確定",
        cites: srcCite(cpr.source),
        ask: cpr.status === "hit" ? "都市計画課" : undefined,
      });
    const adv = layer(site, "XKT024");
    if (adv?.status === "hit")
      facts.push({
        key: "advancedUse",
        group: "other",
        label: "高度利用地区",
        value: "区域内",
        sub: `${adv.summary[0] ?? ""}。容積率の最低限度・壁面の位置などを確認`,
        tone: "warn",
        source: "国の公開データ",
        ask: "都市計画課",
        certainty: "確定",
        cites: srcCite(adv.source),
      });
  }
  if (sg.farmland !== "不明")
    facts.push({
      key: "farm",
      group: "other",
      label: "農地",
      value: sg.farmland === "敷地が農地の可能性" ? `現況が${sg.farmlandType || "農地"}の可能性` : sg.farmland === "周辺に農地" ? `約${sg.farmlandMeters}m先に${sg.farmlandType}` : "周辺に農地なし",
      sub: sg.farmland === "敷地が農地の可能性" ? "登記が宅地でも農地転用の手続きが要ることがある" : sg.farmland === "周辺に農地" ? "農道・水路・過去の転用許可に注意" : undefined,
      tone: sg.farmland === "敷地が農地の可能性" ? "danger" : sg.farmland === "周辺に農地" ? "warn" : "ok",
      source: "国の公開データ",
      ask: sg.farmland === "敷地が農地の可能性" ? "農業委員会" : undefined,
    });
  if (sg.waterMeters !== null || sg.waterKind === "なし")
    facts.push({
      key: "water",
      group: "other",
      label: "川・水路",
      value: sg.waterMeters === null ? "150m以内になし" : `約${sg.waterMeters}m先`,
      sub: sg.waterMeters === null ? undefined : `${sg.waterKind}${sg.floodRivers.length ? `。近くの川：${sg.floodRivers.map((r) => r.replace(/（.*）/, "")).join("・")}` : ""}`,
      tone: sg.waterMeters === null ? "ok" : sg.waterMeters <= 20 ? "danger" : sg.waterMeters <= 60 ? "warn" : "info",
      source: "国の公開データ",
      ask: sg.waterMeters !== null && sg.waterMeters <= 20 ? "河川管理者（土木事務所・市の河川課）" : undefined,
    });
  return facts;
}
