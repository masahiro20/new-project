// Inputs for the 法令制限確認書 that the map data cannot give: the customer and what the
// staff found on site. Kept apart from the Excel writer so the form can use it client-side.

import { z } from "zod";

const s = (max: number) => z.string().trim().max(max).catch("");

/** 顧客・敷地調査の入力。どれも任意（分からなければ空欄で出す）。 */
export const surveySchema = z.object({
  salesRep: s(40),
  kana1: s(60),
  name1: s(60),
  kana2: s(60),
  name2: s(60),
  phone1: s(40),
  phone2: s(40),
  currentZip: s(10),
  currentAddress: s(200),
  siteZip: s(10),
  juzenchi: s(200),
  karikanchi: s(200),
  /** 該当地（地番・地積・地目）。空なら住所と入力値から作る */
  lot: s(200),
  heightDistrict: s(40),
  wallSetback: s(20),
  buildingAgreement: s(60),
  road1Direction: s(10),
  road1Owner: z.enum(["", "国道", "県道", "市道"]).catch(""),
  road2Kou: s(4),
  road2Gou: s(4),
  road2Direction: s(10),
  road2Width: s(10),
  road2Owner: z.enum(["", "国道", "県道", "市道"]).catch(""),
  water: z.enum(["", "引込有", "引込無", "要確認"]).catch(""),
  sewage: z.enum(["", "下水道", "集中浄化槽", "個別浄化槽"]).catch(""),
  /** 確認書には欄がないが、土地情報まとめの必須項目。 */
  gas: z.enum(["", "都市ガス", "プロパン", "オール電化予定"]).catch(""),
});
export type Survey = z.infer<typeof surveySchema>;
export const EMPTY_SURVEY: Survey = surveySchema.parse({});
