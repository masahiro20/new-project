// Registry of the laws this agent cites. Law IDs are e-Gov 法令API v2 identifiers,
// resolved from https://laws.e-gov.go.jp/api/2/laws?law_title=... on 2026-10-18.
// `npm run verify-sources` re-resolves every cited article against the live API.

export const LAWS = {
  kenkiho: { id: "325AC0000000201", title: "建築基準法", short: "法" },
  kenkirei: { id: "325CO0000000338", title: "建築基準法施行令", short: "令" },
  kenkikisoku: { id: "325M50004000040", title: "建築基準法施行規則", short: "規則" },
  toshikeikakuho: { id: "343AC0000000100", title: "都市計画法", short: "都計法" },
  toshirei: { id: "344CO0000000158", title: "都市計画法施行令", short: "都計法施行令" },
  toshikisoku: { id: "344M50004000049", title: "都市計画法施行規則", short: "都計法施行規則" },
  nochiho: { id: "327AC0000000229", title: "農地法", short: "農地法" },
  noshinho: { id: "344AC0000000058", title: "農業振興地域の整備に関する法律", short: "農振法" },
  shoboho: { id: "323AC1000000186", title: "消防法", short: "消防法" },
  shoborei: { id: "336CO0000000037", title: "消防法施行令", short: "消防法施行令" },
  shobokisoku: { id: "336M50000008006", title: "消防法施行規則", short: "消防法施行規則" },
  shoeneho: { id: "427AC0000000053", title: "建築物のエネルギー消費性能の向上等に関する法律", short: "建築物省エネ法" },
  moridoho: { id: "336AC0000000191", title: "宅地造成及び特定盛土等規制法", short: "盛土規制法" },
  moridorei: { id: "337CO0000000016", title: "宅地造成及び特定盛土等規制法施行令", short: "盛土規制法施行令" },
  kenchikushiho: { id: "325AC1000000202", title: "建築士法", short: "建築士法" },
  kensetsugyoho: { id: "324AC0000000100", title: "建設業法", short: "建設業法" },
  kensetsugyorei: { id: "331CO0000000273", title: "建設業法施行令", short: "建設業法施行令" },
  keikanho: { id: "416AC0000000110", title: "景観法", short: "景観法" },
  bunkazaiho: { id: "325AC0100000214", title: "文化財保護法", short: "文化財保護法" },
  doshaho: { id: "412AC0000000057", title: "土砂災害警戒区域等における土砂災害防止対策の推進に関する法律", short: "土砂災害防止法" },
  kyukeishaho: { id: "344AC0000000057", title: "急傾斜地の崩壊による災害の防止に関する法律", short: "急傾斜地法" },
  jisuberiho: { id: "333AC0000000030", title: "地すべり等防止法", short: "地すべり等防止法" },
  minpo: { id: "129AC0000000089", title: "民法", short: "民法" },
  takkenho: { id: "327AC1000000176", title: "宅地建物取引業法", short: "宅建業法" },
  kashitanpoho: { id: "419AC0000000066", title: "特定住宅瑕疵担保責任の履行の確保等に関する法律", short: "住宅瑕疵担保履行法" },
  hinkakuho: { id: "411AC0000000081", title: "住宅の品質確保の促進等に関する法律", short: "品確法" },
  minpakuho: { id: "429AC0000000065", title: "住宅宿泊事業法", short: "住宅宿泊事業法" },
  ryokangyoho: { id: "323AC0000000138", title: "旅館業法", short: "旅館業法" },
  kokudoriyoho: { id: "349AC1000000092", title: "国土利用計画法", short: "国土利用計画法" },
  kukakuseiriho: { id: "329AC0000000119", title: "土地区画整理法", short: "土地区画整理法" },
  seisanryokuchiho: { id: "349AC0000000068", title: "生産緑地法", short: "生産緑地法" },
  recycleho: { id: "412AC0000000104", title: "建設工事に係る資材の再資源化等に関する法律", short: "建設リサイクル法" },
  recyclerei: { id: "412CO0000000495", title: "建設工事に係る資材の再資源化等に関する法律施行令", short: "建設リサイクル法施行令" },
  taikiho: { id: "343AC0000000097", title: "大気汚染防止法", short: "大気汚染防止法" },
  soonho: { id: "343AC0000000098", title: "騒音規制法", short: "騒音規制法" },
  shindoho: { id: "351AC0000000064", title: "振動規制法", short: "振動規制法" },
  anzenho: { id: "347AC0000000057", title: "労働安全衛生法", short: "労働安全衛生法" },
  dokoho: { id: "335AC0000000105", title: "道路交通法", short: "道路交通法" },
  doroho: { id: "327AC1000000180", title: "道路法", short: "道路法" },
  kasenho: { id: "339AC0000000167", title: "河川法", short: "河川法" },
  shinrinho: { id: "326AC1000000249", title: "森林法", short: "森林法" },
  jokasoho: { id: "358AC1000000043", title: "浄化槽法", short: "浄化槽法" },
  gesuidoho: { id: "333AC0000000079", title: "下水道法", short: "下水道法" },
  suidoho: { id: "332AC0000000177", title: "水道法", short: "水道法" },
  barrierfreeho: { id: "418AC0000000091", title: "高齢者、障害者等の移動等の円滑化の促進に関する法律", short: "バリアフリー法" },
  barrierfreerei: { id: "418CO0000000379", title: "高齢者、障害者等の移動等の円滑化の促進に関する法律施行令", short: "バリアフリー法施行令" },
  chushajoho: { id: "332AC0000000106", title: "駐車場法", short: "駐車場法" },
  choukiho: { id: "420AC0000000087", title: "長期優良住宅の普及の促進に関する法律", short: "長期優良住宅法" },
  kokuho: { id: "327AC0000000231", title: "航空法", short: "航空法" },
  dempaho: { id: "325AC0000000131", title: "電波法", short: "電波法" },
  shizenkoenho: { id: "332AC0000000161", title: "自然公園法", short: "自然公園法" },
  daitenho: { id: "410AC0000000091", title: "大規模小売店舗立地法", short: "大店立地法" },
  kojorichiho: { id: "334AC0000000024", title: "工場立地法", short: "工場立地法" },
  toshiryokuchiho: { id: "348AC0000000072", title: "都市緑地法", short: "都市緑地法" },
  kouyuchiho: { id: "347AC0000000066", title: "公有地の拡大の推進に関する法律", short: "公拡法" },
  taishinho: { id: "407AC0000000123", title: "建築物の耐震改修の促進に関する法律", short: "耐震改修促進法" },
  okugaikokokuho: { id: "324AC0000000189", title: "屋外広告物法", short: "屋外広告物法" },
  missyuho: { id: "409AC0000000049", title: "密集市街地における防災街区の整備の促進に関する法律", short: "密集市街地整備法" },
  toshisaiseiho: { id: "414AC0000000022", title: "都市再生特別措置法", short: "都市再生特措法" },
  nochikisoku: { id: "327M50010000079", title: "農地法施行規則", short: "農地法施行規則" },
  tochikairyoho: { id: "324AC0000000195", title: "土地改良法", short: "土地改良法" },
  fudosantokiho: { id: "416AC0000000123", title: "不動産登記法", short: "不動産登記法" },
} as const;

export type LawKey = keyof typeof LAWS;

export const LAW_KEYS = Object.keys(LAWS) as LawKey[];

const ALIASES: Record<string, LawKey> = {
  建基法: "kenkiho",
  建築基準法施行令: "kenkirei",
  建基令: "kenkirei",
  施行令: "kenkirei",
  建基則: "kenkikisoku",
  建築基準法施行規則: "kenkikisoku",
  施行規則: "kenkikisoku",
  建基法施行規則: "kenkikisoku",
  都計法: "toshikeikakuho",
  都市計画法施行令: "toshirei",
  省エネ法: "shoeneho",
  建築物省エネ法: "shoeneho",
  盛土規制法: "moridoho",
  盛土法: "moridoho",
  消防令: "shoborei",
  士法: "kenchikushiho",
  業法: "kensetsugyoho",
};

export function lawByTitle(title: string): LawKey | undefined {
  const t = title.trim().replace(/\s+/g, "");
  return LAW_KEYS.find((k) => LAWS[k].title === t || LAWS[k].short === t) ?? ALIASES[t];
}

/** "43" -> "第43条", "6_4" -> "第6条の4", "136_2_2" -> "第136条の2の2" */
export function articleLabel(article: string): string {
  const [main, ...branches] = article.split("_");
  return `第${main}条${branches.map((b) => `の${b}`).join("")}`;
}

/** Normalises user-facing forms like "第43条", "43条", "6条の4", "6-4", "6_4" to the API form "6_4". */
export function normalizeArticle(input: string): string | null {
  const s = input
    .trim()
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/^第/, "")
    .replace(/条/g, "_")
    .replace(/の/g, "_")
    .replace(/-/g, "_")
    .replace(/_+$/, "")
    .replace(/_+/g, "_");
  return /^\d+(_\d+)*$/.test(s) ? s : null;
}
