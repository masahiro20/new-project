// 答え合わせ：役所調査まで済んだ案件の「正解」と、ツールの自動判定を項目ごとに比べる。
// 入力は CSV（1行1件）。住所だけ使い、お客様の名前などは要らない。

import { frontageForLot } from "./lotfrontage";
import { lookupChiban, municipality } from "./chiban";
import { lookupKozu, splitChiban } from "./kozu";
import { parsePercent } from "./landsummary";
import { lookupSite } from "./site";

import { ACCURACY_COLUMNS } from "./accuracy-columns";

export { ACCURACY_COLUMNS };
type Col = (typeof ACCURACY_COLUMNS)[number];
export type Verdict = "一致" | "不一致" | "判定なし" | "正解なし";
export type CaseResult = { address: string; fields: { field: Col; expected: string; tool: string; verdict: Verdict }[] };

/** CSV → 案件（見出し行があれば列名で、なければ ACCURACY_COLUMNS の順で読む）。 */
export function parseCases(csv: string): Record<Col, string>[] {
  const rows = csv
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  const head = rows[0].includes("住所") ? rows.shift()! : [...ACCURACY_COLUMNS];
  return rows.map((r) => Object.fromEntries(ACCURACY_COLUMNS.map((c) => [c, r[head.indexOf(c)] ?? ""])) as Record<Col, string>);
}

const num = (s: string) => {
  const m = s.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const BAND: Record<string, [number, number]> = { "3m未満": [0, 3], "3m-5.5m未満": [3, 5.5], "5.5m-13m未満": [5.5, 13], "13m-19.5m未満": [13, 19.5], "19.5m以上": [19.5, 99] };

export async function checkCase(c: Record<Col, string>): Promise<CaseResult> {
  const site = await lookupSite(c.住所);
  const d = site.derived;
  const f: CaseResult["fields"] = [];
  const add = (field: Col, tool: string, verdict: (exp: string) => Verdict) => {
    const exp = c[field];
    f.push({ field, expected: exp, tool: tool || "—", verdict: !exp ? "正解なし" : !tool ? "判定なし" : verdict(exp) });
  };
  add("区域区分", d.areaDivision ?? "", (e) => (e.includes(d.areaDivision ?? "?") || (d.areaDivision ?? "").includes(e) ? "一致" : "不一致"));
  add("用途地域", d.zoning ?? "", (e) => (e.replace(/地域$/, "") === (d.zoning ?? "").replace(/地域$/, "") || (e.includes("指定なし") && (d.zoning ?? "").includes("指定なし")) ? "一致" : "不一致"));
  add("防火", d.fireZone ?? "", (e) => {
    const t = d.fireZone ?? "";
    if (e.includes("準防火")) return t === "準防火地域" ? "一致" : "不一致";
    if (e.includes("防火")) return t === "防火地域" ? "一致" : "不一致";
    // 法22条区域は国のデータにないので「指定なし」と出れば一致とみなす
    return t === "指定なし" ? "一致" : "不一致";
  });
  add("建蔽率", d.kenpei ?? "", (e) => (num(e) === parsePercent(d.kenpei) ? "一致" : "不一致"));
  add("容積率", d.yoseki ?? "", (e) => (num(e) === parsePercent(d.yoseki) ? "一致" : "不一致"));
  const road = site.roads?.status === "ok" ? site.roads.roads[0] : undefined;
  add("幅員", road ? `${road.rankWidth}${road.edgeWidthM !== null ? `・縁間${road.edgeWidthM}m` : ""}` : "", (e) => {
    const w = num(e);
    if (w === null || !road) return "判定なし";
    const band = BAND[road.rankWidth];
    return (band && w >= band[0] - 0.3 && w < band[1] + 0.3) || (road.edgeWidthM !== null && Math.abs(road.edgeWidthM - w) <= 1) ? "一致" : "不一致";
  });
  let frontage = "";
  if (c.接道長さ && site.lat !== null && site.lon !== null) {
    try {
      const muni = await municipality(site.lat, site.lon);
      const kozu = muni && splitChiban(c.住所) ? await lookupKozu(c.住所, muni.muniCd) : null;
      const chiban = kozu?.status === "ok" ? null : await lookupChiban(site.lat, site.lon);
      const fr = await frontageForLot(site.lat, site.lon, kozu, chiban);
      if (fr?.status === "ok" && fr.sides.length) frontage = `${fr.totalM}m`;
    } catch {
      // 測れなければ判定なし
    }
  }
  add("接道長さ", frontage, (e) => {
    const w = num(e);
    const t = num(frontage);
    return w === null || t === null ? "判定なし" : Math.abs(w - t) <= Math.max(1.5, w * 0.2) ? "一致" : "不一致";
  });
  const lp = site.landPrices?.status === "ok" ? site.landPrices.points[0] : undefined;
  add("下水", lp && lp.sewer !== null ? (lp.sewer ? "下水道（近くの地価地点）" : "なし（近くの地価地点）") : "", (e) => (/下水/.test(e) === Boolean(lp?.sewer) ? "一致" : "不一致"));
  add("ガス", lp && lp.gas !== null ? (lp.gas ? "都市ガス（近くの地価地点）" : "なし（近くの地価地点）") : "", (e) => (/都市ガス/.test(e) === Boolean(lp?.gas) ? "一致" : "不一致"));
  return { address: c.住所, fields: f };
}

/** 項目ごとの正答率（正解の書かれた件のうち、ツールが判定できた件で）。 */
export function summarize(results: CaseResult[]) {
  return ACCURACY_COLUMNS.filter((c) => c !== "住所").map((field) => {
    const all = results.flatMap((r) => r.fields.filter((x) => x.field === field));
    const hit = all.filter((x) => x.verdict === "一致").length;
    const miss = all.filter((x) => x.verdict === "不一致").length;
    const none = all.filter((x) => x.verdict === "判定なし").length;
    return { field, hit, miss, none, rate: hit + miss ? Math.round((hit / (hit + miss)) * 100) : null };
  });
}
