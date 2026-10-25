// ひと目でわかる（営業・スタッフ向け）：土地のまとめと防火の区分から、
// 「建てられそうか」「お客様に伝える注意点（費用・工期・面積への影響）」「まだ分からないこと」を作る。

import { fireClass } from "./designcheck";
import { askList, type LandFact } from "./landsummary";
import type { PlanInput } from "./plan";

export type Impact = "費用" | "工期" | "面積" | "手続き" | "説明";
export type GlanceCaution = { key: string; title: string; plain: string; impacts: Impact[]; tone: "danger" | "warn" };
export type Glance = {
  /** 区域・用途地域・建蔽率／容積率・防火を一行で。 */
  basics: { label: string; value: string }[];
  verdict: { tone: "ok" | "warn" | "danger" | "muted"; text: string };
  cautions: GlanceCaution[];
  unknowns: { office: string; items: string[] }[];
};

const IMPACT: Record<string, Impact[]> = {
  area: ["工期", "手続き"],
  zoning: ["手続き"],
  farm: ["工期", "手続き"],
  landCategory: ["工期", "手続き"],
  fire: ["費用"],
  roadType: ["面積", "手続き"],
  road: ["面積"],
  height: ["面積"],
  wallSetback: ["面積"],
  plan: ["工期", "手続き"],
  cityRoad: ["面積"],
  flood: ["費用", "説明"],
  highTide: ["費用", "説明"],
  tsunami: ["説明"],
  dosha: ["費用", "説明"],
  steepSlope: ["費用", "手続き"],
  landslide: ["手続き"],
  disasterZone: ["手続き"],
  embankment: ["費用"],
  ekijo: ["費用"],
  waterSupply: ["費用"],
  sewer: ["費用"],
  water: ["手続き"],
};

const v = (facts: LandFact[], key: string) => facts.find((f) => f.key === key);

export function glance(plan: PlanInput, facts: LandFact[]): Glance {
  const val = (key: string) => {
    const f = v(facts, key);
    return f && f.value !== "不明" && f.value !== "未確認" ? f.value : "";
  };
  const basics = [
    { label: "区域", value: val("area") || "未確認" },
    { label: "用途地域", value: val("zoning") || "未確認" },
    { label: "建蔽率／容積率", value: val("kenpei") || val("yoseki") ? `${val("kenpei") || "?"}／${val("yoseki") || "?"}` : "未確認" },
    { label: "防火", value: val("fire") || "未確認" },
    { label: "道路", value: val("roadType") || "未確認" },
  ];

  const fire = fireClass(plan);
  const cautions: GlanceCaution[] = [];
  for (const f of facts) {
    if (f.tone !== "danger" && f.tone !== "warn") continue;
    if (f.key === "hazard" && facts.some((x) => x.group === "hazard" && x.key !== "hazard")) continue;
    const plain = f.key === "fire" && fire.required !== "要確認" ? fire.plain : [f.value, f.sub].filter(Boolean).join("。");
    cautions.push({ key: f.key, title: f.key === "fire" ? f.value : f.label, plain, impacts: IMPACT[f.key] ?? (f.group === "hazard" ? ["説明"] : []), tone: f.tone });
  }
  cautions.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));

  const zoning = plan.zoning;
  const road = plan.roadType;
  const verdict: Glance["verdict"] =
    zoning === "工業専用地域"
      ? { tone: "danger", text: "工業専用地域のため住宅は建てられません" }
      : plan.areaDivision === "市街化調整区域"
        ? { tone: "warn", text: "市街化調整区域：原則として家を建てられない区域。許可が取れるかで計画が決まります" }
        : road === "道路に該当しない・不明（通路・農道・水路等）"
          ? { tone: "warn", text: "建築基準法の道路に接していない可能性。接道が確認できるまで建てられるか決まりません" }
          : plan.hazards.includes("土砂災害特別警戒区域（レッド）")
            ? { tone: "warn", text: "土砂災害特別警戒区域：建てられますが、構造の規制と許可で費用・期間が大きく増えます" }
            : cautions.some((c) => c.tone === "danger")
              ? { tone: "warn", text: "建てられる見込みですが、重大な注意点があります" }
              : basics.some((b) => b.value === "未確認")
                ? { tone: "muted", text: "データ上は建てられる見込み。下の「まだ分からないこと」を窓口で確かめると確定します" }
                : { tone: "ok", text: "データ上は大きな支障なく建てられる見込みです" };

  return { basics, verdict, cautions: cautions.slice(0, 6), unknowns: askList(facts).slice(0, 5) };
}
