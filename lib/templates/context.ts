// Free, browser-only document templates (no server, no AI): fixed text with the facility's
// details filled in. Each set returns Markdown in the same subset the app renders and exports
// to Word (lib/markdown.ts): # 〜 ### headings, paragraphs, - / 1. lists, tables, > quotes, ---.

import type { SERVICE_TYPES } from "../form";
import type { Part } from "../parts";

export type ServiceType = (typeof SERVICE_TYPES)[number];

export type TemplateInput = {
  facilityName: string;
  serviceType: ServiceType;
  staffCount: number | null;
  /** 令和の年度（例：8 → 令和8年度＝2026年4月〜2027年3月） */
  reiwaYear: number;
  /** 委員会の開催日（自由記述。例「2026年11月20日（金）17:30〜18:30」） */
  meetingDate: string;
  /** 委員会の構成（役職のみ。氏名は書かない） */
  committeeMembers: string;
  /** 虐待防止の担当者の役職（例「児童発達支援管理責任者」） */
  officerRole: string;
};

export type ServiceKind = "residential" | "daytime" | "consultation" | "unknown";

/** Everything a template needs, derived once from the input. */
export type TemplateContext = TemplateInput & {
  kind: ServiceKind;
  /** 障害児のサービス（放デイ・児発）：「障害児又はその家族等」、児童福祉法・児童虐待防止法の記述を使う */
  child: boolean;
  /** 本文で使う呼び方：「こども」（児童）または「利用者」 */
  person: string;
  /** 身体拘束廃止未実施減算の率。相談支援は対象外（null） */
  restraintRate: string | null;
  /** 業務継続計画未策定減算の率 */
  bcpRate: string;
  /** Filled-in value, or 【要記入：label】 when blank */
  fill: (value: string | number | null | undefined, label: string) => string;
};

const KIND: Record<ServiceType, ServiceKind> = {
  放課後等デイサービス: "daytime",
  児童発達支援: "daytime",
  就労継続支援B型: "daytime",
  就労継続支援A型: "daytime",
  就労移行支援: "daytime",
  生活介護: "daytime",
  "共同生活援助（グループホーム）": "residential",
  "居宅介護・重度訪問介護": "daytime",
  短期入所: "daytime",
  相談支援: "consultation",
  その他の障害福祉サービス: "unknown",
};

/** 障害者支援施設が昼間に行えるサービス（施行規則第1条の2）。A型は含まれない */
const SUPPORT_FACILITY_DAYTIME = new Set<ServiceType>(["生活介護", "就労移行支援", "就労継続支援B型"]);

export function templateContext(input: TemplateInput): TemplateContext {
  const kind = KIND[input.serviceType];
  const child = input.serviceType === "放課後等デイサービス" || input.serviceType === "児童発達支援";
  const fill = (value: string | number | null | undefined, label: string) => {
    const v = typeof value === "number" ? String(value) : value?.trim();
    return v ? v : `【要記入：${label}】`;
  };
  return {
    ...input,
    kind,
    child,
    person: child ? "こども" : "利用者",
    restraintRate:
      kind === "consultation"
        ? null
        : kind === "residential"
          ? "所定単位数の10%"
          : kind === "unknown"
            ? "所定単位数の10%（施設・居住系）または1%（それ以外）。自立生活援助・就労定着支援・地域相談支援は対象外"
            : SUPPORT_FACILITY_DAYTIME.has(input.serviceType)
              ? "所定単位数の1%（障害者支援施設が行う場合は10%）"
              : "所定単位数の1%",
    bcpRate:
      kind === "residential"
        ? "所定単位数の3%"
        : kind === "unknown"
          ? "所定単位数の3%（施設・居住系）または1%（それ以外）"
          : SUPPORT_FACILITY_DAYTIME.has(input.serviceType)
            ? "所定単位数の1%（障害者支援施設が行う場合は3%）"
            : "所定単位数の1%",
    fill,
  };
}

/** Parts offered for a service. The restraint set is skipped where 身体拘束廃止未実施減算 does not apply. */
export function templateParts(ctx: TemplateContext): Part[] {
  return ctx.restraintRate === null ? ["committee", "training"] : ["committee", "training", "restraint"];
}
