import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RULES } from "../lib/knowledge";
import { normalizeArticle, articleLabel, lawByTitle } from "../lib/laws";
import { EMPTY_PLAN, planSchema, type PlanInput } from "../lib/plan";
import { runRules } from "../lib/rules";
import { inlineRuns, parseBlocks } from "../lib/markdown";
import { sourceTier } from "../lib/agent";

const plan = (over: Partial<PlanInput>): PlanInput => ({ ...EMPTY_PLAN, description: "テスト計画です。", ...over });
const ids = (p: PlanInput) => new Map(runRules(p).map((f) => [f.rule.id, f.severity]));

test("rule ids are unique and every rule has a citation", () => {
  const seen = new Set<string>();
  for (const r of RULES) {
    assert.ok(!seen.has(r.id), `duplicate id ${r.id}`);
    seen.add(r.id);
    assert.ok(r.cites.length > 0, `${r.id} has no cites`);
    assert.ok(r.roles.length > 0, `${r.id} has no roles`);
  }
});

test("農地 in 市街化区域 triggers 農地転用 and development checks", () => {
  const f = ids(plan({ areaDivision: "市街化区域", zoning: "第一種低層住居専用地域", fireZone: "指定なし", landCategory: "田・畑（農地）", siteArea: 250, floors: 2, totalFloorArea: 110, roadType: "建築基準法上の道路（42条1項）", roadWidth: 4, frontage: 6, hazards: ["浸水想定区域"] }));
  assert.equal(f.get("nochi-tenyo"), "required");
  assert.equal(f.get("noshin"), "check");
  assert.equal(f.get("kakunin-shinsei"), "required");
  assert.equal(f.get("shoene"), "required");
  assert.equal(f.get("low-rise-form"), "required");
  assert.equal(f.get("shinsui"), "likely");
  assert.equal(f.get("zoning-unknown"), undefined);
  assert.equal(f.get("road-unknown"), undefined);
  assert.equal(f.get("chosei-kuiki"), undefined);
});

test("市街化調整区域 is flagged as required and overrides generic development rule", () => {
  const f = ids(plan({ areaDivision: "市街化調整区域", siteArea: 400 }));
  assert.equal(f.get("chosei-kuiki"), "required");
  assert.equal(f.get("kaihatsu-kyoka"), undefined);
});

test("接道 2m未満 and narrow road trigger 接道義務 and setback", () => {
  const f = ids(plan({ roadType: "2項道路（幅員4m未満の既存道）", roadWidth: 3.6, frontage: 1.9 }));
  assert.equal(f.get("setsudo"), "required");
  assert.equal(f.get("setback"), "required");
  assert.equal(f.get("rinchi-shiyo"), "likely");
});

test("盛土規制法 thresholds", () => {
  assert.equal(ids(plan({ fillHeight: 1.5 })).get("morido"), "likely");
  assert.equal(ids(plan({ fillHeight: 1.5, hazards: ["宅地造成等工事規制区域"] })).get("morido"), "required");
  assert.equal(ids(plan({ fillHeight: 0.5, hazards: ["宅地造成等工事規制区域"] })).get("morido"), "likely");
  assert.equal(ids(plan({ earthworkArea: 100 })).get("morido"), "check");
  assert.equal(ids(plan({})).get("morido"), undefined);
});

test("構造計算 thresholds for 木造", () => {
  assert.equal(ids(plan({ structure: "木造", floors: 2, totalFloorArea: 120 })).get("kozo-keisan"), "likely");
  assert.equal(ids(plan({ structure: "木造", floors: 3, totalFloorArea: 120 })).get("kozo-keisan"), "required");
  assert.equal(ids(plan({ structure: "木造", floors: 2, totalFloorArea: 320 })).get("kozo-keisan"), "required");
  assert.equal(ids(plan({ structure: "鉄骨造", floors: 4 })).get("kozo-keisan"), "required");
});

test("消防同意 and 消防用設備 depend on fire zone and use", () => {
  assert.equal(ids(plan({ fireZone: "指定なし", buildingUse: "専用住宅" })).get("shobo-doi"), undefined);
  assert.equal(ids(plan({ fireZone: "準防火地域", buildingUse: "専用住宅" })).get("shobo-doi"), "required");
  assert.equal(ids(plan({ fireZone: "指定なし", buildingUse: "共同住宅・寄宿舎" })).get("shobo-doi"), "required");
  assert.equal(ids(plan({ buildingUse: "専用住宅" })).get("shobo-setsubi"), undefined);
  assert.equal(ids(plan({ buildingUse: "店舗・飲食店" })).get("shobo-setsubi"), "required");
  assert.equal(ids(plan({ buildingUse: "専用住宅" })).get("jukeiki"), "required");
});

test("解体 triggers recycle and asbestos rules", () => {
  const f = ids(plan({ workType: "解体のみ", demolitionArea: 95 }));
  assert.equal(f.get("recycle"), "required");
  assert.equal(f.get("asbestos"), "required");
  assert.equal(f.get("kakunin-shinsei"), undefined);
  assert.equal(ids(plan({ workType: "解体のみ", demolitionArea: 60 })).get("recycle"), "check");
});

test("建設業許可 thresholds are evaluated at the rule level", () => {
  assert.equal(ids(plan({ totalFloorArea: 160, contractAmountMan: 2500 })).get("kensetsugyo"), "required");
});

test("plan schema accepts the empty defaults and coerces numbers", () => {
  const parsed = planSchema.parse({ description: "市街化区域で住宅を建てたい", siteArea: "200", floors: "2" });
  assert.equal(parsed.siteArea, 200);
  assert.equal(parsed.floors, 2);
  assert.equal(parsed.zoning, "不明");
  assert.throws(() => planSchema.parse({ description: "短い" }));
});

test("article helpers", () => {
  assert.equal(normalizeArticle("第43条"), "43");
  assert.equal(normalizeArticle("6条の4"), "6_4");
  assert.equal(normalizeArticle("１３６条の２の２"), "136_2_2");
  assert.equal(normalizeArticle("abc"), null);
  assert.equal(articleLabel("6_4"), "第6条の4");
  assert.equal(lawByTitle("建基法"), "kenkiho");
  assert.equal(lawByTitle("建築基準法"), "kenkiho");
  assert.equal(lawByTitle("令"), "kenkirei");
  assert.equal(lawByTitle("都市計画法"), "toshikeikakuho");
});

test("markdown links and bold are split into runs", () => {
  const runs = inlineRuns("根拠：[建築基準法第43条](https://laws.e-gov.go.jp/law/325AC0000000201#Mp-At_43) と **接道義務**");
  assert.deepEqual(runs.map((r) => [r.text, r.bold, r.href ?? null]), [
    ["根拠：", false, null],
    ["建築基準法第43条", false, "https://laws.e-gov.go.jp/law/325AC0000000201#Mp-At_43"],
    [" と ", false, null],
    ["接道義務", true, null],
  ]);
  const blocks = parseBlocks("| a | b |\n|---|---|\n| [x](https://e.jp) | y |");
  assert.equal(blocks[0].type, "table");
});

test("source tiers", () => {
  assert.equal(sourceTier("https://laws.e-gov.go.jp/law/325AC0000000201"), "条文");
  assert.equal(sourceTier("https://www.mlit.go.jp/toshi/web/morido.html"), "公的");
  assert.equal(sourceTier("https://www.city.hamamatsu.shizuoka.jp/"), "公的");
  assert.equal(sourceTier("https://www.pref.shizuoka.jp/"), "公的");
  assert.equal(sourceTier("https://example.com/blog"), "参考");
});
