// Free, browser-only document templates (no server, no AI): fixed text with the facility's
// details filled in. Each set returns Markdown in the same subset the app renders and exports
// to Word (lib/markdown.ts): # 〜 ### headings, paragraphs, - / 1. lists, tables, > quotes, ---.

import type { SERVICE_TYPES } from "../form";
import type { Part } from "../parts";

/** Word にも入る冒頭の注意文。全セット共通。 */
export const TEMPLATE_NOTICE =
  "> 無料テンプレート（定型文）です。法的助言ではありません。2026年10月時点の告示・通知に基づいて作成しています。【要記入】を事業所の実情に合わせて埋め、内容を確認・修正してから使ってください。減算を避けるには、書類をそろえるだけでなく、委員会の開催・研修の実施・担当者の配置などの取組を実際に行い、その記録を残すことが必要です。制度の取扱いは指定権者（都道府県・市町村）の通知を確認してください。";

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
  // 身体拘束廃止未実施減算の対象外（相談支援と同じ扱い）。BCP は1%。
  自立生活援助: "consultation",
  就労定着支援: "consultation",
  その他の障害福祉サービス: "unknown",
};

/** 障害者支援施設が昼間に行えるサービス（施行規則第1条の2）。A型は含まれない */
const SUPPORT_FACILITY_DAYTIME = new Set<ServiceType>(["生活介護", "就労移行支援", "就労継続支援B型"]);

/**
 * Free text goes into Markdown (lib/markdown.ts): a "|" would split table cells, a leading "#", "-", "1.", ">"
 * or "---" would turn the line into a heading/list/quote/page break, and "**" toggles bold. Use full-width forms.
 */
function plain(value: unknown, max: number): string {
  return String(value ?? "")
    .slice(0, max)
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "｜")
    .replace(/\*/g, "＊")
    .replace(/^(\s*)([#>]|-(?=\s|--)|\d+(?=[.)．]\s))/, (_, sp: string, m: string) => sp + m.replace(/[#>\-0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)));
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return value !== null && value !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function templateContext(raw: TemplateInput): TemplateContext {
  const serviceType: ServiceType = Object.prototype.hasOwnProperty.call(KIND, raw.serviceType) ? raw.serviceType : "その他の障害福祉サービス";
  const input: TemplateInput = {
    serviceType,
    facilityName: plain(raw.facilityName, 60),
    meetingDate: plain(raw.meetingDate, 40),
    committeeMembers: plain(raw.committeeMembers, 200),
    officerRole: plain(raw.officerRole, 60),
    staffCount: intIn(raw.staffCount, 1, 500),
    reiwaYear: intIn(raw.reiwaYear, 1, 99) ?? 8,
  };
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
