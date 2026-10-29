// 建てられる高さの目安（道路と直角な断面）：道路斜線・北側斜線・隣地斜線・絶対高さから、
// 敷地の奥行方向の各位置で建てられる高さの上限を出す。数値は建築基準法56条・55条・別表第三
// （同梱の現行条文で確認）。天空率・日影規制・高度地区・地盤の高低差・道路の反対側の公園等の緩和は
// 扱わないので、結果は計画初期の目安。

import type { PlanInput } from "./plan";

type Group = "低層" | "中高層" | "住居" | "商業" | "工業" | "指定なし";
const GROUP: Partial<Record<PlanInput["zoning"], Group>> = {
  第一種低層住居専用地域: "低層",
  第二種低層住居専用地域: "低層",
  田園住居地域: "低層",
  第一種中高層住居専用地域: "中高層",
  第二種中高層住居専用地域: "中高層",
  第一種住居地域: "住居",
  第二種住居地域: "住居",
  準住居地域: "住居",
  近隣商業地域: "商業",
  商業地域: "商業",
  準工業地域: "工業",
  工業地域: "工業",
  工業専用地域: "工業",
  用途地域の指定なし: "指定なし",
};

/** 別表第三（は）欄：容積率（%）に応じた道路斜線の適用距離（m）。 */
function applyDistance(g: Group, far: number): number {
  if (g === "商業") return far <= 400 ? 20 : far <= 600 ? 25 : far <= 800 ? 30 : far <= 1000 ? 35 : far <= 1100 ? 40 : far <= 1200 ? 45 : 50;
  if (g === "指定なし") return far <= 200 ? 20 : far <= 300 ? 25 : 30;
  return far <= 200 ? 20 : far <= 300 ? 25 : far <= 400 ? 30 : 35;
}

export type EnvelopeInput = {
  zoning: PlanInput["zoning"];
  /** 指定容積率（%）。 */
  far: number;
  /** 前面道路の幅員（m）。 */
  roadWidth: number;
  /** 道路境界線から建物までの後退距離（m）。 */
  setback: number;
  /** 敷地の奥行（道路境界から奥の境界まで、m）。 */
  depth: number;
  /** 道路が敷地のどちら側か。北側斜線の向きに使う。 */
  roadSide: "北" | "南" | "東" | "西";
  /** 低層住専の絶対高さ（10 または 12）。 */
  absHeight?: 10 | 12;
};
export type EnvelopePoint = { x: number; h: number; by: string };
export type Envelope = { points: EnvelopePoint[]; notes: string[]; slope: number; applyDistance: number };

/** x：道路境界からの距離（m）。後退距離より手前は建てない前提。 */
export function envelope(i: EnvelopeInput): Envelope | null {
  const g = GROUP[i.zoning];
  if (!g) return null;
  const slope = g === "商業" || g === "工業" ? 1.5 : g === "指定なし" ? 1.5 : 1.25;
  const L = applyDistance(g, i.far);
  const notes: string[] = [];
  if (g === "指定なし") notes.push("用途地域の指定のない区域の道路斜線（1.25か1.5）・隣地斜線（1.25か2.5）は特定行政庁が定める。ここでは1.5・2.5で計算（愛知県告示第297号の区域と同じ）");
  const out: EnvelopePoint[] = [];
  const step = 0.25;
  for (let x = i.setback; x <= i.depth + 1e-9; x += step) {
    const cands: { h: number; by: string }[] = [];
    // 道路斜線：反対側の道路境界線から（後退距離の分だけ外側に）測る（法56条2項）。適用距離内だけ。
    const dRoad = i.roadWidth + i.setback + x;
    if (i.roadWidth + x <= L) cands.push({ h: slope * dRoad, by: "道路斜線" });
    // 隣地斜線（低層住専は対象外）。奥の境界から。
    const back = i.depth - x;
    if (g !== "低層") cands.push(slope === 1.25 && g !== "指定なし" ? { h: 20 + 1.25 * back, by: "隣地斜線" } : { h: 31 + 2.5 * back, by: "隣地斜線" });
    // 北側斜線（低層・中高層住専）。真北方向の隣地境界線（道路が北なら道路の反対側境界）から。
    if (g === "低層" || g === "中高層") {
      const base = g === "低層" ? 5 : 10;
      const toNorth = i.roadSide === "北" ? i.roadWidth + x : i.roadSide === "南" ? back : null;
      if (toNorth !== null) cands.push({ h: base + 1.25 * toNorth, by: "北側斜線" });
    }
    if (g === "低層") cands.push({ h: i.absHeight ?? 10, by: `絶対高さ${i.absHeight ?? 10}m` });
    const min = cands.reduce((a, b) => (b.h < a.h ? b : a), { h: Infinity, by: "" });
    out.push({ x: Math.round(x * 100) / 100, h: Math.round(min.h * 100) / 100, by: min.by });
  }
  if ((g === "低層" || g === "中高層") && (i.roadSide === "東" || i.roadSide === "西")) notes.push("道路が東西側のときの北側斜線は、敷地の北側の隣地境界から別に確認");
  notes.push("天空率・日影規制・高度地区・地盤の高低差・道路の反対側の公園や水路による緩和は含まない");
  return { points: out, notes, slope, applyDistance: L };
}

/** 高さ h の建物が入る範囲：道路境界から何m後退した位置から、奥へ何mまで連続して入るか。 */
export function fitRange(e: Envelope, h: number): { from: number; length: number } | null {
  const k0 = e.points.findIndex((p) => p.h + 1e-9 >= h);
  if (k0 < 0) return null;
  let k = k0;
  while (k + 1 < e.points.length && e.points[k + 1].h + 1e-9 >= h) k++;
  return { from: e.points[k0].x, length: Math.round((e.points[k].x - e.points[k0].x) * 10) / 10 };
}

/** 後退位置から連続して入る奥行（m）。後退位置で入らなければ 0。 */
export function fitsDepth(e: Envelope, h: number): number {
  const r = fitRange(e, h);
  return r && r.from === e.points[0].x ? r.length : 0;
}
