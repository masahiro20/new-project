// 役所調査シート：道路・上下水・ガスは公開データだけでは確定しないので、
// 窓口ごとに「何を聞くか」と、地図からの見込み・市の公開地図を探すリンクをまとめる。

import { roadLine } from "./roads";
import type { PlanInput } from "./plan";
import type { SiteContext } from "./site";

export type OfficeItem = {
  office: string;
  /** 何を確かめるか（窓口でそのまま聞ける形）。 */
  questions: string[];
  /** 地図・国のデータからの見込み（推測）。 */
  hints: string[];
  /** 市の公開地図・台帳を探すリンク。 */
  links: { label: string; url: string }[];
  /** 調べた結果を書く欄（survey のキー）。 */
  memo: "roadNote" | "roadLedgerNote" | "waterNote" | "sewerNote" | "gasNote";
  /** 記入例。 */
  example: string;
};

/** 住所から市区町村名（政令市は区まで）を取り出す。 */
export function cityOf(address: string): { pref: string; city: string; ward: string } {
  const a = address.replace(/\s/g, "");
  const m = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?郡.+?[町村]|.+?市|.+?区|.+?[町村])(.+?区)?/);
  return { pref: m?.[1] ?? "", city: m?.[2] ?? "", ward: m?.[3] && /市$/.test(m[2] ?? "") ? m[3] : "" };
}

const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export function officeCheck(plan: PlanInput, site: SiteContext | null): OfficeItem[] {
  const { pref, city, ward } = cityOf(site?.matched || plan.address);
  const where = `${city}${ward}` || "市町村";
  const s = (term: string) => ({ label: `「${where} ${term}」を探す`, url: search(`${pref}${city} ${term}`) });
  const roads = site?.roads?.status === "ok" ? site.roads.roads : [];
  const roadHints = roads.length
    ? roads.map((r) => `地図上：${roadLine(r)}`)
    : site?.roads?.status === "ok"
      ? ["地図上、半径35m以内に道路の表示なし（旗竿地・通路・私道の可能性）"]
      : [];
  const lp = site?.landPrices?.status === "ok" ? site.landPrices.points[0] : undefined;
  const lpHint = (label: string, v: boolean | null | undefined) =>
    lp && v !== null && v !== undefined ? [`参考：近くの地価公示・調査地点（約${lp.meters}m）は${label}${v ? "あり" : "なし"}`] : [];

  return [
    {
      office: "建築指導課（建築基準法上の道路）",
      questions: [
        "前面道路は建築基準法上の道路か。42条の何項何号か（位置指定なら指定番号・年月日）",
        "2項道路なら、中心線の位置と後退距離。隅切りの要否",
        "接道長さ2m以上を満たすか。満たさない場合、43条2項の認定・許可の見込み",
        "指定道路図・道路判定図の写し（取得できれば添付）",
      ],
      hints: [...roadHints, plan.roadType !== "不明" ? `入力済み：${plan.roadType}` : ""].filter(Boolean),
      links: [s("指定道路図"), s("建築基準法 道路 閲覧")],
      memo: "roadNote",
      example: "例：42条1項1号（市道）。指定道路図で確認（〇月〇日 建築指導課）",
    },
    {
      office: "道路管理課（道路台帳・境界）",
      questions: [
        "認定路線名・路線番号と、台帳上の幅員（認定幅員）",
        "官民境界の確定状況（境界確定図・境界標の有無）",
        "側溝・水路の有無と管理者。車の乗入れ（歩道切下げ）の許可",
      ],
      hints: roads.length ? [`地図上の道路の種類：${[...new Set(roads.map((r) => r.kind))].join("・")}（「等」には私道・農道を含む）`] : [],
      links: [s("道路台帳 閲覧"), s("認定路線網図")],
      memo: "roadLedgerNote",
      example: "例：市道〇〇線・認定幅員6.0m・官民境界確定済み・L型側溝あり",
    },
    {
      office: "上下水道（水道）",
      questions: [
        "前面道路の配水管（本管）の有無・口径・位置",
        "敷地への給水引込の有無と引込口径（13・20・25mm）、メーターの位置",
        "新設・口径変更のときの加入金（分担金）と工事の申込先",
      ],
      hints: lpHint("上水道", lp?.water),
      links: [s("水道 配水管 図面 閲覧"), s("給水装置 加入金")],
      memo: "waterNote",
      example: "例：前面道路に本管φ100、引込φ20あり、メーターは敷地南東",
    },
    {
      office: "上下水道（下水）",
      questions: [
        "公共下水道の供用区域か（供用開始日）。本管の位置・深さ",
        "公共桝の有無と位置（ない場合は設置申請）",
        "受益者負担金（分担金）の納付状況",
        "区域外なら浄化槽の放流先（側溝・水路）と放流の同意・届出の要否",
      ],
      hints: lpHint("下水道", lp?.sewer),
      links: [s("下水道台帳 閲覧"), s("公共下水道 供用区域")],
      memo: "sewerNote",
      example: "例：供用区域内・本管φ200・公共桝あり（南側）・受益者負担金納付済み",
    },
    {
      office: "ガス事業者",
      questions: ["前面道路の都市ガス本管の有無・口径（ない場合はプロパン）", "引込工事の負担の有無"],
      hints: lpHint("都市ガス", lp?.gas),
      links: [s("都市ガス 供給区域")],
      memo: "gasNote",
      example: "例：都市ガス本管あり（前面道路）",
    },
  ];
}
