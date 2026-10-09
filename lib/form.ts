import { z } from "zod";

export const SERVICE_TYPES = [
  "放課後等デイサービス",
  "児童発達支援",
  "就労継続支援B型",
  "就労継続支援A型",
  "就労移行支援",
  "生活介護",
  "共同生活援助（グループホーム）",
  "居宅介護・重度訪問介護",
  "短期入所",
  "相談支援",
  "自立生活援助",
  "就労定着支援",
  "その他の障害福祉サービス",
] as const;

const text = (max: number) => z.string().trim().max(max);

export const facilitySchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  facilityName: text(60).min(1, "事業所名を入力してください"),
  staffCount: z.coerce.number().int().min(1).max(500),
  userCharacteristics: text(400),
  meetingDate: text(40),
  committeeMembers: text(300),
  meetingNotes: text(2000),
  recentIssues: text(800),
  useRestraint: z.enum(["なし", "あり", "検討中"]),
});

export type FacilityInput = z.infer<typeof facilitySchema>;
