// What to read from each kind of land document, and how it feeds the law check.
// Used by the MCP tool `document_reading_guide` and the server instructions, so
// that Claude (reading the user's Drive files) extracts the facts that change
// the legal outcome instead of summarising the paper.

import { z } from "zod";

export const DOCUMENT_KINDS = ["登記事項証明書", "公図", "地積測量図", "現況測量図", "現地写真", "重要事項説明書・物件資料", "その他"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

type Guide = {
  what: string;
  read: string[];
  /** land_law_check の入力項目への対応 */
  mapsTo: string[];
  redFlags: string[];
  limits: string;
};

export const DOCUMENT_GUIDES: Record<DocumentKind, Guide> = {
  登記事項証明書: {
    what: "登記簿（土地）。表題部・権利部（甲区＝所有権、乙区＝所有権以外の権利）。",
    read: [
      "表題部：所在と地番（住所表示とは別。複数筆なら全部）",
      "表題部：地目（宅地・田・畑・山林・雑種地など）と地積（㎡）",
      "甲区：所有者・共有者、相続登記の有無、仮登記（とくに「条件付所有権移転仮登記（条件 農地法第5条の許可）」）",
      "乙区：抵当権・根抵当権、地役権（通行・用水・送電線など）、地上権・賃借権",
    ],
    mapsTo: ["registered_land_category ← 地目", "site_area ← 地積の合計", "document_facts ← 地番・仮登記・地役権などの要点"],
    redFlags: [
      "地目が田・畑 → 農地法の転用許可・届出（現況が宅地でも要確認）",
      "農地法の許可を条件とする仮登記 → 農地として売買されている",
      "地役権（通行・用水路） → 建物配置・外構に制約",
      "地積が小さい・複数筆 → 最低敷地面積、一団の土地としての扱い",
      "所有者と売主が違う・相続未登記 → 契約・申請の当事者に注意",
    ],
    limits: "登記の地目は現況と違うことがある。法令上の農地かどうかは現況で判断される。",
  },
  公図: {
    what: "法務局の地図（14条地図）または地図に準ずる図面。筆の並びと形を示す。",
    read: [
      "敷地の地番と形（旗竿・不整形）",
      "敷地が道路の地番に接しているか。道路との間に別の細長い土地がないか",
      "地番のない細長い土地：水路（青線）・里道（赤線）。敷地内や境界を通っていないか",
      "隣接地の地番（隣地所有者の確認先）",
    ],
    mapsTo: ["road_type ← 道路に接しているか（不明なら『不明』）", "document_facts ← 水路・里道・旗竿の有無"],
    redFlags: [
      "敷地と道路の間に水路・里道 → 接道（法43条）と占用許可、官民境界の確定",
      "敷地内を水路・里道が通る → 付替え・払下げの手続き",
      "旗竿形状 → 路地状部分の幅・長さ（条例）",
    ],
    limits: "地図に準ずる図面は位置・形状の精度が低い。寸法は測量図で確かめる。",
  },
  地積測量図: {
    what: "分筆・地積更正の際に法務局へ出された測量図。",
    read: ["地積（求積表）", "各辺の長さ、とくに道路に接する辺の長さ", "境界標の種類と位置", "作成年月日（古いものは精度が低い）"],
    mapsTo: ["site_area ← 地積", "frontage ← 道路に接する辺の長さ"],
    redFlags: ["接道長さが2m未満 → 接道義務（法43条）", "作成が古い・境界標の記載がない → 境界確定測量が必要"],
    limits: "高低差や現況の構造物は載っていない。",
  },
  現況測量図: {
    what: "土地家屋調査士・測量士が現地を測った図。高低差・構造物が分かる。",
    read: [
      "前面道路の現況幅員（どこを測ったか）と、道路中心線",
      "接道長さ",
      "道路・隣地との高低差（mm単位の標高差）",
      "擁壁・ブロック塀の位置・高さ・種類",
      "側溝・水路・電柱・マンホール、越境物（屋根・樹木・塀）",
      "既存建物の位置",
    ],
    mapsTo: [
      "road_width ← 現況幅員",
      "frontage ← 接道長さ",
      "extras ← 『高さ2m超の擁壁・崖に近接』『境界未確定・越境あり』など",
      "fill_height / cut_height ← 計画で盛土・切土するなら",
    ],
    redFlags: [
      "道路幅員4m未満 → 2項道路のセットバック（法42条2項）",
      "高低差2m超・擁壁 → がけ条例、盛土規制法、既存擁壁の安全性",
      "越境物・境界標なし → 境界確定と近隣協議",
    ],
    limits: "法上の道路の種別（42条の何号か）は道路台帳・指定道路図でしか確定しない。",
  },
  現地写真: {
    what: "現地の状況写真。法的な判断はできないが、見落としの手がかりになる。",
    read: [
      "前面道路：舗装・側溝・幅の目安・行き止まりか",
      "水路・用水路・川（敷地との間に挟まっていないか）",
      "擁壁・がけ（ブロック積み・間知石・空石積み・ひび割れ・はらみ）",
      "田畑の痕跡（耕作中・水田・畦）",
      "既存建物（古家・物置）、電柱・ゴミ置場、隣家の窓の位置",
    ],
    mapsTo: ["document_facts ← 写真から分かる状況（推測は推測と明記）", "extras ← 擁壁・越境・既存建物など"],
    redFlags: [
      "空石積み・ブロック積みの擁壁 → 既存擁壁の再利用不可の可能性（がけ条例・盛土規制法）",
      "水路が道路と敷地の間 → 接道と橋の占用",
      "現況が耕作地 → 登記が宅地でも農地転用の手続きの可能性",
      "古い建物 → 解体時の石綿事前調査、建設リサイクル法",
    ],
    limits: "写真からは寸法・法的な区分は確定できない。気付いた点を『要確認』として渡す。",
  },
  "重要事項説明書・物件資料": {
    what: "仲介業者の重要事項説明書・物件概要書・販売図面。",
    read: [
      "都市計画（区域区分・用途地域・建蔽率・容積率・防火・高度地区・地区計画）",
      "前面道路（種別：法42条1項何号／2項、幅員、接道長さ、セットバックの要否と面積）",
      "法令制限欄（農地法・盛土規制法・土砂災害・景観・文化財など）",
      "上下水道・ガス（引込みの有無、負担金）、私道負担",
      "ハザード（浸水・土砂）、告知事項",
    ],
    mapsTo: ["road_type / road_width / frontage ← 道路欄", "site_area ← 地積", "document_facts ← 法令制限欄の要点"],
    redFlags: ["『法42条2項道路』→ セットバック", "『私道負担あり』→ 通行・掘削承諾", "『農地法 届出／許可要』→ 転用手続きと時期"],
    limits: "記載誤りもあるので、自動取得した都市計画データと食い違えば窓口で確かめる。",
  },
  その他: {
    what: "建物図面、確認済証・検査済証、境界確認書、ハウスメーカーの計画図など。",
    read: ["既存建物の確認済証・検査済証の有無（既存不適格の判断）", "境界確認書（隣地との合意）", "計画図：配置・階数・延べ面積・高さ"],
    mapsTo: ["work_type / floors / total_floor_area ← 計画図", "extras ← 『既存不適格建築物あり』など"],
    redFlags: ["検査済証がない既存建物 → 増改築・用途変更で現行法への適合調査が必要"],
    limits: "",
  },
};

export function guideToText(kind: DocumentKind | "all"): string {
  const kinds = kind === "all" ? DOCUMENT_KINDS : [kind];
  return kinds
    .map((k) => {
      const g = DOCUMENT_GUIDES[k];
      return [
        `## ${k}`,
        g.what,
        "読むところ：",
        ...g.read.map((x) => `- ${x}`),
        "land_law_check への渡し方：",
        ...g.mapsTo.map((x) => `- ${x}`),
        "見落としやすい点：",
        ...g.redFlags.map((x) => `- ${x}`),
        g.limits ? `注意：${g.limits}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

// ------------------------------------------------------------------ uploads (web UI → agent)


export const UPLOAD_MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
/** Base64 budget for all files together: Vercel rejects request bodies over 4.5 MB. */
export const UPLOAD_TOTAL_BASE64 = 4_200_000;
export const UPLOAD_MAX_FILES = 8;

export const uploadSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      mediaType: z.enum(UPLOAD_MEDIA_TYPES),
      data: z.string().min(1).max(UPLOAD_TOTAL_BASE64),
    }),
  )
  .max(UPLOAD_MAX_FILES)
  .default([])
  .refine((files) => files.reduce((n, f) => n + f.data.length, 0) <= UPLOAD_TOTAL_BASE64, "添付資料の合計が大きすぎます（約3MBまで）。");

export type Upload = z.infer<typeof uploadSchema>[number];
