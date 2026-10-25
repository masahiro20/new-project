// お客様対応メモ（営業・スタッフ向け）：お客様によく聞かれる順に、土地のまとめ・自動判定・
// 防火の区分から答えの下書きを作る。専門用語は言い換え、根拠の詳しい話は設計士ビューに任せる。

import { fireClass } from "./designcheck";
import { glance } from "./glance";
import { parsePercent, roadFarLimit, type LandFact } from "./landsummary";
import type { PlanInput } from "./plan";
import type { Finding } from "./rules";

export type SalesQA = { q: string; a: string[]; tone: "ok" | "warn" | "danger" | "info" };

const LOW = ["第一種低層住居専用地域", "第二種低層住居専用地域", "田園住居地域"];

/** 論点タイトルを、お客様に話せる言葉へ（主なものだけ。ほかはタイトルのまま）。 */
const PLAIN: Record<string, string> = {
  "nochi-tenyo": "農地を宅地にする手続き（農地転用の許可・届出）。農業委員会の締切に合わせて数週間〜数か月",
  noshin: "農用地区域（青地）なら除外の手続きが先。半年〜1年かかることがある",
  "chosei-kuiki": "市街化調整区域の建築許可。許可が下りるまで家の計画を確定できない",
  "kaihatsu-kyoka": "開発許可（造成・区画の形を変えるとき）。数か月かかることがある",
  "chiku-keikaku": "地区計画の届出（着工の30日前まで）。建物の形・色のルールがあることも",
  keikan: "景観の届出（着工の30日前まで）。外壁や屋根の色に決まりがあることも",
  maizo: "埋蔵文化財の届出（工事の60日前まで）。試掘が入ると工期が延びることも",
  setback: "道路の中心から2m下がって建てる（セットバック）。その部分は敷地に使えない",
  "toshi-keikaku-doro": "将来の都市計画道路。かかる部分は建物の構造・階数に制限",
  "dosha-red": "土砂災害特別警戒区域。崖側の壁を頑丈にする構造の規制と許可",
  "dosha-yellow": "土砂災害警戒区域。建築の規制はないが、重要事項として説明が必要",
  shinsui: "浸水の想定あり。床の高さ・設備の位置・保険の説明",
  "boka-chiiki": "防火地域・準防火地域の防火仕様（窓・玄関ドア・外壁）",
  morido: "盛土・切土の許可・届出（盛土規制法）",
};

export function salesBrief(plan: PlanInput, facts: LandFact[], findings: Finding[]): SalesQA[] {
  const g = glance(plan, facts);
  const fire = fireClass(plan);
  const fact = (k: string) => facts.find((f) => f.key === k);
  const out: SalesQA[] = [];

  // 1. 建てられるか
  out.push({
    q: "この土地に家は建てられますか？",
    a: [g.verdict.text, ...g.cautions.filter((c) => c.tone === "danger").map((c) => `${c.title}：${c.plain}`)],
    tone: g.verdict.tone === "ok" ? "ok" : g.verdict.tone === "danger" ? "danger" : g.verdict.tone === "warn" ? "warn" : "info",
  });

  // 2. 大きさ
  const kenpei = parsePercent(fact("kenpei")?.value);
  const yoseki = parsePercent(fact("yoseki")?.value.replace(/^指定(\d+)%.*/, "$1%"));
  const size: string[] = [];
  if (kenpei !== null && yoseki !== null) {
    const road = roadFarLimit(plan.zoning, plan.roadWidth);
    const eff = road !== null ? Math.min(yoseki, road) : yoseki;
    size.push(`敷地に対して、建物を建てられる面積は${kenpei}%、延べ床面積は${eff}%まで${road !== null && road < yoseki ? `（前面道路${plan.roadWidth}mのため${yoseki}%から下がります）` : ""}。`);
    if (plan.siteArea !== null) size.push(`敷地${plan.siteArea}㎡（約${Math.round(plan.siteArea / 3.30579)}坪）なら、1階の大きさの目安は${Math.floor((plan.siteArea * kenpei) / 100)}㎡、延べ床は${Math.floor((plan.siteArea * eff) / 100)}㎡まで（駐車場・庭も考えると実際はもう少し小さめ）。`);
    else size.push("敷地面積が分かると、何㎡まで建てられるかを計算できます（登記簿・測量図で確認）。");
  } else size.push("建蔽率・容積率がまだ分かっていません。都市計画課で確認すると、建てられる大きさが決まります。");
  if (LOW.includes(plan.zoning)) size.push("高さは10m（または12m）まで。北側の隣地への日当たりの決まりもあり、3階建ては難しいことがあります。");
  else if (plan.zoning !== "不明") size.push("高さは道路や隣地からの斜めの線（斜線制限）で決まります。一般的な2階建てなら支障になりにくい地域です。");
  out.push({ q: "どのくらいの大きさの家が建てられますか？", a: size, tone: kenpei !== null ? "info" : "warn" });

  // 3. 費用
  const cost = g.cautions.filter((c) => c.impacts.includes("費用"));
  out.push({
    q: "普通より費用がかかりそうなことはありますか？",
    a: cost.length
      ? cost.map((c) => `${c.title}：${c.key === "fire" ? fire.plain : c.plain}`)
      : ["データ上、土地の条件で特に費用が上がる要素は見当たりません（地盤・上下水の引込みは調査で確定）。"],
    tone: cost.length ? "warn" : "ok",
  });

  // 4. 期間・手続き
  // Only what adds a permit, notification or consultation to the schedule.
  const slow = findings.filter((f) => !f.rule.routine && f.severity !== "check" && (PLAIN[f.rule.id] || /許可|届出|協議|認定/.test(f.rule.title)) && f.rule.id !== "boka-chiiki");
  out.push({
    q: "建てるまでに時間がかかりそうな手続きはありますか？",
    a: slow.length
      ? slow.slice(0, 5).map((f) => PLAIN[f.rule.id] ?? `${f.rule.title.replace(/（.*?）/g, "")}（${f.rule.agency}）`)
      : ["土地の条件による特別な許可・届出は、今のところ見当たりません。通常の確認申請（審査に最大35日）と完了検査の流れです。"],
    tone: slow.length ? "warn" : "ok",
  });

  // 5. お客様に用意・確認してもらうこと
  const ask: string[] = [];
  if (plan.siteArea === null || plan.landCategory === "不明") ask.push("登記簿謄本（登記事項証明書）・公図・測量図（敷地面積・地目・境界の確認）");
  if (plan.roadType === "不明" || plan.roadWidth === null) ask.push("前面道路の状況（幅・私道かどうか）。分からなければこちらで役所調査します");
  if (plan.workType === "新築" && /解体|建て替え|建替/.test(plan.description)) ask.push("今の建物の図面・建築年（解体・アスベスト調査の段取り）");
  ask.push("上下水道・ガスが敷地に引き込まれているか（検針票やメーターの位置）");
  if (fact("hazard")?.tone === "warn" || facts.some((f) => f.group === "hazard" && (f.tone === "warn" || f.tone === "danger"))) ask.push("ハザードマップの結果を一緒に確認（重要事項として説明）");
  out.push({ q: "お客様に用意・確認してもらうものは？", a: ask, tone: "info" });

  // 6. 社内で次にやること
  const next = [
    ...g.unknowns.slice(0, 3).map((u) => `${u.office}に確認：${u.items.join("・")}`),
    "設計担当に「設計条件チェック」を共有（防火の区分・規模の前提）",
    "必要なら「AIで詳しくチェック」で、お客様の要望（AIに見てほしいこと）への回答を作る",
  ];
  out.push({ q: "社内で次にやること", a: next, tone: "info" });
  return out;
}
