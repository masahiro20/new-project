// MCP server (Streamable HTTP, stateless JSON responses) so Claude — claude.ai,
// Claude Desktop, Claude Code — can use this tool from a conversation:
//
//   「ドライブの山田様の土地資料（登記簿・公図・測量図・写真）をもとに法令制限を確認して」
//
// Claude reads the user's files itself (Drive connector, uploads, vision/PDF);
// this server supplies what Claude cannot do reliably on its own: the official
// map data for the address, rule checks whose citations were verified against
// e-Gov, the live statute text, and a guide to what each document must yield.

import { articleToText, resolveLaw } from "./agent";
import { siteUrl } from "./config";
import { DOCUMENT_KINDS, guideToText, type DocumentKind } from "./documents";
import { fetchArticle, keywordSearch } from "./egov";
import { landFacts } from "./landsummary";
import { articleLabel, normalizeArticle } from "./laws";
import { BUILDING_USES, EXTRAS, LAND_CATEGORIES, ROAD_TYPES, STRUCTURES, WORK_TYPES, YES_NO_UNKNOWN, planSchema, type PlanInput } from "./plan";
import { CERTAINTY, CERTAINTY_HELP, CHECKLIST_ITEMS } from "./report";
import { surveySchema } from "./kakuninsho";
import { seal } from "./sealed";
import { CHIBAN_SOURCE, chibanText, lookupChiban, municipality } from "./chiban";
import { KOZU_SOURCE, kozuText, lookupKozu, splitChiban } from "./kozu";
import { SEVERITY_SHORT, citeLabel, citeUrl, groupByAgency, groupByStage, runRules, splitFindings } from "./rules";
import { FUDE_SOURCE, GSI_VT_SOURCE, lookupSite, mergeSiteIntoPlan, type SiteContext } from "./site";

export const SERVER_INFO = { name: "kenchiku-law-agent", title: "建築法令エージェント", version: "1.0.0" };
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const SERVER_INSTRUCTIONS = `建築・土地の法令チェック用のツールです（日本の住宅・建築会社の社内向け）。

使い方の流れ：
1. 敷地の資料（登記事項証明書・公図・地積測量図・現況測量図・現地写真・重要事項説明書など）がドライブやアップロードにあれば、先に開いて読む。何を読むべきかは document_reading_guide で確認する。資料に書いてあることと、推測（写真からの見立てなど）は分けて扱う。
2. 住所（地番しか分からない場合は所在の町名まで）と計画内容、資料から読み取った事実を land_law_check に渡す。住所だけで土地の環境を見たいときは land_summary。
3. 返ってきた「土地のまとめ」「この敷地ならではの論点」「先に聞きに行く窓口」をもとに回答する。条文の数値を書くときは get_law_article で本文を確認する。条例・自治体の運用は自治体の公式ページで確認し、確認できなければ窓口名を示す。
4. 回答は短く：結論（建てられる見込みと最大の論点）→ 見落としチェック（指定12項目を 該当／可能性あり／要確認／該当なし）→ 設計で注意すること → 役所への事前協議（窓口ごと）→ タスク一覧（誰が・いつまでに・何を）→ 資料から読み取ったことと食い違い。最後に結果の app_link を案内し、画面でAIの詳しいチェック・タスク管理・PDF保存ができることを伝える。
5. 法令制限確認書（社内の Excel 書式）や案内図が要るときは make_kakuninsho を呼ぶ。顧客情報はこの会話・ドライブの資料で確かめられたものだけ渡し、分からない項目は省略する（空欄で出る）。
6. 各項目に確実性と出典を必ず付ける。確定＝${CERTAINTY_HELP.確定}（出典が必須）／要確認＝${CERTAINTY_HELP.要確認}／推測＝${CERTAINTY_HELP.推測}。地図データの農地・川までの距離は推測。推測を事実のように書かない。
7. 最終判断は所管窓口と建築士が行う前提で書く。`;

type Json = Record<string, unknown>;
type ToolDef = { name: string; title: string; description: string; inputSchema: Json; annotations?: Json };

const str = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const num = (description: string) => ({ type: "number", description });
const enumOf = (values: readonly string[], description: string) => ({ type: "string", enum: [...values], description });

export const TOOLS: ToolDef[] = [
  {
    name: "land_law_check",
    title: "土地と計画の法令チェック",
    description:
      "住所・計画内容・資料から読み取った事実をもとに、土地のまとめ（区域区分・用途地域・建蔽率／容積率・高さ制限・防火・農地・川・災害）、この敷地ならではの法令上の論点（条文リンク付き）、先に事前協議すべき窓口、見落としチェック項目を返します。登記簿・公図・測量図・写真などがある場合は、読み取った数値や状況を各項目と document_facts に入れてください（入れた値は自動取得より優先されます）。",
    inputSchema: {
      type: "object",
      properties: {
        address: str("敷地の住所（番地まで）。地番しかない場合は町名までと地番を document_facts に"),
        plan: str("何を建てたいか・何をしたいか。例：木造2階建ての自宅（延べ110㎡）。親の畑の一部に建てたい"),
        document_facts: str("資料から読み取った事実のメモ。資料名ごとに。例：登記簿：地目 畑、地積 412㎡、乙区に地役権（通行）。公図：道路との間に水路（青線）。写真：前面道路は舗装4m程度、敷地側に側溝"),
        work_type: enumOf(WORK_TYPES, "工事種別"),
        building_use: enumOf(BUILDING_USES, "建物用途"),
        structure: enumOf(STRUCTURES, "構造"),
        floors: num("階数"),
        total_floor_area: num("延べ面積（㎡）"),
        site_area: num("敷地面積（㎡）。登記簿の地積や測量図の値"),
        road_width: num("前面道路の幅員（m）。現況測量図・重要事項説明書の値"),
        frontage: num("接道長さ（m）。測量図の値"),
        road_type: enumOf(ROAD_TYPES, "前面道路の法上の種別（重要事項説明書・道路台帳で分かれば）"),
        registered_land_category: enumOf(LAND_CATEGORIES, "登記簿の地目（田・畑は『田・畑（農地）』）"),
        farmland_blue: enumOf(YES_NO_UNKNOWN, "農振の農用地区域（青地）か"),
        extras: { type: "array", items: enumOf(EXTRAS, "該当事項"), description: "資料・写真から分かる該当事項" },
      },
      required: ["plan"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "land_summary",
    title: "住所から土地のまとめ",
    description:
      "住所だけで、国の公開データ（国土交通省 都市計画・災害、農林水産省 農地区画、国土地理院 地図）から、区域区分・用途地域・建蔽率／容積率・高さ制限・防火指定・農地・川・水路・浸水・土砂・液状化・地区計画を一覧で返します。計画内容がまだ決まっていないときや、候補地を比べるときに使います。",
    inputSchema: { type: "object", properties: { address: str("敷地の住所（番地まで）") }, required: ["address"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "make_kakuninsho",
    title: "法令制限確認書（Excel）を作る",
    description:
      "社内書式「敷地調査　建築法令制限確認書　Ver1-2」の Excel を作り、ダウンロードリンク（14日有効）と案内図（地図・航空写真）のリンクを返します。都市計画区域・用途地域・建蔽率／容積率・防火・その他地区は住所から自動で入ります。顧客情報（施主名・フリガナ・電話・現住所・担当営業）や接道・地番は、会話やドライブの資料で分かるものだけ入れ、分からなければ省略してください（空欄で出ます）。推測で埋めないでください。",
    inputSchema: {
      type: "object",
      properties: {
        address: str("建築地の住所（番地まで）"),
        plan: str("計画の概要（例：木造2階建ての自宅）。分からなければ省略"),
        sales_rep: str("担当営業の名前"),
        customer_name: str("お施主様名（1人目）"),
        customer_kana: str("フリガナ（1人目）"),
        customer_name2: str("お施主様名（2人目・ご夫婦など）"),
        customer_kana2: str("フリガナ（2人目）"),
        phone: str("電話番号（1人目）"),
        phone2: str("電話番号（2人目）"),
        current_zip: str("現住所の郵便番号"),
        current_address: str("現住所"),
        site_zip: str("建築地の郵便番号"),
        lot: str("該当地（地番・地積・地目）。登記簿から。例：水海道一丁目12番7（地積260㎡・地目 畑）"),
        site_area: num("敷地面積（㎡）"),
        registered_land_category: enumOf(LAND_CATEGORIES, "登記簿の地目"),
        road_type: enumOf(ROAD_TYPES, "前面道路の法上の種別"),
        road_width: num("前面道路の幅員（m）"),
        road_direction: str("接道の方位（例：南）"),
        road_owner: enumOf(["国道", "県道", "市道"], "道路の管理者の種類"),
        second_road_direction: str("2本目の接道の方位（角地など）"),
        second_road_width: str("2本目の道路幅員（m）"),
        height_district: str("高度地区。なければ『無』、分からなければ省略"),
        wall_setback: str("壁面後退（m）。なければ『無』"),
        building_agreement: str("建築協定の名称。なければ『無』"),
        water: enumOf(["引込有", "引込無", "要確認"], "給水の引込み"),
        sewage: enumOf(["下水道", "集中浄化槽", "個別浄化槽"], "排水"),
      },
      required: ["address"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "document_reading_guide",
    title: "資料の読み取りガイド",
    description:
      "登記事項証明書・公図・地積測量図・現況測量図・現地写真・重要事項説明書から、法令チェックのために何を読み取るべきか（読むところ、land_law_check への渡し方、見落としやすい点、資料の限界）を返します。資料を読む前に呼んでください。",
    inputSchema: { type: "object", properties: { kind: enumOf([...DOCUMENT_KINDS, "all"], "資料の種類。まとめて見るなら all") }, required: ["kind"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_law_article",
    title: "条文を取得（e-Gov）",
    description: "e-Gov 法令検索の現行条文を1条分返します。law は法令名か略称（建築基準法・建基令・都計法・農地法・盛土規制法など）か法令ID、article は 43、6_4（第6条の4）などの形式。",
    inputSchema: { type: "object", properties: { law: str("法令名または法令ID"), article: str("条番号") }, required: ["law", "article"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "search_law_text",
    title: "法令の全文検索（e-Gov）",
    description: "キーワードで現行法令の本文を検索し、該当する法令と文を返します。どの法令に規定があるか分からないときに使います。",
    inputSchema: { type: "object", properties: { keyword: str("検索語。例：河川保全区域、住宅用防災機器") }, required: ["keyword"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export const PROMPTS = [
  {
    name: "land_law_check",
    title: "土地資料から法令チェック",
    description: "ドライブ等にある土地資料（登記簿・公図・測量図・写真）と住所から、法令制限・事前協議先・見落としをまとめ、法令制限確認書（Excel）と案内図も作ります。",
    arguments: [
      { name: "customer", description: "お客様名・案件名（例：山田様）", required: false },
      { name: "address", description: "敷地の住所（分かれば）", required: false },
      { name: "plan", description: "何を建てたいか（例：木造2階建ての自宅）", required: false },
    ],
  },
];

function promptText(args: Record<string, string | undefined>): string {
  const who = args.customer ? `「${args.customer}」の案件` : "この案件";
  return [
    `${who}について、建築・土地の法令チェックをしてください。`,
    args.address ? `住所：${args.address}` : "住所は資料から読み取ってください。",
    args.plan ? `計画：${args.plan}` : "計画内容は資料から読み取り、分からなければ『木造2階建ての専用住宅』を仮定して明記してください。",
    "",
    "手順：",
    `1. ドライブ（またはこの会話の添付）から${args.customer ? `「${args.customer}」に関係する` : "この案件の"}土地資料を探して開く（登記事項証明書、公図、地積測量図、現況測量図、現地写真、重要事項説明書など）。`,
    "2. document_reading_guide（kind: all）で読み取る項目を確認し、資料ごとに事実を拾う。資料に書いてあることと推測は分ける。",
    "3. land_law_check に住所・計画・読み取った数値（地積、地目、道路幅員、接道長さなど）と document_facts を渡す。",
    "4. make_kakuninsho で法令制限確認書（Excel）と案内図を作る。顧客情報（施主名・フリガナ・電話・現住所・担当営業）は、この会話やドライブの資料で確かめられたものだけ渡し、分からないものは省略する。",
    "5. 結論 → 見落としチェック12項目 → 設計で注意すること → 役所への事前協議（窓口ごと） → タスク一覧 → 資料同士や自動取得データとの食い違い、の順で短くまとめる。各項目に［確定／要確認／推測］と出典を付ける。最後に確認書のダウンロードリンク・案内図・app_link を案内する。",
  ].join("\n");
}

// ------------------------------------------------------------------ tool impl

function planFromArgs(a: Json): PlanInput {
  const raw = {
    description: String(a.plan ?? "").trim() || "（計画内容の指定なし）",
    landInfo: String(a.document_facts ?? ""),
    address: String(a.address ?? ""),
    workType: a.work_type,
    buildingUse: a.building_use,
    structure: a.structure,
    floors: a.floors ?? null,
    totalFloorArea: a.total_floor_area ?? null,
    siteArea: a.site_area ?? null,
    roadWidth: a.road_width ?? null,
    frontage: a.frontage ?? null,
    roadType: a.road_type,
    landCategory: a.registered_land_category,
    farmlandBlue: a.farmland_blue,
    extras: Array.isArray(a.extras) ? a.extras : [],
  };
  const parsed = planSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)));
  if (!parsed.success) throw new ToolInputError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
  return parsed.data;
}

class ToolInputError extends Error {}

/** Per-request context: the origin the client connected to, used for links back to the web UI. */
export type Ctx = { baseUrl?: string };

export function appLink(plan: PlanInput, baseUrl = siteUrl()): string {
  const q = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "" && v !== "不明") q.set(k, String(v));
  };
  put("address", plan.address);
  put("description", plan.description);
  put("landInfo", plan.landInfo.slice(0, 1500));
  put("workType", plan.workType);
  put("buildingUse", plan.buildingUse);
  put("structure", plan.structure);
  put("floors", plan.floors);
  put("totalFloorArea", plan.totalFloorArea);
  put("siteArea", plan.siteArea);
  put("roadWidth", plan.roadWidth);
  put("frontage", plan.frontage);
  put("roadType", plan.roadType);
  put("landCategory", plan.landCategory);
  put("farmlandBlue", plan.farmlandBlue);
  if (plan.extras.length) q.set("extras", plan.extras.join(","));
  return `${baseUrl.replace(/\/$/, "")}/consult?${q.toString()}`;
}

function siteSection(site: SiteContext | null, plan: PlanInput): string[] {
  if (!site) return ["（住所の指定がないため、土地の自動取得はしていません）"];
  const lines = [`## 土地のまとめ`, `位置：${site.matched ?? "特定できず"}（地図上の代表点。境界は反映していません）`];
  for (const f of landFacts(plan, site))
    lines.push(`- **${f.label}**：${f.value}${f.sub ? `（${f.sub}）` : ""}［${f.certainty}${f.certainty === "入力" ? "" : `・出典：${f.cites.length ? f.cites.map((c) => c.label).join("、") : "なし"}`}］`);
  lines.push(`確実性：${CERTAINTY.map((c) => `${c}＝${CERTAINTY_HELP[c]}`).join("／")}／入力＝入力どおりの値`);
  if (site.derived.notes.length) lines.push("", "注記：", ...site.derived.notes.map((n) => `- ${n}`));
  const srcs = new Map<string, string>();
  for (const l of site.layers) if (l.status === "hit") srcs.set(l.source.url, `${l.source.label}${l.source.year ? `（${l.source.year}）` : ""}`);
  if (site.farmland?.status === "ok") srcs.set(FUDE_SOURCE.url, FUDE_SOURCE.label);
  if (site.water?.status === "ok") srcs.set(GSI_VT_SOURCE.url, GSI_VT_SOURCE.label);
  if (srcs.size) lines.push("", "出典：", ...[...srcs].map(([u, l]) => `- ${l} ${u}`));
  return lines;
}


/** 公図（登記所備付地図）: 住所の地番で引き、無ければ代表点の筆。地目・所有者は含まれない。 */
async function chibanSection(site: SiteContext | null, address = ""): Promise<string[]> {
  if (!site || site.lat === null || site.lon === null) return [];
  const lines = ["", "## 公図（登記所備付地図データ）"];
  let done = false;
  try {
    const muni = await municipality(site.lat, site.lon);
    if (muni && splitChiban(address)) {
      const k = await lookupKozu(address, muni.muniCd);
      lines.push(`- ${kozuText(k)}`);
      if (k.status === "ok") {
        const roads = k.lots.filter((l) => !l.main && /^(道|水|里|堤|溝)/.test(l.chiban)).map((l) => l.chiban);
        const neighbours = k.lots.filter((l) => !l.main).map((l) => l.chiban);
        lines.push(`- 隣接・周辺の地番：${neighbours.slice(0, 30).join("、")}${roads.length ? `（道・水路の地番：${roads.join("、")}）` : ""}`);
        lines.push(`- 出典：${KOZU_SOURCE.label} ${k.dataset?.page ?? KOZU_SOURCE.url}`);
        done = true;
      }
    }
  } catch (e) {
    console.error("kozu in mcp failed", e);
  }
  if (!done) {
    const r = await lookupChiban(site.lat, site.lon);
    lines.push(`- ${chibanText(r)}`, `- 出典：${CHIBAN_SOURCE.label} ${r.dataset?.page ?? CHIBAN_SOURCE.url}`);
  }
  lines.push("- 地目・地積・所有者は登記簿にしかありません：登記情報提供サービス https://www1.touki.or.jp/ （全部事項・公図とも1件300円台）。農地なら eMAFF農地ナビ https://map.maff.go.jp/ で地番・地目・面積を確認できます。");
  return lines;
}

export async function landSummaryTool(args: Json, ctx: Ctx = {}): Promise<string> {
  const address = String(args.address ?? "").trim();
  if (address.length < 3) throw new ToolInputError("address（住所）を入れてください。");
  const site = await lookupSite(address);
  const plan = mergeSiteIntoPlan(planFromArgs({ plan: "（計画は未定）", address }), site);
  return [...siteSection(site, plan), ...(await chibanSection(site, address)), "", `画面で見る：${appLink(plan, ctx.baseUrl)}`].join("\n");
}

export async function landLawCheckTool(args: Json, ctx: Ctx = {}): Promise<string> {
  const input = planFromArgs(args);
  const site = input.address.trim().length >= 3 ? await lookupSite(input.address) : null;
  const plan = mergeSiteIntoPlan(input, site);
  const findings = runRules(plan);
  const { specific, checks, routine } = splitFindings(findings);
  const out: string[] = [...siteSection(site, plan), ...(await chibanSection(site, input.address)), ""];

  if (plan.landInfo.trim()) {
    out.push("## 資料から読み取った事実（入力どおり）", plan.landInfo.trim(), "");
    if (site?.derived.signals.farmland === "敷地が農地の可能性" && plan.landCategory === "宅地")
      out.push("> 食い違い：登記の地目は宅地ですが、農水省の農地区画データでは地点が農地の区画上です。現況が農地なら農地法の手続きが必要です。", "");
  }

  out.push("## この敷地・計画ならではの論点");
  if (specific.length === 0) out.push("（該当なし）");
  for (const { stage, items } of groupByStage(specific)) {
    out.push(`### ${stage}`);
    for (const f of items) {
      out.push(`- **[${SEVERITY_SHORT[f.severity]}] ${f.rule.title}**（窓口：${f.rule.agency}）`);
      out.push(`  ${f.rule.summary}`);
      out.push(`  やること：${f.rule.action}`);
      out.push(`  根拠：${f.rule.cites.map((c) => `[${citeLabel(c)}](${citeUrl(c)})`).join("、")}`);
    }
  }
  out.push("", "## 先に聞きに行く窓口");
  for (const { agency, items } of groupByAgency([...specific, ...checks])) out.push(`- **${agency}**：${items.map((f) => f.rule.title).join("／")}`);
  if (checks.length) {
    out.push("", "## 窓口で確認すること（入力不足・条例次第）");
    for (const f of checks) out.push(`- ${f.rule.title}（${f.rule.agency}）`);
  }
  if (routine.length) out.push("", "## 通常の新築で毎回必要な手続き", routine.map((f) => f.rule.title).join("／"));
  const todo = [...specific, ...checks];
  if (todo.length) {
    out.push("", "## タスク一覧（自動判定から。段階順）");
    for (const { stage, items } of groupByStage(todo))
      for (const f of items) out.push(`- [ ] 【${stage}・${f.rule.roles.join("／")}】${f.rule.action}（窓口：${f.rule.agency}）`);
  }
  out.push(
    "",
    "## 見落としチェック（この12項目を 該当／可能性あり／要確認／該当なし で評価して回答に入れてください）",
    ...CHECKLIST_ITEMS.map((c, i) => `${i + 1}. ${c}`),
    "",
    `画面で開く（AIの詳しいチェックも実行できます）：${appLink(plan, ctx.baseUrl)}`,
    "法令制限確認書（Excel）と案内図が要るときは make_kakuninsho を呼んでください。",
  );
  return out.join("\n");
}


export async function makeKakuninshoTool(args: Json, ctx: Ctx = {}): Promise<string> {
  const address = String(args.address ?? "").trim();
  if (address.length < 3) throw new ToolInputError("address（建築地の住所）を入れてください。");
  const plan = planFromArgs({
    plan: args.plan || "（計画内容の指定なし）",
    address,
    site_area: args.site_area,
    road_width: args.road_width,
    road_type: args.road_type,
    registered_land_category: args.registered_land_category,
  });
  const survey = surveySchema.parse({
    salesRep: args.sales_rep,
    name1: args.customer_name,
    kana1: args.customer_kana,
    name2: args.customer_name2,
    kana2: args.customer_kana2,
    phone1: args.phone,
    phone2: args.phone2,
    currentZip: args.current_zip,
    currentAddress: args.current_address,
    siteZip: args.site_zip,
    lot: args.lot,
    road1Direction: args.road_direction,
    road1Owner: args.road_owner,
    road2Direction: args.second_road_direction,
    road2Width: args.second_road_width,
    heightDistrict: args.height_district,
    wallSetback: args.wall_setback,
    buildingAgreement: args.building_agreement,
    water: args.water,
    sewage: args.sewage,
  });
  const site = await lookupSite(address);
  const merged = mergeSiteIntoPlan(plan, site);
  const base = (ctx.baseUrl ?? siteUrl()).replace(/\/$/, "");
  const token = seal({ plan, survey });
  const filled = Object.entries({ 担当営業: survey.salesRep, お施主様名: survey.name1, フリガナ: survey.kana1, 電話番号: survey.phone1, 現住所: survey.currentAddress, 該当地: survey.lot })
    .map(([k, v]) => `${k}：${v || "（空欄）"}`)
    .join("／");
  const lines = [
    "## 法令制限確認書（Excel）",
    `ダウンロード（14日間有効）：${base}/api/kakuninsho?t=${token}`,
    `入れた顧客情報：${filled}`,
    `自動で入れた項目：都市計画区域（${merged.areaDivision}）・用途地域（${merged.zoning}）・建蔽率／容積率（${site.derived.kenpei ?? "不明"}／${site.derived.yoseki ?? "不明"}）・防火（${merged.fireZone}）・その他地区・備考。国のデータ（住所の代表点）なので、都市計画図・窓口で確認してください。設備・仕様の欄は空のままです。`,
  ];
  if (site.lat !== null && site.lon !== null) {
    const q = (z: number, style: string) => `${base}/api/annai?lat=${site.lat!.toFixed(6)}&lon=${site.lon!.toFixed(6)}&z=${z}&style=${style}&w=1200&h=850`;
    lines.push("", "## 案内図（出典：国土地理院 地理院タイル）", `- 広域（標準地図）：${q(15, "std")}`, `- 周辺（標準地図）：${q(17, "std")}`, `- 航空写真：${q(18, "photo")}`);
  }
  lines.push(...(await chibanSection(site, address)));
  lines.push("", `画面で開く（土地のまとめ・AIの詳しいチェック・PDF）：${appLink(merged, ctx.baseUrl)}`);
  return lines.join("\n");
}

async function getLawArticleTool(args: Json): Promise<string> {
  const lawId = resolveLaw(String(args.law ?? ""));
  if (!lawId) throw new ToolInputError(`法令「${String(args.law)}」が見つかりません。正式名称か法令IDで指定してください（search_law_text で探せます）。`);
  const article = normalizeArticle(String(args.article ?? ""));
  if (!article) throw new ToolInputError("article は 43、6_4 のように指定してください。");
  const a = await fetchArticle(lawId, article);
  if (!a) throw new ToolInputError(`${String(args.law)} ${articleLabel(article)} は見つかりませんでした。`);
  return articleToText(a);
}

async function searchLawTextTool(args: Json): Promise<string> {
  const keyword = String(args.keyword ?? "").trim();
  if (!keyword) throw new ToolInputError("keyword を入れてください。");
  const hits = await keywordSearch(keyword);
  if (hits.length === 0) return "該当はありませんでした。";
  return hits.map((h) => `■ ${h.title}（法令ID ${h.lawId}）${h.url}\n${h.sentences.map((s) => `- ${s}`).join("\n")}`).join("\n\n");
}

export async function callTool(name: string, args: Json, ctx: Ctx = {}): Promise<{ text: string; isError: boolean }> {
  try {
    switch (name) {
      case "land_law_check":
        return { text: await landLawCheckTool(args, ctx), isError: false };
      case "land_summary":
        return { text: await landSummaryTool(args, ctx), isError: false };
      case "make_kakuninsho":
        return { text: await makeKakuninshoTool(args, ctx), isError: false };
      case "document_reading_guide": {
        const kind = String(args.kind ?? "all");
        if (kind !== "all" && !(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new ToolInputError(`kind は ${DOCUMENT_KINDS.join("・")}・all のいずれかです。`);
        return { text: guideToText(kind as DocumentKind | "all"), isError: false };
      }
      case "get_law_article":
        return { text: await getLawArticleTool(args), isError: false };
      case "search_law_text":
        return { text: await searchLawTextTool(args), isError: false };
      default:
        return { text: `不明なツール：${name}`, isError: true };
    }
  } catch (e) {
    if (e instanceof ToolInputError) return { text: e.message, isError: true };
    console.error("mcp tool failed", name, e);
    return { text: `処理に失敗しました（${e instanceof Error ? e.message : "不明なエラー"}）。時間をおいて再度お試しください。`, isError: true };
  }
}

// ------------------------------------------------------------------ JSON-RPC

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Handles one JSON-RPC message. Returns null for notifications. */
export async function handleRpc(msg: RpcRequest, ctx: Ctx = {}): Promise<RpcResponse | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id ?? null, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;
  if (isNotification) return null;
  const p = (msg.params ?? {}) as Json;
  switch (msg.method) {
    case "initialize": {
      const requested = String(p.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(p.name ?? "");
      if (!TOOLS.some((t) => t.name === name)) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const r = await callTool(name, (p.arguments ?? {}) as Json, ctx);
      return ok(msg.id, { content: [{ type: "text", text: r.text }], isError: r.isError });
    }
    case "prompts/list":
      return ok(msg.id, { prompts: PROMPTS });
    case "prompts/get": {
      if (p.name !== "land_law_check") return fail(msg.id, -32602, `Unknown prompt: ${String(p.name)}`);
      const args = (p.arguments ?? {}) as Record<string, string>;
      return ok(msg.id, { description: PROMPTS[0].description, messages: [{ role: "user", content: { type: "text", text: promptText(args) } }] });
    }
    case "resources/list":
      return ok(msg.id, { resources: [] });
    case "resources/templates/list":
      return ok(msg.id, { resourceTemplates: [] });
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
