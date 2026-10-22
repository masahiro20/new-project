import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MISSING_META, RULES } from "../lib/knowledge";
import { normalizeArticle, articleLabel, lawByTitle } from "../lib/laws";
import { EMPTY_PLAN, EMPTY_SIGNALS, planSchema, type PlanInput } from "../lib/plan";
import { runRules, splitFindings, groupByAgency } from "../lib/rules";
import { inlineRuns, parseBlocks } from "../lib/markdown";
import { sourceTier } from "../lib/agent";
import { distanceToLine, mergeSiteIntoPlan, pointInGeometry, tileFor, type SiteContext } from "../lib/site";

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
  // 農振法6条3項: 市街化区域は農業振興地域に指定されないので青地の論点は出さない
  assert.equal(f.get("noshin"), undefined);
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

test("tile math matches the GSI XYZ scheme", () => {
  // 浜松市中央区元城町 (34.710941N, 137.726532E) at z15
  const t = tileFor(34.710941, 137.726532, 15);
  assert.equal(t.z, 15);
  assert.equal(t.x, Math.floor(((137.726532 + 180) / 360) * 2 ** 15));
  assert.ok(t.y > 0 && t.y < 2 ** 15);
});

test("point in polygon with a hole and multipolygon", () => {
  const square = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.equal(pointInGeometry(1, 1, square), true);
  assert.equal(pointInGeometry(5, 5, square), false);
  assert.equal(pointInGeometry(11, 5, square), false);
  const multi = { type: "MultiPolygon", coordinates: [[[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] };
  assert.equal(pointInGeometry(25, 25, multi), true);
  assert.equal(pointInGeometry(25, 25, null), false);
});

test("distance to line is in metres", () => {
  const line = { type: "LineString", coordinates: [[137.72, 34.71], [137.73, 34.71]] };
  const d = distanceToLine(137.725, 34.7101, line); // ~0.0001 deg north of the line ≈ 11m
  assert.ok(d > 9 && d < 13, `distance ${d}`);
});

test("site lookup fills blanks without overriding explicit choices", () => {
  const site = {
    address: "x", matched: "x", lat: 0, lon: 0, tile: null, apiAvailable: true, fetchedAt: "", layers: [],
    derived: { areaDivision: "市街化区域", zoning: "第一種低層住居専用地域", fireZone: "指定なし", hazards: ["浸水想定区域"], notes: [], signals: EMPTY_SIGNALS },
  } as unknown as SiteContext;
  const merged = mergeSiteIntoPlan(plan({ fireZone: "準防火地域", hazards: ["地区計画の区域"] }), site);
  assert.equal(merged.areaDivision, "市街化区域");
  assert.equal(merged.zoning, "第一種低層住居専用地域");
  assert.equal(merged.fireZone, "準防火地域");
  assert.deepEqual(merged.hazards.sort(), ["地区計画の区域", "浸水想定区域"].sort());
});

// ---------------------------------------------------------------- farmland / water / report

import { distanceToPolygon, nearestWater, summarizeFarmland, tilesAround } from "../lib/nearby";
import { deriveSignals, normalizeZoningName } from "../lib/site";
import { CHECKLIST_ITEMS, REPORT_INPUT_SCHEMA, reportSchema, reportToMarkdown } from "../lib/report";

const square = (lon: number, lat: number, d: number) => [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]];

test("every rule has a stage and an agency", () => {
  assert.deepEqual(MISSING_META, []);
  for (const r of RULES) {
    assert.ok(r.stage, `${r.id} has no stage`);
    assert.ok(r.agency, `${r.id} has no agency`);
  }
});

test("distance to polygon is 0 inside and metres outside", () => {
  const rings = square(137.7, 34.8, 0.0001);
  assert.equal(distanceToPolygon(137.7, 34.8, rings), 0);
  const d = distanceToPolygon(137.7 + 0.0003, 34.8, rings);
  assert.ok(d > 15 && d < 22, `got ${d}`);
});

test("farmland summary: on a 田 parcel vs. a nearby 畑", () => {
  const on = summarizeFarmland(137.7, 34.8, [{ geometry: { type: "Polygon", coordinates: square(137.7, 34.8, 0.0002) }, properties: { land_type: 100 } }]);
  assert.equal(on.onSite, "田");
  assert.equal(on.nearestMeters, 0);
  const near = summarizeFarmland(137.7, 34.8, [{ geometry: { type: "Polygon", coordinates: square(137.7004, 34.8, 0.0001) }, properties: { land_type: 200 } }]);
  assert.equal(near.onSite, null);
  assert.ok(near.nearestMeters !== null && near.nearestMeters > 20 && near.nearestMeters < 35);
  assert.equal(near.nearby.畑, 1);
});

test("nearest water picks the closest line and labels it", () => {
  const w = nearestWater(137.7, 34.8, [
    { geometry: { type: "LineString", coordinates: [[137.7001, 34.799], [137.7001, 34.801]] }, properties: { ftCode: 5301 } },
    { geometry: { type: "LineString", coordinates: [[137.701, 34.799], [137.701, 34.801]] }, properties: { ftCode: 5201 } },
  ]);
  assert.ok(w.nearestMeters !== null && w.nearestMeters >= 8 && w.nearestMeters <= 11);
  assert.match(w.nearestKind ?? "", /水路/);
  assert.equal(w.insideWater, false);
});

test("tilesAround includes neighbours only near tile edges", () => {
  assert.ok(tilesAround(34.8, 137.7, 16, 10).length <= 4);
  assert.ok(tilesAround(34.8, 137.7, 16, 10).length >= 1);
});

test("signals: parcel under the point means farmland on site; flood layer gives river names", () => {
  const sg = deriveSignals(
    { status: "ok", onSite: "田", nearestMeters: 0, nearby: { 田: 3, 畑: 0 }, radius: 60 },
    { status: "ok", nearestMeters: 12, nearestKind: "細い川・水路（河川中心線）", insideWater: false, radius: 150 },
    { id: "XKT026", label: "", status: "hit", summary: [], features: [{ A31a_202: "安間川", A31a_204: "静岡県" }], source: { label: "", url: "", year: "" } },
  );
  assert.equal(sg.farmland, "敷地が農地の可能性");
  assert.equal(sg.farmlandType, "田");
  assert.equal(sg.waterMeters, 12);
  assert.deepEqual(sg.floodRivers, ["安間川（静岡県指定）"]);
  const none = deriveSignals({ status: "ok", onSite: null, nearestMeters: null, nearby: { 田: 0, 畑: 0 }, radius: 60 }, { status: "ok", nearestMeters: null, nearestKind: null, insideWater: false, radius: 150 }, undefined);
  assert.equal(none.farmland, "なし");
  assert.equal(none.waterKind, "なし");
});

test("farmland + waterway signals raise the rules people miss", () => {
  const p = plan({
    areaDivision: "市街化調整区域",
    signals: { farmland: "敷地が農地の可能性", farmlandType: "田", farmlandMeters: 0, waterMeters: 12, waterKind: "細い川・水路（河川中心線）", floodRivers: [] },
  });
  const site = { derived: { hazards: [], notes: [], signals: p.signals } } as unknown as SiteContext;
  const f = ids(mergeSiteIntoPlan(p, site));
  assert.equal(f.get("nochi-genkyo"), "required");
  assert.equal(f.get("nochi-tenyo"), "required");
  assert.equal(f.get("tochikairyo"), "likely");
  assert.equal(f.get("noshin"), "likely");
  assert.equal(f.get("kasen"), "likely");
  assert.equal(f.get("suiro-setsudo"), "check");
  assert.equal(f.get("horyusaki"), "likely");
  const far = ids(plan({ signals: { ...EMPTY_SIGNALS, farmland: "周辺に農地", farmlandMeters: 30, waterMeters: 45, waterKind: "川" } }));
  assert.equal(far.get("rinsetsu-nochi"), "check");
  assert.equal(far.get("kasen"), "check");
  assert.equal(far.get("nochi-genkyo"), undefined);
});

test("findings split into specific / checks / routine and group by agency", () => {
  const f = runRules(plan({ areaDivision: "市街化調整区域", zoning: "用途地域の指定なし", fireZone: "指定なし" }));
  const s = splitFindings(f);
  assert.ok(s.routine.some((x) => x.rule.id === "kakunin-shinsei"));
  assert.ok(s.specific.some((x) => x.rule.id === "chosei-kuiki"));
  assert.ok(!s.specific.some((x) => x.rule.routine));
  const agencies = groupByAgency([...s.specific, ...s.checks]);
  assert.equal(agencies[0].items[0].severity, "required");
});

test("report schema: tool schema requires every key and markdown export renders sections", () => {
  const schema = REPORT_INPUT_SCHEMA as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  const r = reportSchema.parse({
    summary: { verdict: "許可・協議が前提", headline: "農地転用が前提です。", topRisks: ["農地"], schedule: "+3か月" },
    design: [{ title: "床高さ", detail: "浸水深0.5m", priority: "高", certainty: "確定", evidence: [{ label: "建築基準法第19条", url: "https://laws.e-gov.go.jp/law/325AC0000000201#Mp-At_19" }] }],
    consultations: [{ agency: "農業委員会", purpose: "転用可否", items: ["農地区分"], bring: "公図", timing: "契約前", evidence: [] }],
    procedures: [{ step: "農地法5条許可", timing: "毎月締切", duration: "窓口で確認", agency: "農業委員会", evidence: [] }],
    checklist: CHECKLIST_ITEMS.map((item) => ({ item, status: "要確認", note: "" })),
    documents: [{ name: "登記簿.pdf", kind: "登記事項証明書", facts: ["地目 畑"], concerns: ["現況も畑の可能性"] }],
    questions: [{ to: "施主", question: "登記の地目は確認済みですか？" }],
    tasks: [{ task: "公図を取得する", role: "営業", when: "土地契約前", agency: "法務局" }],
    assumptions: [],
  });
  const md = reportToMarkdown(r);
  assert.match(md, /- \[ \] 【土地契約前・営業】公図を取得する（法務局）/);
  assert.match(md, /【高・確定】/);
  assert.match(md, /## 結論：許可・協議が前提/);
  assert.match(md, /## 役所への事前協議リスト/);
  assert.match(md, /## 資料から読み取ったこと/);
  assert.match(md, /\[建築基準法第19条\]\(https:\/\/laws\.e-gov\.go\.jp/);
});

test("zoning names from GIS data (full-width digits) map to the schema names", () => {
  assert.equal(normalizeZoningName("第２種中高層住居専用地域"), "第二種中高層住居専用地域");
  assert.equal(normalizeZoningName("第1種低層住居専用地域"), "第一種低層住居専用地域");
  assert.equal(normalizeZoningName("近隣商業地域"), "近隣商業地域");
});

test("municipal ordinance databases count as official sources", async () => {
  const { sourceTier } = await import("../lib/tier");
  assert.equal(sourceTier("https://www1.g-reiki.net/hamamatsu/reiki/youkou/pdf/x.pdf"), "公的");
  assert.equal(sourceTier("https://example.com/"), "参考");
});

test("land sheet: road-width FAR limit (法52条2項) and height rules (法55・56条, 別表第三)", async () => {
  const { roadFarLimit, heightRules, parsePercent } = await import("../lib/landsummary");
  assert.equal(roadFarLimit("第一種低層住居専用地域", 4), 160);
  assert.equal(roadFarLimit("近隣商業地域", 4), 240);
  assert.equal(roadFarLimit("第一種住居地域", 12), null);
  assert.equal(roadFarLimit("不明", 4), null);
  assert.match(heightRules("第一種低層住居専用地域")!.value, /10m.*12m/);
  assert.match(heightRules("第二種中高層住居専用地域")!.value, /北側斜線 10m＋1.25/);
  assert.match(heightRules("商業地域")!.value, /道路斜線 1.5/);
  assert.match(heightRules("第一種住居地域")!.sub, /隣地斜線 20m＋1.25/);
  assert.equal(parsePercent("６０％"), 60);
  assert.equal(parsePercent(undefined), null);
});

test("land sheet: farmland on site is flagged red and area limits are computed from inputs", async () => {
  const { landFacts } = await import("../lib/landsummary");
  const p = plan({ areaDivision: "市街化区域", zoning: "第一種低層住居専用地域", fireZone: "準防火地域", roadWidth: 4, frontage: 6, siteArea: 200, signals: { ...EMPTY_SIGNALS, farmland: "敷地が農地の可能性", farmlandType: "田", farmlandMeters: 0 } });
  const site = { apiAvailable: true, layers: [], derived: { kenpei: "50%", yoseki: "100%", hazards: [], notes: [], signals: p.signals } } as unknown as SiteContext;
  const f = new Map(landFacts(p, site).map((x) => [x.key, x]));
  assert.equal(f.get("farm")?.tone, "danger");
  assert.equal(f.get("ratio")?.value, "50%／100%");
  assert.match(f.get("ratio")?.sub ?? "", /建築面積100㎡・延べ200㎡/);
  assert.equal(f.get("fire")?.tone, "warn");
});

// ---------------------------------------------------------------- MCP

test("mcp: initialize negotiates the version and lists tools and prompts", async () => {
  const { handleRpc, TOOLS } = await import("../lib/mcp");
  const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })) as { result: { protocolVersion: string; instructions: string; capabilities: Record<string, unknown> } };
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /document_reading_guide/);
  const old = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as { result: { protocolVersion: string } };
  assert.equal(old.result.protocolVersion, "2025-11-25");
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })) as { result: { tools: { name: string }[] } };
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  const prompt = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "land_law_check", arguments: { customer: "伊藤様" } } })) as { result: { messages: { content: { text: string } }[] } };
  assert.match(prompt.result.messages[0].content.text, /伊藤様/);
  const bad = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "nope" })) as { error: { code: number } };
  assert.equal(bad.error.code, -32601);
});

test("mcp: reading guide and a land check from document facts (no address, no network)", async () => {
  const { callTool } = await import("../lib/mcp");
  const guide = await callTool("document_reading_guide", { kind: "公図" });
  assert.equal(guide.isError, false);
  assert.match(guide.text, /水路（青線）/);
  const check = await callTool("land_law_check", {
    plan: "木造2階建ての自宅（延べ110㎡）",
    document_facts: "登記簿：地目 畑、地積 412㎡。公図：道路との間に水路。",
    registered_land_category: "田・畑（農地）",
    site_area: 412,
    frontage: 1.8,
    road_width: 3.5,
  });
  assert.equal(check.isError, false);
  assert.match(check.text, /農地転用/);
  assert.match(check.text, /接道義務/);
  assert.match(check.text, /laws\.e-gov\.go\.jp/);
  assert.match(check.text, /\/consult\?/);
  const badEnum = await callTool("land_law_check", { plan: "木造2階建ての自宅", structure: "わら" });
  assert.equal(badEnum.isError, true);
});

test("consult page link round-trips the plan", async () => {
  const { appLink } = await import("../lib/mcp");
  const { planFromQuery } = await import("../lib/plan");
  const p = plan({ address: "静岡県浜松市中央区元城町103-2", description: "木造2階建ての自宅", siteArea: 200, roadWidth: 4, landInfo: "登記簿：地目 宅地", extras: ["浄化槽（下水道なし）"] });
  const back = planFromQuery(new URL(appLink(p)).searchParams)!;
  assert.equal(back.address, p.address);
  assert.equal(back.siteArea, 200);
  assert.equal(back.roadWidth, 4);
  assert.equal(back.landInfo, "登記簿：地目 宅地");
  assert.deepEqual(back.extras, ["浄化槽（下水道なし）"]);
  assert.equal(planFromQuery(new URLSearchParams("")), null);
  const onlyAddress = planFromQuery(new URLSearchParams("address=岐阜県岐阜市水海道一丁目12番7&from=home"))!;
  assert.equal(onlyAddress.address, "岐阜県岐阜市水海道一丁目12番7");
  assert.equal(onlyAddress.description, "");
});

test("use restriction only flags non-dwelling uses (or 工業専用地域); 水路 in document notes raises the waterway access rule", () => {
  assert.equal(ids(plan({ zoning: "第一種低層住居専用地域", buildingUse: "専用住宅" })).get("yoto-seigen"), undefined);
  assert.equal(ids(plan({ zoning: "工業専用地域", buildingUse: "専用住宅" })).get("yoto-seigen"), "required");
  assert.equal(ids(plan({ zoning: "第一種低層住居専用地域", buildingUse: "店舗・飲食店" })).get("yoto-seigen"), "required");
  assert.equal(ids(plan({ landInfo: "公図：道路との間に水路（青線）" })).get("suiro-setsudo"), "likely");
  // 伊藤様のケース：東側が水路、南側の道路（42条1項）に直接接する → 水路を挟む接道ではない
  const ito = plan({ roadType: "建築基準法上の道路（42条1項）", landInfo: "現況測量図：東側は擁壁付き水路に接する。南側道路 幅員5.55m", signals: { ...EMPTY_SIGNALS, waterMeters: 5, waterKind: "川" } });
  assert.equal(ids(ito).get("suiro-setsudo"), undefined);
  // 42条1項・幅員5.55m・接道13.669m → 接道義務は満たしている
  assert.equal(ids({ ...ito, roadWidth: 5.55, frontage: 13.669 }).get("setsudo"), undefined);
  assert.equal(ids(plan({})).get("setsudo"), "likely");
});

test("certainty is never 確定 without a source; old role actions become tasks; tasks export to CSV", async () => {
  const { coerceReport, tasksToCsv } = await import("../lib/report");
  const r = coerceReport({
    summary: { verdict: "条件付きで建築可能", headline: "x", topRisks: [], schedule: "" },
    design: [
      { title: "a", detail: "", priority: "高", certainty: "確定", evidence: [] },
      { title: "b", detail: "", priority: "中", certainty: "確定", evidence: [{ label: "農地法第5条", url: "https://laws.e-gov.go.jp/law/327AC0000000229#Mp-At_5" }] },
      { title: "c", detail: "", priority: "低", evidence: [] },
    ],
    checklist: [{ item: "農地", status: "該当", certainty: "確定", note: "", evidence: [{ label: "登記事項証明書", url: "" }] }],
    actions: [{ role: "設計", items: ["配置図を描く"] }],
  })!;
  assert.deepEqual(r.design.map((d) => d.certainty), ["要確認", "確定", "要確認"]);
  assert.equal(r.checklist[0].certainty, "確定");
  assert.deepEqual(r.tasks, [{ task: "配置図を描く", role: "設計", when: "設計着手前", agency: "" }]);
  const csv = tasksToCsv(r.tasks, { 0: true });
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"済","設計着手前","設計","配置図を描く",""/);
});

test("land facts carry a certainty and a source; map distances are estimates", async () => {
  const { landFacts } = await import("../lib/landsummary");
  const p = plan({ zoning: "第一種住居地域", areaDivision: "市街化区域", roadWidth: 5.55, signals: { ...EMPTY_SIGNALS, farmland: "敷地が農地の可能性", farmlandType: "畑", farmlandMeters: 0, waterMeters: 5, waterKind: "川" } });
  const src = { label: "国土交通省 都市計画決定GISデータ", url: "https://www.mlit.go.jp/x", year: "令和7年度" };
  const site = { apiAvailable: true, precise: true, layers: [{ id: "XKT001", status: "hit", features: [{}], summary: [], source: src, label: "" }, { id: "XKT002", status: "hit", features: [{}], summary: [], source: src, label: "" }], derived: { areaDivision: "市街化区域", zoning: "第一種住居地域", kenpei: "60%", yoseki: "200%", hazards: [], notes: [], signals: p.signals } } as unknown as SiteContext;
  const f = new Map(landFacts(p, site).map((x) => [x.key, x]));
  assert.equal(f.get("zoning")!.certainty, "確定");
  assert.equal(f.get("zoning")!.cites[0].url, "https://www.mlit.go.jp/x");
  assert.equal(f.get("farm")!.certainty, "推測");
  assert.equal(f.get("water")!.certainty, "推測");
  assert.equal(f.get("road")!.certainty, "入力");
  for (const x of f.values()) if (x.certainty === "確定") assert.ok(x.cites.length > 0, x.key);
  const rough = new Map(landFacts(p, { ...site, precise: false } as SiteContext).map((x) => [x.key, x]));
  assert.equal(rough.get("zoning")!.certainty, "推測");
  // several flood rivers are not a boundary; two different zonings are
  const layers = [
    { id: "XKT001", status: "hit", features: [{ area_classification_ja: "市街化区域" }, { area_classification_ja: "市街化区域" }], summary: [], source: src, label: "" },
    { id: "XKT002", status: "hit", features: [{ use_area_ja: "第一種住居地域" }, { use_area_ja: "準工業地域" }], summary: [], source: src, label: "" },
    { id: "XKT026", status: "hit", features: [{}, {}, {}], summary: ["境川 浸水深 0.5m以上3.0m未満"], source: src, label: "" },
  ];
  const multi = new Map(landFacts(p, { ...site, layers } as unknown as SiteContext).map((x) => [x.key, x]));
  assert.equal(multi.get("area")!.certainty, "確定");
  assert.equal(multi.get("zoning")!.certainty, "要確認");
  assert.equal(multi.get("flood")!.certainty, "確定");
});

test("coerceReport fills missing sections and rejects junk", async () => {
  const { coerceReport } = await import("../lib/report");
  const r = coerceReport({ summary: { verdict: "条件付きで建築可能", headline: "x", topRisks: [], schedule: "" } });
  assert.ok(r);
  assert.deepEqual(r!.documents, []);
  assert.equal(coerceReport({ summary: { verdict: "OK" } }), null);
  assert.equal(coerceReport("x"), null);
});

// ---------------------------------------------------------------- OAuth for the Claude connector

test("oauth: signed codes/tokens, PKCE and redirect allowlist", async () => {
  process.env.ACCESS_PASSWORD = "unit-test-key";
  const { sign, verify, pkceOk, redirectAllowed, newCode, issueTokens } = await import("../lib/oauth");
  const { createHash } = await import("node:crypto");
  const verifier = "abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDEFG";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = newCode("kla_x", "https://claude.ai/api/mcp/auth_callback", challenge);
  const claims = verify(code, "code");
  assert.equal(claims?.ru, "https://claude.ai/api/mcp/auth_callback");
  assert.equal(verify(code, "at"), null);
  assert.ok(pkceOk(verifier, claims!.cc!));
  assert.equal(pkceOk("wrong", claims!.cc!), false);
  const t = issueTokens("kla_x");
  assert.ok(verify(t.access_token, "at"));
  assert.equal(verify(t.refresh_token, "at"), null);
  assert.equal(verify(t.access_token.slice(0, -2) + "xx", "at"), null);
  assert.equal(verify(sign({ t: "at", exp: 1 }), "at"), null);
  process.env.ACCESS_PASSWORD = "rotated";
  assert.equal(verify(t.access_token, "at"), null);
  delete process.env.ACCESS_PASSWORD;
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://localhost:53123/callback"));
  assert.equal(redirectAllowed("https://evil.example/cb"), false);
  assert.equal(redirectAllowed("http://claude.ai/x"), false);
});

test("法令制限確認書: values land in the template cells, checkboxes tick, styles and other sheets survive", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const { buildKakuninsho, surveySchema, kakuninshoFileName } = await import("../lib/kakuninsho");
  const p = plan({ address: "岐阜県岐阜市水海道一丁目12番7", areaDivision: "市街化区域", zoning: "第一種住居地域", fireZone: "法22条区域", roadType: "建築基準法上の道路（42条1項）", roadWidth: 5.55, siteArea: 259.91 });
  const site = { apiAvailable: true, precise: true, layers: [], derived: { kenpei: "60%", yoseki: "200%", hazards: [], notes: [], signals: p.signals } } as unknown as SiteContext;
  const survey = surveySchema.parse({ salesRep: "中谷", name1: "山田 太郎", kana1: "ヤマダ タロウ", road1Direction: "南", road1Owner: "市道", sewage: "下水道", phone1: 12345 });
  const files = unzipSync(buildKakuninsho({ survey, plan: p, site, report: { summary: { verdict: "条件付きで建築可能", topRisks: ["農地転用の届出"] } } }));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const cell = (ref: string) => sheet.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>(.*?)</c>)`, "s"))?.[1] ?? "";
  assert.match(cell("B2"), /中谷/);
  assert.match(cell("B4"), /山田 太郎/);
  assert.match(cell("D7"), /水海道一丁目12番7/);
  assert.match(cell("B12"), /<t[^>]*>第一種住居<\/t>/);
  assert.match(cell("B13"), /<v>60<\/v>/);
  assert.match(cell("G13"), /<v>200<\/v>/);
  assert.match(cell("D20"), />1</);
  assert.match(cell("D21"), />南</);
  assert.match(cell("H21"), /<v>5.55<\/v>/);
  assert.equal(cell("D24"), ""); // template placeholder 南 cleared
  assert.match(cell("B50"), /条件付きで建築可能/);
  assert.equal(cell("B5"), ""); // non-string phone is dropped, not guessed
  assert.match(cell("H2"), /TODAY\(\)/); // 作成日 formula kept
  const checked = Object.keys(files).filter((f) => f.startsWith("xl/ctrlProps/") && strFromU8(files[f]).includes('checked="Checked"')).map((f) => Number(f.match(/(\d+)\.xml$/)![1])).sort((a, b) => a - b);
  assert.deepEqual(checked, [1, 3, 8, 17, 35]); // 都市計画区域内・市街化区域・22条・市道・下水道
  assert.equal((strFromU8(files["xl/drawings/vmlDrawing1.vml"]).match(/<x:Checked>1<\/x:Checked>/g) ?? []).length, 5);
  assert.ok(files["xl/worksheets/sheet2.xml"]);
  assert.match(strFromU8(files["xl/workbook.xml"]), /fullCalcOnLoad="1"/);
  assert.match(kakuninshoFileName(p, survey, new Date("2026-10-22T03:00:00Z")), /^法令制限確認書_山田様_岐阜県岐阜市水海道一丁目12番7_20261022\.xlsx$/);
});

test("sealed links round-trip, expire, and reject tampering", async () => {
  const { seal, unseal } = await import("../lib/sealed");
  process.env.ACCESS_PASSWORD = "test-password";
  const t = seal({ a: 1, name: "山田" });
  assert.ok(t.startsWith("s."));
  assert.deepEqual(unseal(t), { a: 1, name: "山田" });
  assert.equal(unseal(t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA")), null);
  assert.equal(unseal(seal({ a: 1 }, -10)), null);
  delete process.env.ACCESS_PASSWORD;
});

test("MCP lists the 法令制限確認書 tool", async () => {
  const { TOOLS } = await import("../lib/mcp");
  const t = TOOLS.find((x) => x.name === "make_kakuninsho");
  assert.ok(t);
  assert.deepEqual((t!.inputSchema as { required: string[] }).required, ["address"]);
});

test("地番図: finds the lot under the point and its neighbours from a line-per-feature GeoJSON", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { scan } = await import("../lib/chiban");
  const sq = (x: number, y: number, d: number) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
  const f = (chiban: string, ring: number[][]) => JSON.stringify({ type: "Feature", properties: { 大字名: "竜田町", 地番: chiban, 座標値種別: "測量成果" }, geometry: { type: "Polygon", coordinates: [ring] } });
  const lines = ['{"type":"FeatureCollection","features":[', `${f("27", sq(136.767, 35.414, 0.0002))},`, `${f("28", sq(136.7672, 35.414, 0.0002))},`, `${f("99", sq(136.80, 35.45, 0.0002))}`, "]}"];
  const path = join(mkdtempSync(join(tmpdir(), "chiban-")), "t.geojson");
  writeFileSync(path, lines.join("\n"));
  const lots = await scan(path, 35.4141, 136.7671);
  assert.equal(lots[0].chiban, "27");
  assert.equal(lots[0].contains, true);
  assert.deepEqual(lots.map((l) => l.chiban), ["27", "28"]); // far lot skipped
});
