export const PARTS = ["committee", "training", "restraint"] as const;
export type Part = (typeof PARTS)[number];

export const PART_LABELS: Record<Part | "preview", string> = {
  preview: "年間実施計画（無料お試し）",
  committee: "虐待防止委員会セット（年間計画・議事次第・議事録）",
  training: "虐待防止研修セット（研修資料・理解度テスト・実施記録）",
  restraint: "身体拘束等適正化セット（指針・委員会記録・記録様式）",
};
