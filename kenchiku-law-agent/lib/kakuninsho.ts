// 「敷地調査　建築法令制限確認書　Ver1-2」（社内の Excel 書式）を埋める。
//
// 原本の xlsx をそのまま開き、決まったセルに値を書き、チェックボックス（フォーム
// コントロール）に印を付けるだけにしている。書式・罫線・結合セル・2枚目の
// 「申請スケジュール」・TODAY() の作成日は原本のまま残る。
//
// 書き込むのは確かめられる項目だけ：顧客情報（入力どおり。不明なら空欄）、建築地、
// 都市計画区域・用途地域・建蔽率／容積率・防火（国のデータ、または入力で上書き）、
// 高度地区・壁面後退・建築協定・その他地区・接道・給排水（入力＞AI調査＞データの順。
// sheetfields.ts）、備考（結論と、どの欄をAI調査・データで埋めたか）。設備・仕様の欄は触らない。

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parsePercent } from "./landsummary";
import type { PlanInput } from "./plan";
import type { PartialReport } from "./report";
import { runRules, splitFindings } from "./rules";
import { resolveSheet, sheetSourceLine, type AiSheet, type ResolvedSheet } from "./sheetfields";
import type { SiteContext } from "./site";
import { KAKUNINSHO_TEMPLATE_B64 } from "./templates/kakuninsho-v1-2";

import { officeNotesText, surveySchema, type Survey } from "./survey";

export { EMPTY_SURVEY, surveySchema, type Survey } from "./survey";

// Form-control checkboxes in the template, by the ctrlProp file they live in.
const BOX = {
  cityPlanIn: 1,
  cityPlanOut: 2,
  urbanization: 3,
  controlled: 4,
  unzoned: 5,
  fire: 6,
  quasiFire: 7,
  art22: 8,
  heightYes: 9,
  heightNo: 10,
  setbackYes: 11,
  setbackNo: 12,
  agreementYes: 13,
  agreementNo: 14,
  road1National: 16,
  road1Pref: 55,
  road1City: 17,
  road2National: 18,
  road2Pref: 19,
  road2City: 20,
  waterYes: 32,
  waterNo: 33,
  waterCheck: 34,
  sewer: 35,
  shared: 36,
  septic: 59,
} as const;

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces the cell's content, keeping its style. Cells must already exist in the template. */
function setCell(xml: string, ref: string, value: string | number | null): string {
  const re = new RegExp(`<c r="${ref}"( s="\\d+")?[^>]*?(?:/>|>.*?</c>)`, "s");
  const m = xml.match(re);
  if (!m) throw new Error(`template cell ${ref} not found`);
  const style = m[1] ?? "";
  let cell: string;
  if (value === null || value === "") cell = `<c r="${ref}"${style}/>`;
  else if (typeof value === "number") cell = `<c r="${ref}"${style}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return xml.replace(re, cell);
}

const ZONE_SHORT = (z: PlanInput["zoning"]) => (z === "不明" ? "" : z === "用途地域の指定なし" ? "無指定" : z.replace(/地域$/, ""));


/** 備考: 結論と、見落とすと困る論点。AIの回答があればそれを、なければ自動判定を使う。 */
export function remarks(plan: PlanInput, report: PartialReport | null | undefined, date: string, sheet: ResolvedSheet = {}, ratioSource?: { label: string }, office = ""): string {
  const head = `【建築法令エージェント ${date}】`;
  const src = sheetSourceLine(sheet);
  const ratio = ratioSource ? `建蔽率・容積率は${ratioSource.label}による。` : "";
  const tail = `${office ? `役所調査：${office}。` : ""}${src ? `${src}。` : ""}${ratio}用途地域等は国のデータ（住所の代表点）による。都市計画図・窓口で確認のこと。詳細は法令チェック表（PDF）。`;
  if (report?.summary?.verdict) {
    const risks = (report.summary.topRisks ?? []).slice(0, 3).map((r, i) => `${"①②③"[i]}${r}`);
    return [`${head}${report.summary.verdict}。`, ...risks, tail].join("\n");
  }
  const { specific } = splitFindings(runRules(plan));
  const titles = specific.slice(0, 5).map((f) => f.rule.title.replace(/（.*?）/g, ""));
  return [`${head}自動判定（AIの詳しいチェック前）`, titles.length ? `要注意：${titles.join("／")}` : "敷地固有の論点はデータ上なし", tail].join("\n");
}

export type KakuninshoInput = { survey: Survey; plan: PlanInput; site: SiteContext | null; report?: PartialReport | null; sheet?: AiSheet | null; today?: Date };

export function buildKakuninsho({ survey, plan, site, report, sheet: aiSheet, today = new Date() }: KakuninshoInput): Uint8Array {
  const files = unzipSync(Buffer.from(KAKUNINSHO_TEMPLATE_B64, "base64"));
  let sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const date = today.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

  const zip = (v: string) => (v ? `〒${v.replace(/^〒/, "")}` : "〒");
  const lotFacts = [plan.siteArea !== null ? `地積${plan.siteArea}㎡` : "", plan.landCategory !== "不明" ? `地目 ${plan.landCategory.replace("（農地）", "")}` : ""].filter(Boolean);
  const lot = survey.lot || (plan.address ? `${plan.address}${lotFacts.length ? `（${lotFacts.join("・")}）` : ""}` : "");
  const kenpei = parsePercent(site?.derived.kenpei);
  const yoseki = parsePercent(site?.derived.yoseki);
  const r = resolveSheet(plan, site, survey, aiSheet ?? report?.sheet);
  const v = (k: keyof ResolvedSheet) => r[k]?.value ?? "";
  const num = (k: keyof ResolvedSheet) => {
    const raw = v(k).replace(/m$/, "");
    return raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
  };
  const named = (k: keyof ResolvedSheet, suffix: RegExp) => (v(k) && v(k) !== "無" ? v(k).replace(suffix, "") : "");

  const values: Record<string, string | number | null> = {
    B2: survey.salesRep,
    B3: survey.kana1,
    F3: survey.kana2,
    B4: survey.name1,
    F4: survey.name2,
    B5: survey.phone1,
    F5: survey.phone2,
    B6: zip(survey.currentZip),
    D6: survey.currentAddress,
    B7: zip(survey.siteZip),
    D7: plan.address,
    B8: survey.juzenchi,
    B9: survey.karikanchi,
    B10: lot,
    B12: ZONE_SHORT(plan.zoning),
    B13: kenpei,
    E13: "容積率",
    G13: yoseki,
    D15: named("heightDistrict", /高度地区$/),
    D16: named("wallSetback", /m$/),
    D17: v("buildingAgreement") !== "無" ? v("buildingAgreement") : "",
    B18: v("otherDistricts"),
    D20: v("road1Kou"),
    G20: v("road1Gou"),
    D21: v("road1Direction"),
    H21: num("road1Width"),
    D23: v("road2Kou"),
    G23: v("road2Gou"),
    D24: v("road2Direction"),
    H24: num("road2Width"),
    B50: remarks(
      plan,
      report,
      date,
      r,
      site?.derived.ratioSource,
      officeNotesText(survey)
        .split("\n")
        .slice(1)
        .map((l) => l.replace(/^- /, ""))
        .join("／"),
    ),
  };
  for (const [ref, v] of Object.entries(values)) sheet = setCell(sheet, ref, v);
  // 備考 holds several lines: wrap it top-left and give its two rows room.
  const wrap = addWrapStyle(files, 67);
  sheet = sheet.replace(/<c r="B50" s="\d+"/, `<c r="B50" s="${wrap}"`);
  for (const r of [50, 51]) sheet = sheet.replace(new RegExp(`(<row r="${r}"[^>]*?) ht="[\\d.]+"`), `$1 ht="45"`);
  files["xl/worksheets/sheet1.xml"] = strToU8(sheet);

  // Checkboxes
  const on: number[] = [];
  const area = plan.areaDivision;
  if (area === "市街化区域") on.push(BOX.cityPlanIn, BOX.urbanization);
  else if (area === "市街化調整区域") on.push(BOX.cityPlanIn, BOX.controlled);
  else if (area === "非線引き都市計画区域") on.push(BOX.cityPlanIn, BOX.unzoned);
  else if (area === "準都市計画区域" || area === "都市計画区域外") on.push(BOX.cityPlanOut);
  if (plan.fireZone === "防火地域") on.push(BOX.fire);
  if (plan.fireZone === "準防火地域") on.push(BOX.quasiFire);
  if (plan.fireZone === "法22条区域") on.push(BOX.art22);
  const yesNo = (v: string, yes: number, no: number) => {
    if (v === "無") on.push(no);
    else if (v) on.push(yes);
  };
  yesNo(v("heightDistrict"), BOX.heightYes, BOX.heightNo);
  yesNo(v("wallSetback"), BOX.setbackYes, BOX.setbackNo);
  yesNo(v("buildingAgreement"), BOX.agreementYes, BOX.agreementNo);
  const owner = { 国道: [BOX.road1National, BOX.road2National], 県道: [BOX.road1Pref, BOX.road2Pref], 市道: [BOX.road1City, BOX.road2City] } as const;
  const own1 = v("road1Owner") as keyof typeof owner | "";
  const own2 = v("road2Owner") as keyof typeof owner | "";
  if (own1 in owner) on.push(owner[own1 as keyof typeof owner][0]);
  if (own2 in owner) on.push(owner[own2 as keyof typeof owner][1]);
  const water = v("water") as "引込有" | "引込無" | "要確認" | "";
  const sewage = v("sewage") as "下水道" | "集中浄化槽" | "個別浄化槽" | "";
  if (water) on.push({ 引込有: BOX.waterYes, 引込無: BOX.waterNo, 要確認: BOX.waterCheck }[water]);
  if (sewage) on.push({ 下水道: BOX.sewer, 集中浄化槽: BOX.shared, 個別浄化槽: BOX.septic }[sewage]);
  checkBoxes(files, on);

  // Recalculate on open so the second sheet picks up the new values.
  const wb = strFromU8(files["xl/workbook.xml"]);
  files["xl/workbook.xml"] = strToU8(/<calcPr[^>]*fullCalcOnLoad/.test(wb) ? wb : wb.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>'));
  return zipSync(files, { level: 6 });
}

/** Appends a copy of cell style `base` that wraps text from the top left; returns its index. */
function addWrapStyle(files: Record<string, Uint8Array>, base: number): number {
  const styles = strFromU8(files["xl/styles.xml"]);
  const block = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!block) return base;
  const xfs = block[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
  const src = xfs[base];
  if (!src) return base;
  const alignment = '<alignment horizontal="left" vertical="top" wrapText="1"/>';
  const copy = /<alignment[^>]*\/>/.test(src)
    ? src.replace(/<alignment[^>]*\/>/, alignment)
    : src.replace(/\/>$/, ` applyAlignment="1">${alignment}</xf>`);
  const index = xfs.length;
  files["xl/styles.xml"] = strToU8(styles.replace(block[0], `<cellXfs count="${index + 1}">${block[2]}${copy}</cellXfs>`));
  return index;
}

/** Ticks form-control checkboxes: the 2010+ control properties and the legacy VML shape. */
function checkBoxes(files: Record<string, Uint8Array>, ctrlPropNumbers: number[]) {
  if (ctrlPropNumbers.length === 0) return;
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const rels = strFromU8(files["xl/worksheets/_rels/sheet1.xml.rels"]);
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship ([^>]*)\/>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1];
    const target = m[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTarget.set(id, target);
  }
  const shapeOf = new Map<number, string>();
  for (const m of sheet.matchAll(/<control shapeId="(\d+)" r:id="(rId\d+)"/g)) {
    const n = Number(relTarget.get(m[2])?.match(/ctrlProp(\d+)\.xml$/)?.[1]);
    if (n) shapeOf.set(n, m[1]);
  }
  const vmlPath = "xl/drawings/vmlDrawing1.vml";
  let vml = strFromU8(files[vmlPath]);
  for (const n of ctrlPropNumbers) {
    const path = `xl/ctrlProps/ctrlProp${n}.xml`;
    const prop = strFromU8(files[path]);
    if (!/checked=/.test(prop)) files[path] = strToU8(prop.replace("<formControlPr ", '<formControlPr checked="Checked" '));
    const shapeId = shapeOf.get(n);
    if (!shapeId) continue;
    vml = vml.replace(new RegExp(`(<v:shape id="_x0000_s${shapeId}"[\\s\\S]*?<x:ClientData ObjectType="Checkbox">)([\\s\\S]*?)(</x:ClientData>)`), (_all, a, body, c) =>
      /<x:Checked>/.test(body) ? `${a}${body}${c}` : `${a}${body}<x:Checked>1</x:Checked>${c}`,
    );
  }
  files[vmlPath] = strToU8(vml);
}

export function kakuninshoFileName(plan: PlanInput, survey: Survey, today = new Date()): string {
  const ymd = today.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "");
  const who = survey.name1 ? `_${survey.name1.split(/\s/)[0]}様` : "";
  const where = (plan.address || "建築地").replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
  return `法令制限確認書${who}_${where}_${ymd}.xlsx`;
}
