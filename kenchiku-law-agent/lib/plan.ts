import { z } from "zod";

// Structured description of a building/land plan. Everything except the free
// text is optional: the agent treats "不明" as something to confirm, never as "no".

export const WORK_TYPES = ["新築", "増築", "改築・大規模修繕・模様替", "用途変更", "解体のみ", "造成・土地利用のみ", "未定"] as const;

export const AREA_DIVISIONS = ["市街化区域", "市街化調整区域", "非線引き都市計画区域", "準都市計画区域", "都市計画区域外", "不明"] as const;

export const ZONINGS = [
  "第一種低層住居専用地域",
  "第二種低層住居専用地域",
  "第一種中高層住居専用地域",
  "第二種中高層住居専用地域",
  "第一種住居地域",
  "第二種住居地域",
  "準住居地域",
  "田園住居地域",
  "近隣商業地域",
  "商業地域",
  "準工業地域",
  "工業地域",
  "工業専用地域",
  "用途地域の指定なし",
  "不明",
] as const;

export const FIRE_ZONES = ["防火地域", "準防火地域", "法22条区域", "指定なし", "不明"] as const;

export const ROAD_TYPES = [
  "建築基準法上の道路（42条1項）",
  "2項道路（幅員4m未満の既存道）",
  "位置指定道路（42条1項5号）",
  "道路に該当しない・不明（通路・農道・水路等）",
  "不明",
] as const;

export const LAND_CATEGORIES = ["宅地", "田・畑（農地）", "山林", "雑種地", "その他", "不明"] as const;

export const YES_NO_UNKNOWN = ["はい", "いいえ", "不明"] as const;

export const HAZARDS = [
  "土砂災害警戒区域（イエロー）",
  "土砂災害特別警戒区域（レッド）",
  "急傾斜地崩壊危険区域",
  "地すべり防止区域",
  "浸水想定区域",
  "宅地造成等工事規制区域",
  "特定盛土等規制区域",
  "地区計画の区域",
  "景観計画区域・景観地区",
  "周知の埋蔵文化財包蔵地",
  "土地区画整理事業の施行地区",
  "生産緑地地区",
  "河川区域・河川保全区域",
  "自然公園（国立・国定・県立）",
  "高度地区",
  "密集市街地（防災街区整備地区計画）",
  "都市計画道路・都市計画施設の区域",
  "災害危険区域（条例）",
  "大規模盛土造成地",
  "立地適正化計画区域（居住誘導区域外の可能性）",
] as const;

export const BUILDING_USES = [
  "専用住宅",
  "兼用住宅（店舗・事務所併用）",
  "長屋",
  "共同住宅・寄宿舎",
  "事務所",
  "店舗・飲食店",
  "工場・作業場・倉庫",
  "宿泊施設（旅館・ホテル・民泊）",
  "福祉施設・保育所・児童福祉施設",
  "病院・診療所",
  "自動車車庫・修理工場",
  "学校・集会場",
  "その他",
  "未定",
] as const;

export const STRUCTURES = ["木造", "鉄骨造", "RC造・SRC造", "その他・混構造", "未定"] as const;

export const EXTRAS = [
  "エレベーター設置",
  "浄化槽（下水道なし）",
  "井戸・上水道の新規引込み",
  "高さ2m超の擁壁・崖に近接",
  "屋外広告物・看板",
  "太陽光発電設備",
  "民泊・宿泊利用の予定",
  "境界未確定・越境あり",
  "私道に接する",
  "高さ2m超の門・塀",
  "既存不適格建築物あり",
  "旧耐震（1981年以前）の既存建物",
  "既存建物が2006年以前の建築（石綿の可能性）",
  "工事車両の道路使用・乗入れ新設",
] as const;

export const FARMLAND_SIGNALS = ["敷地が農地の可能性", "周辺に農地", "なし", "不明"] as const;

/**
 * Facts read from public map data for the address (not typed by the user).
 * The server recomputes these from the address on every consult.
 */
export const signalsSchema = z.object({
  farmland: z.enum(FARMLAND_SIGNALS).default("不明"),
  farmlandType: z.enum(["田", "畑", ""]).default(""),
  farmlandMeters: z.number().nullable().default(null),
  waterMeters: z.number().nullable().default(null),
  waterKind: z.string().max(60).default(""),
  floodRivers: z.array(z.string().max(80)).max(10).default([]),
});
export type Signals = z.infer<typeof signalsSchema>;
export const EMPTY_SIGNALS: Signals = { farmland: "不明", farmlandType: "", farmlandMeters: null, waterMeters: null, waterKind: "", floodRivers: [] };

const num = z.coerce.number().nonnegative().max(1_000_000).nullable();
const text = (max: number) => z.string().trim().max(max);

export const planSchema = z.object({
  description: text(4000).min(5, "計画の概要を入力してください"),
  landInfo: text(6000).default(""),
  address: text(200).default(""),
  workType: z.enum(WORK_TYPES).default("新築"),
  areaDivision: z.enum(AREA_DIVISIONS).default("不明"),
  zoning: z.enum(ZONINGS).default("不明"),
  fireZone: z.enum(FIRE_ZONES).default("不明"),
  siteArea: num.default(null),
  roadType: z.enum(ROAD_TYPES).default("不明"),
  roadWidth: num.default(null),
  frontage: num.default(null),
  landCategory: z.enum(LAND_CATEGORIES).default("不明"),
  farmlandBlue: z.enum(YES_NO_UNKNOWN).default("不明"),
  hazards: z.array(z.enum(HAZARDS)).default([]),
  buildingUse: z.enum(BUILDING_USES).default("専用住宅"),
  structure: z.enum(STRUCTURES).default("木造"),
  floors: z.coerce.number().int().min(0).max(100).nullable().default(null),
  height: num.default(null),
  totalFloorArea: num.default(null),
  buildingArea: num.default(null),
  fillHeight: num.default(null),
  cutHeight: num.default(null),
  earthworkArea: num.default(null),
  demolitionArea: num.default(null),
  contractAmountMan: num.default(null),
  extras: z.array(z.enum(EXTRAS)).default([]),
  signals: signalsSchema.default(EMPTY_SIGNALS),
});

export type PlanInput = z.infer<typeof planSchema>;
export type PlanFormInput = z.input<typeof planSchema>;

export const EMPTY_PLAN: PlanInput = {
  description: "",
  landInfo: "",
  address: "",
  workType: "新築",
  areaDivision: "不明",
  zoning: "不明",
  fireZone: "不明",
  siteArea: null,
  roadType: "不明",
  roadWidth: null,
  frontage: null,
  landCategory: "不明",
  farmlandBlue: "不明",
  hazards: [],
  buildingUse: "専用住宅",
  structure: "木造",
  floors: null,
  height: null,
  totalFloorArea: null,
  buildingArea: null,
  fillHeight: null,
  cutHeight: null,
  earthworkArea: null,
  demolitionArea: null,
  contractAmountMan: null,
  extras: [],
  signals: EMPTY_SIGNALS,
};

/** Renders the structured plan as a compact, stable block for the model. */
export function planToText(p: PlanInput): string {
  const n = (v: number | null, unit: string) => (v === null ? "未入力" : `${v}${unit}`);
  return [
    `# 計画の概要（担当者の記述）`,
    p.description,
    ``,
    `# 土地の情報（登記・公図・都市計画情報などの貼り付け）`,
    p.landInfo || "（未入力）",
    ``,
    `# 構造化入力`,
    `- 所在地：${p.address || "未入力"}`,
    `- 工事種別：${p.workType}`,
    `- 区域区分：${p.areaDivision}`,
    `- 用途地域：${p.zoning}`,
    `- 防火指定：${p.fireZone}`,
    `- 敷地面積：${n(p.siteArea, "㎡")}`,
    `- 前面道路の種別：${p.roadType}／幅員：${n(p.roadWidth, "m")}／接道長さ：${n(p.frontage, "m")}`,
    `- 地目：${p.landCategory}／農用地区域（青地）：${p.farmlandBlue}`,
    `- 該当する区域・指定：${p.hazards.length ? p.hazards.join("、") : "入力なし（未確認の可能性あり）"}`,
    `- 建物用途：${p.buildingUse}／構造：${p.structure}／階数：${p.floors ?? "未入力"}／高さ：${n(p.height, "m")}`,
    `- 延べ面積：${n(p.totalFloorArea, "㎡")}／建築面積：${n(p.buildingArea, "㎡")}`,
    `- 盛土高さ：${n(p.fillHeight, "m")}／切土高さ：${n(p.cutHeight, "m")}／造成面積：${n(p.earthworkArea, "㎡")}`,
    `- 解体する既存建物の床面積：${n(p.demolitionArea, "㎡")}`,
    `- 請負金額（万円）：${n(p.contractAmountMan, "万円")}`,
    `- その他該当事項：${p.extras.length ? p.extras.join("、") : "なし"}`,
    `- 住所から自動判定（地図データ）：農地＝${signalText(p.signals).farmland}／川・水路＝${signalText(p.signals).water}`,
  ].join("\n");
}

export function signalText(sg: Signals): { farmland: string; water: string } {
  const farmland =
    sg.farmland === "敷地が農地の可能性"
      ? `地点が${sg.farmlandType || "農地"}の区画上またはすぐ脇（${sg.farmlandMeters ?? 0}m）＝現況農地の可能性が高い`
      : sg.farmland === "周辺に農地"
        ? `約${sg.farmlandMeters}m先に農地の区画（周辺に田畑）`
        : sg.farmland === "なし"
          ? "周辺60m以内に農地の区画なし"
          : "未判定";
  const water =
    sg.waterMeters === null
      ? sg.waterKind === "なし"
        ? "150m以内に川・水路の表示なし"
        : "未判定"
      : `約${sg.waterMeters}m先に${sg.waterKind || "川・水路"}${sg.floodRivers.length ? `（浸水想定の対象河川：${sg.floodRivers.join("、")}）` : ""}`;
  return { farmland, water };
}

/** Builds a plan from /consult?address=…&description=… (links handed out by the MCP tools). */
export function planFromQuery(q: URLSearchParams): PlanInput | null {
  if (!q.get("address") && !q.get("description")) return null;
  const raw: Record<string, unknown> = {};
  for (const k of ["description", "landInfo", "address", "workType", "buildingUse", "structure", "roadType", "landCategory", "farmlandBlue", "areaDivision", "zoning", "fireZone"]) {
    const v = q.get(k);
    if (v) raw[k] = v;
  }
  for (const k of ["floors", "totalFloorArea", "siteArea", "roadWidth", "frontage", "buildingArea", "height"]) {
    const v = q.get(k);
    if (v && !Number.isNaN(Number(v))) raw[k] = Number(v);
  }
  const extras = q.get("extras");
  if (extras) raw.extras = extras.split(",").filter((e) => (EXTRAS as readonly string[]).includes(e));
  // The form asks for the plan itself; a link with only an address leaves it empty.
  const description = String(raw.description ?? "");
  raw.description = description.length >= 5 ? description : "（計画は未定）";
  const parsed = planSchema.safeParse(raw);
  if (parsed.success) return { ...parsed.data, description };
  return { ...EMPTY_PLAN, address: String(raw.address ?? ""), description, landInfo: String(raw.landInfo ?? "") };
}
