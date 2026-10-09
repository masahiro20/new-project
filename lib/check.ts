// Rules for the free 減算リスク診断 (/check). Pure data + functions, so the page and tests share them.
// Rates: 令和6年度報酬改定の概要 (8)(9)(16)、留意事項通知（者）⑿〜⒂、（児）(8)〜(12).

export type ServiceKind = "residential" | "daytime" | "consultation" | "unknown";

export type CheckService = {
  label: string;
  kind: ServiceKind;
  /** 放デイ・児発: 支援プログラム・自己評価等の公表が別の減算になる */
  child?: boolean;
  /** Slug of the matching /guide page, if any. */
  guide?: string;
  /** Service type to preselect on /templates (a SERVICE_TYPES value in lib/form.ts). */
  template: string;
};

export const CHECK_SERVICES: CheckService[] = [
  { label: "放課後等デイサービス", kind: "daytime", child: true, guide: "houkago-day-gensan", template: "放課後等デイサービス" },
  { label: "児童発達支援", kind: "daytime", child: true, guide: "jidou-hattatsu-gensan", template: "児童発達支援" },
  { label: "就労継続支援B型", kind: "daytime", guide: "shuro-b-gensan", template: "就労継続支援B型" },
  { label: "就労継続支援A型", kind: "daytime", guide: "shuro-a-gensan", template: "就労継続支援A型" },
  { label: "就労移行支援", kind: "daytime", guide: "shuro-ikou-gensan", template: "就労移行支援" },
  { label: "生活介護（障害者支援施設が行うものを除く）", kind: "daytime", guide: "seikatsu-kaigo-gensan", template: "生活介護" },
  { label: "共同生活援助（グループホーム）", kind: "residential", guide: "group-home-gensan", template: "共同生活援助（グループホーム）" },
  { label: "施設入所支援・障害者支援施設が行うサービス", kind: "residential", guide: "shisetsu-nyusho-gensan", template: "その他の障害福祉サービス" },
  { label: "居宅介護・重度訪問介護・同行援護・行動援護", kind: "daytime", guide: "kyotaku-kaigo-gensan", template: "居宅介護・重度訪問介護" },
  { label: "短期入所", kind: "daytime", guide: "tanki-nyusho-gensan", template: "短期入所" },
  { label: "計画相談支援・障害児相談支援・地域相談支援", kind: "consultation", guide: "soudan-shien-gensan", template: "相談支援" },
  { label: "自立生活援助・就労定着支援", kind: "consultation", template: "自立生活援助" },
  { label: "その他の障害福祉サービス", kind: "unknown", template: "その他の障害福祉サービス" },
];

export type NextStep = { label: string; href: string };
export type CheckGroup = { id: string; name: string; risk: string; items: string[]; next: NextStep[] };

/** The groups that apply to a service. Restraint does not apply to consultation services. */
export function checkGroups(service: CheckService): CheckGroup[] {
  const k = service.kind;
  const rate = (residential: string, other: string) =>
    k === "residential" ? residential : k === "unknown" ? `施設・居住系${residential}、その他${other}` : other;

  const groups: CheckGroup[] = [
    {
      id: "abuse",
      name: "虐待防止措置",
      risk: "虐待防止措置未実施減算（所定単位数の1%）",
      items: [
        "直近1年以内に虐待防止委員会を開催し、議事録がある",
        "委員会の結果を職員に周知した記録がある",
        "直近1年以内に虐待防止研修を実施し、記録がある",
        "虐待防止の担当者が決まっている",
      ],
      next: [
        { label: "議事録のひな形と例", href: "/guide/gyakutai-iinkai-gijiroku" },
        { label: "研修資料の作り方", href: "/guide/gyakutai-kenshu-shiryou" },
        { label: "見本：虐待防止委員会セット", href: "/samples#committee" },
        { label: "見本：虐待防止研修セット", href: "/samples#training" },
      ],
    },
  ];
  if (k !== "consultation") {
    groups.push({
      id: "restraint",
      name: "身体拘束等の適正化",
      risk: `身体拘束廃止未実施減算（所定単位数の${rate("10%", "1%")}）`,
      items: [
        "直近1年以内に身体拘束等適正化委員会を開催した（虐待防止委員会との一体開催も可）",
        "身体拘束等の適正化のための指針がある",
        "直近1年以内に身体拘束等適正化の研修を実施した",
        "やむを得ず拘束する場合の記録様式がある",
      ],
      next: [
        { label: "身体拘束の指針ひな形", href: "/guide/shintai-kousoku-shishin" },
        { label: "委員会の一体開催", href: "/guide/iinkai-ittai-kaisai" },
        { label: "見本：身体拘束等適正化セット", href: "/samples#restraint" },
      ],
    });
  }
  groups.push(
    {
      id: "bcp",
      name: "業務継続計画（BCP）",
      risk: `業務継続計画未策定減算（所定単位数の${rate("3%", "1%")}）`,
      items: ["感染症の業務継続計画がある", "自然災害の業務継続計画がある"],
      next: [{ label: "業務継続計画未策定減算とBCPのひな形", href: "/guide/bcp-gensan-jidou" }],
    },
    {
      id: "disclosure",
      name: "情報公表",
      risk: `情報公表未報告減算（所定単位数の${rate("10%", "5%")}）`,
      items: ["障害福祉サービス等情報公表システムに、事業所の情報を報告している"],
      next: [{ label: "減算の早見表（サービス種別ごと）", href: "/guide/gensan-kasan-hayamihyo" }],
    },
  );
  if (service.child) {
    groups.push({
      id: "child",
      name: "障害児通所支援の公表",
      risk: "支援プログラム未公表減算・自己評価結果等未公表減算（それぞれ所定単位数の85%で算定）",
      items: ["支援プログラムを作成し、公表して届け出ている", "自己評価・保護者評価をおおむね1年に1回以上行い、結果を公表して届け出ている"],
      next: [{ label: "自己評価・保護者評価の公表と減算", href: "/guide/jidou-hyouka-kouhyou" }],
    });
  }
  return groups;
}

export const NOT_APPLICABLE_NOTE: Record<ServiceKind, string | null> = {
  residential: null,
  daytime: null,
  consultation: "このサービスは、身体拘束廃止未実施減算の対象外です（令和6年度報酬改定の概要）。",
  unknown: "サービス種別によって減算率や対象が異なります。率は「施設・居住系／その他」の両方を表示しています。",
};

// Shareable result in the URL fragment (#r=<service>-<bits>): fragments are never sent to the
// server, so "入力内容は送信されません" stays true even for a shared link.
export function encodeResult(serviceIndex: number, checked: boolean[]): string {
  const bits = checked.reduce((n, on, i) => (on ? n | (1 << i) : n), 0);
  return `r=${serviceIndex}-${bits.toString(36)}`;
}

export function decodeResult(hash: string): { serviceIndex: number; checked: (i: number) => boolean } | null {
  const m = /^#?r=(\d+)-([0-9a-z]+)$/.exec(hash);
  if (!m) return null;
  const serviceIndex = Number(m[1]);
  if (!CHECK_SERVICES[serviceIndex]) return null;
  const bits = parseInt(m[2], 36);
  return { serviceIndex, checked: (i) => (bits & (1 << i)) !== 0 };
}
