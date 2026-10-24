// 法令制限確認書の「調べて埋める欄」（高度地区・壁面後退・建築協定・その他地区・接道・給排水）。
// どの値も出どころを持つ：入力（敷地調査の欄）＞ AI調査（AIの詳しいチェックが根拠付きで返した値）
// ＞ データ（国の公開データと条文から言えること）。分からない欄は空欄のまま。
// 画面のプレビューと Excel の両方で使うので、ここはブラウザでも動く形にしておく。

import type { PlanInput } from "./plan";
import type { Certainty } from "./report";
import type { SiteContext } from "./site";
import type { Survey } from "./survey";

export const OWNERS = ["国道", "県道", "市道"] as const;
export const WATERS = ["引込有", "引込無", "要確認"] as const;
export const SEWAGES = ["下水道", "集中浄化槽", "個別浄化槽"] as const;

/** One field as the AI reports it (submit_report の sheet）. */
export type AiSheetField = { value?: string; certainty?: Certainty; source?: string };
export type AiSheet = Partial<
  Record<
    | "heightDistrict"
    | "wallSetback"
    | "buildingAgreement"
    | "otherDistricts"
    | "road1Kou"
    | "road1Gou"
    | "road1Direction"
    | "road1Width"
    | "road1Owner"
    | "road2Kou"
    | "road2Gou"
    | "road2Direction"
    | "road2Width"
    | "road2Owner"
    | "water"
    | "sewage",
    AiSheetField
  >
>;
export type AiSheetKey = keyof AiSheet;

export const AI_SHEET_LABELS: Record<AiSheetKey, string> = {
  heightDistrict: "高度地区",
  wallSetback: "壁面後退",
  buildingAgreement: "建築協定",
  otherDistricts: "その他地区",
  road1Kou: "接道① 42条の項",
  road1Gou: "接道① 号",
  road1Direction: "接道① 方位",
  road1Width: "接道① 幅員",
  road1Owner: "接道① 道路の種類",
  road2Kou: "接道② 42条の項",
  road2Gou: "接道② 号",
  road2Direction: "接道② 方位",
  road2Width: "接道② 幅員",
  road2Owner: "接道② 道路の種類",
  water: "給水",
  sewage: "排水",
};

export type SheetFrom = "入力" | "AI調査" | "データ";
export type SheetValue = { value: string; from: SheetFrom; note?: string };
export type ResolvedSheet = Partial<Record<AiSheetKey, SheetValue>>;

const LOW = ["第一種低層住居専用地域", "第二種低層住居専用地域", "田園住居地域"];

/** An AI value is used only when it is backed by a source (確定・要確認), never a guess. */
function fromAi(f: AiSheetField | undefined, allowed?: readonly string[]): SheetValue | undefined {
  const v = f?.value?.trim();
  if (!v || v === "不明" || f?.certainty === "推測") return undefined;
  if (allowed && !allowed.includes(v)) return undefined;
  return { value: v, from: "AI調査", note: [f?.certainty === "要確認" ? "要確認" : "", f?.source ?? ""].filter(Boolean).join("・") || undefined };
}
const input = (v: string | undefined): SheetValue | undefined => (v?.trim() ? { value: v.trim(), from: "入力" } : undefined);

function roadArticle(plan: PlanInput): { kou: string; gou: string } {
  if (plan.roadType === "建築基準法上の道路（42条1項）") return { kou: "1", gou: "" };
  if (plan.roadType === "位置指定道路（42条1項5号）") return { kou: "1", gou: "5" };
  if (plan.roadType === "2項道路（幅員4m未満の既存道）") return { kou: "2", gou: "" };
  return { kou: "", gou: "" };
}

/** その他地区: what the map data says about the site, short. */
export function dataDistricts(plan: PlanInput, site: SiteContext | null): string[] {
  if (!site?.apiAvailable) return [];
  const hit = (id: string) => site.layers.find((l) => l.id === id)?.status === "hit";
  const first = (id: string) => site.layers.find((l) => l.id === id)?.summary[0] ?? "";
  const out: string[] = [];
  if (hit("XKT023")) out.push(`地区計画（${first("XKT023").split("（")[0]}）`);
  if (plan.hazards.includes("立地適正化計画区域（居住誘導区域外の可能性）")) out.push("居住誘導区域外");
  if (hit("XKT026")) out.push(`洪水浸水想定 ${first("XKT026").replace(/^.*浸水深\s*/, "")}`);
  if (hit("XKT027")) out.push("高潮浸水想定区域");
  if (hit("XKT028")) out.push("津波浸水想定区域");
  if (hit("XKT029")) out.push(site.layers.find((l) => l.id === "XKT029")!.features.some((x) => ["2", "4"].includes(String(x.A33_002))) ? "土砂災害特別警戒区域" : "土砂災害警戒区域");
  if (hit("XKT016")) out.push("災害危険区域");
  if (hit("XKT022")) out.push("急傾斜地崩壊危険区域");
  if (hit("XKT021")) out.push("地すべり防止区域");
  if (hit("XKT020")) out.push("大規模盛土造成地");
  if (hit("XKT030")) out.push("都市計画道路（付近）");
  return out;
}

/**
 * The researched fields of the sheet, each with where it came from.
 * 高度地区 is only set inside 用途地域 (都市計画法8条・9条), and 外壁の後退距離 only in the
 * 低層住居系 zones (建築基準法54条) or by a 地区計画 — so those two can be read off the data.
 */
export function resolveSheet(plan: PlanInput, site: SiteContext | null, survey: Partial<Survey>, ai: AiSheet | null | undefined): ResolvedSheet {
  const a = ai ?? {};
  const r: ResolvedSheet = {};
  const known = site?.apiAvailable && site.precise !== false;
  const kc = site?.layers.find((l) => l.id === "XKT023");

  r.heightDistrict =
    input(survey.heightDistrict) ??
    fromAi(a.heightDistrict) ??
    (known && plan.zoning === "用途地域の指定なし" ? { value: "無", from: "データ", note: "用途地域の指定がない区域には高度地区は定められない" } : undefined);
  r.wallSetback =
    input(survey.wallSetback) ??
    fromAi(a.wallSetback) ??
    (known && kc?.status === "none" && plan.zoning !== "不明" && !LOW.includes(plan.zoning)
      ? { value: "無", from: "データ", note: "低層住居系の用途地域ではなく、地区計画もデータ上なし" }
      : undefined);
  r.buildingAgreement = input(survey.buildingAgreement) ?? fromAi(a.buildingAgreement);

  const data = dataDistricts(plan, site);
  const aiOther = fromAi(a.otherDistricts);
  if (data.length || aiOther)
    r.otherDistricts = {
      value: [...data, ...(aiOther ? [aiOther.value] : [])].join("／"),
      from: aiOther && !data.length ? "AI調査" : "データ",
      note: aiOther ? "AI調査分は要確認" : undefined,
    };

  const art = roadArticle(plan);
  r.road1Kou = art.kou ? { value: art.kou, from: "入力" } : fromAi(a.road1Kou);
  r.road1Gou = art.gou ? { value: art.gou, from: "入力" } : r.road1Kou?.from === "AI調査" ? fromAi(a.road1Gou) : undefined;
  r.road1Direction = input(survey.road1Direction) ?? fromAi(a.road1Direction);
  r.road1Width = plan.roadWidth !== null ? { value: String(plan.roadWidth), from: "入力" } : fromAi(a.road1Width);
  r.road1Owner = input(survey.road1Owner) ?? fromAi(a.road1Owner, OWNERS);
  r.road2Kou = input(survey.road2Kou) ?? fromAi(a.road2Kou);
  r.road2Gou = input(survey.road2Gou) ?? fromAi(a.road2Gou);
  r.road2Direction = input(survey.road2Direction) ?? fromAi(a.road2Direction);
  r.road2Width = input(survey.road2Width) ?? fromAi(a.road2Width);
  r.road2Owner = input(survey.road2Owner) ?? fromAi(a.road2Owner, OWNERS);
  r.water = input(survey.water) ?? fromAi(a.water, WATERS);
  r.sewage = input(survey.sewage) ?? fromAi(a.sewage, SEWAGES);
  for (const k of Object.keys(r) as AiSheetKey[]) if (!r[k]) delete r[k];
  return r;
}

/** 備考に添える一行：どの欄をAI調査・データで埋めたか。 */
export function sheetSourceLine(r: ResolvedSheet): string {
  const by = (from: SheetFrom) =>
    (Object.keys(r) as AiSheetKey[])
      .filter((k) => r[k]?.from === from)
      .map((k) => AI_SHEET_LABELS[k].replace(/^接道① /, "接道"))
      .filter((v, i, all) => all.indexOf(v) === i);
  const ai = by("AI調査");
  const data = by("データ");
  return [ai.length ? `AI調査で記入（窓口で確認）：${ai.join("・")}` : "", data.length ? `国のデータから記入：${data.join("・")}` : ""].filter(Boolean).join("。");
}
