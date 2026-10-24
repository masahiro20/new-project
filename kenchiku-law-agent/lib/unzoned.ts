// 用途地域の指定のない区域の建蔽率・容積率（特定行政庁が定める値）。
// 今は愛知県告示第297号の (1) の区域だけ。(2) の温泉地区などは区域図で決まるため自動では入れない。

export const AICHI_UNZONED_SOURCE = {
  label: "愛知県告示第297号（用途地域の指定のない区域の容積率・建蔽率）",
  url: "https://www.pref.aichi.jp/uploaded/attachment/607846.pdf",
};

const AICHI_LISTED = [
  "瀬戸市", "半田市", "豊川市", "刈谷市", "安城市", "西尾市", "江南市", "小牧市", "稲沢市", "東海市",
  "津島市", "碧南市", "蒲郡市", "犬山市", "常滑市", "新城市", "大府市", "知多市", "知立市", "尾張旭市",
  "高浜市", "岩倉市", "豊明市", "日進市", "田原市", "愛西市", "清須市", "北名古屋市", "弥富市", "みよし市",
  "あま市", "長久手市", "愛知郡", "西春日井郡", "丹羽郡", "海部郡", "知多郡", "額田郡",
];
// (2) の区域（40%／70% など）。区域図で境界が決まるので、この町名にかかるときは入れずに確認へ回す。
const AICHI_SECTION2 = ["西尾市吉良町", "蒲郡市", "田原市伊良湖町"];

export type UnzonedRatio = { kenpei: string; yoseki: string; source: typeof AICHI_UNZONED_SOURCE };

/** text = 住所・ジオコーディング結果・都市計画データの市町村名を並べたもの。 */
export function unzonedRatio(text: string): UnzonedRatio | null {
  const t = text.replace(/\s/g, "");
  if (!t.includes("愛知県")) return null;
  if (AICHI_SECTION2.some((a) => t.includes(a))) return null;
  if (!AICHI_LISTED.some((m) => t.includes(m))) return null;
  return { kenpei: "60%", yoseki: "200%", source: AICHI_UNZONED_SOURCE };
}
