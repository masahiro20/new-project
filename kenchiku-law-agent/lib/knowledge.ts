// Rule knowledge base. Every rule cites the exact article it rests on; the
// captions in `expectCaption` were read from the e-Gov 法令API on 2026-10-18 and
// `npm run verify-sources` re-checks them so a renumbered article is caught.
//
// Numbers quoted in `summary` are taken from the article text itself (see
// data/law-snapshot.json). Ordinance-level details (条例) vary by municipality
// and are flagged as such rather than guessed.

import type { PlanInput } from "./plan";
import type { LawKey } from "./laws";

export type Role = "設計" | "コーディネーター" | "施工" | "営業";
export type Severity = "required" | "likely" | "check";
export type Category =
  | "まず確認すること"
  | "手続き・申請"
  | "敷地・道路"
  | "用途・形態制限"
  | "防火・避難・消防"
  | "構造・居室"
  | "土地・区域・開発"
  | "農地・山林"
  | "造成・災害リスク"
  | "資格・契約・販売"
  | "工事・解体"
  | "近隣・民事";

export type Cite = { law: LawKey; article: string; expectCaption?: string; note?: string };
export type Ref = { label: string; url: string; publisher: string };

/** When in the project the item bites. */
export type Stage = "計画段階" | "設計" | "申請・届出" | "工事・引渡し";
export const STAGE_ORDER: Stage[] = ["計画段階", "設計", "申請・届出", "工事・引渡し"];
export const STAGE_HINT: Record<Stage, string> = {
  計画段階: "建てられるか・規模・工程が決まる。土地契約や設計の前に役所へ確認する",
  設計: "配置・構造・仕様に効く。設計図に反映する",
  "申請・届出": "着工前後の申請・届出。時期を工程表に入れる",
  "工事・引渡し": "工事段階の届出・現場管理",
};

export type RuleMeta = {
  stage: Stage;
  /** Counter to consult (事前協議・確認先). */
  agency: string;
  /** True for obligations that apply to virtually every new house; shown folded. */
  routine?: boolean;
};

export type Rule = RuleMeta & {
  id: string;
  category: Category;
  title: string;
  /** What the law requires, with the thresholds that matter. */
  summary: string;
  /** Concrete next step and the counter to go to. */
  action: string;
  roles: Role[];
  cites: Cite[];
  refs?: Ref[];
  when: (p: PlanInput) => Severity | null;
};

const isBuild = (p: PlanInput) => ["新築", "増築", "改築・大規模修繕・模様替", "未定"].includes(p.workType);
const isNew = (p: PlanInput) => p.workType === "新築" || p.workType === "未定";
const isHousing = (p: PlanInput) => ["専用住宅", "兼用住宅（店舗・事務所併用）", "長屋", "共同住宅・寄宿舎"].includes(p.buildingUse);
const isSpecial = (p: PlanInput) =>
  [
    "共同住宅・寄宿舎",
    "店舗・飲食店",
    "工場・作業場・倉庫",
    "宿泊施設（旅館・ホテル・民泊）",
    "福祉施設・保育所・児童福祉施設",
    "病院・診療所",
    "自動車車庫・修理工場",
    "学校・集会場",
  ].includes(p.buildingUse);
const lowRise = (p: PlanInput) => ["第一種低層住居専用地域", "第二種低層住居専用地域", "田園住居地域"].includes(p.zoning);
const residentialOnly = (p: PlanInput) =>
  lowRise(p) || ["第一種中高層住居専用地域", "第二種中高層住居専用地域"].includes(p.zoning);
const mentions = (p: PlanInput, re: RegExp) => re.test(`${p.description}\n${p.landInfo}`);
const has = (p: PlanInput, h: PlanInput["hazards"][number]) => p.hazards.includes(h);
const extra = (p: PlanInput, e: PlanInput["extras"][number]) => p.extras.includes(e);
const farmOnSite = (p: PlanInput) => p.signals.farmland === "敷地が農地の可能性" || p.landCategory === "田・畑（農地）";
const waterWithin = (p: PlanInput, m: number) => p.signals.waterMeters !== null && p.signals.waterMeters <= m;
/** 資料のメモに「道路との間に水路」「水路を挟んで」などとあるとき。 */
const WATER_BETWEEN = /(間|あいだ)に(は)?(水路|青線|用水|河川|川)|(水路|青線|用水|川)を(挟|はさ)/;
const ruralArea = (p: PlanInput) => ["市街化調整区域", "非線引き都市計画区域", "準都市計画区域", "都市計画区域外"].includes(p.areaDivision);

const MLIT_KAISEI: Ref = {
  label: "国土交通省「2025年4月からルールを改正します」（省エネ基準適合義務化・4号特例見直し・壁量計算見直し）",
  url: "https://www.mlit.go.jp/report/press/content/001841001.pdf",
  publisher: "国土交通省",
};
const MLIT_4GO: Ref = {
  label: "国土交通省「4号特例」見直しのポイント（新2号・新3号建築物）",
  url: "https://www.mlit.go.jp/common/001500388.pdf",
  publisher: "国土交通省",
};
const MLIT_MANUAL: Ref = {
  label: "国土交通省 改正建築基準法 2階建ての木造一戸建て住宅等の確認申請・審査マニュアル（経過措置対応版）",
  url: "https://www.mlit.go.jp/common/001860611.pdf",
  publisher: "国土交通省",
};
const MLIT_KAIHATSU: Ref = {
  label: "国土交通省 開発許可制度の概要",
  url: "https://www.mlit.go.jp/toshi/city_plan/toshi_city_plan_fr_000046.html",
  publisher: "国土交通省",
};
const MLIT_UNYO: Ref = {
  label: "国土交通省 開発許可制度運用指針（最終改正 令和7年3月19日）",
  url: "https://www.mlit.go.jp/toshi/city_plan/content/001877574.pdf",
  publisher: "国土交通省",
};
const MLIT_MORIDO: Ref = {
  label: "国土交通省 盛土規制法について",
  url: "https://www.mlit.go.jp/toshi/web/morido.html",
  publisher: "国土交通省",
};
const MLIT_MORIDO_GAIYO: Ref = {
  label: "国土交通省 盛土規制法の概要",
  url: "https://www.mlit.go.jp/toshi/morido-gaiyou.html",
  publisher: "国土交通省",
};
const MAFF_TENYO: Ref = {
  label: "農林水産省 農業振興地域制度・農地転用許可制度（参考資料）",
  url: "https://www.maff.go.jp/j/nousin/noukei/totiriyo/tenyou_kisei/270403/pdf/sankou1.pdf",
  publisher: "農林水産省",
};
const MAFF_IHAN: Ref = {
  label: "農林水産省 農地の違反転用発生防止・早期発見・早期是正へ向けた取組み",
  url: "https://www.maff.go.jp/j/nousin/noukei/totiriyo/ihan_tenyo.html",
  publisher: "農林水産省",
};
const FDMA_QA: Ref = {
  label: "消防庁 住宅用火災警報器Q&A",
  url: "https://www.fdma.go.jp/relocation/html/life/yobou_contents/qa/",
  publisher: "総務省消防庁",
};
const SHOENE_FAQ: Ref = {
  label: "建築物省エネ法 オンライン講座 FAQ（建築基準法関係）",
  url: "https://www.shoenehou-online.mlit.go.jp/faq/standards/",
  publisher: "国土交通省",
};

const RULE_DEFS: Omit<Rule, keyof RuleMeta>[] = [
  // ---------------------------------------------------------------- まず確認
  {
    id: "zoning-unknown",
    category: "まず確認すること",
    title: "区域区分・用途地域・防火指定が未確認",
    summary:
      "都市計画の区域区分（市街化区域／調整区域など）、用途地域、防火・準防火地域の指定は、建てられる用途・規模・構造・手続きのほぼ全てを左右します。これが不明のまま計画を進めると、後工程で設計をやり直すことになります。",
    action:
      "市区町村の都市計画課（都市計画情報の閲覧・Web地図）で、区域区分・用途地域・建蔽率・容積率・高度地区・防火指定・地区計画・都市計画道路の有無を確認し、入力し直してください。土地の売買を伴う場合は宅建業者の重要事項説明書にも記載があります。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "toshikeikakuho", article: "7", expectCaption: "（区域区分）" },
      { law: "toshikeikakuho", article: "8", expectCaption: "（地域地区）" },
      { law: "kenkiho", article: "48", expectCaption: "（用途地域等）" },
    ],
    when: (p) => (p.areaDivision === "不明" || p.zoning === "不明" || p.fireZone === "不明" ? "check" : null),
  },
  {
    id: "road-unknown",
    category: "まず確認すること",
    title: "前面道路の種別・幅員・接道長さが未確認",
    summary:
      "建築基準法上の「道路」（原則幅員4m以上）に2m以上接していないと、原則として建築できません。見た目が道路でも、農道・水路・通路・私道は法上の道路に該当しないことがあります。",
    action:
      "特定行政庁（市区町村の建築指導課）の道路種別図・道路台帳で、前面道路が法42条のどの道路か（1項1号〜5号、2項）、幅員、認定幅員と現況幅員の差を確認し、接道長さを実測してください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kenkiho", article: "42", expectCaption: "（道路の定義）" },
      { law: "kenkiho", article: "43", expectCaption: "（敷地等と道路との関係）" },
    ],
    when: (p) => (isBuild(p) && (p.roadType === "不明" || p.roadWidth === null || p.frontage === null) ? "check" : null),
  },
  {
    id: "hazard-unknown",
    category: "まず確認すること",
    title: "災害リスク区域・各種指定区域の該当が未確認",
    summary:
      "土砂災害（特別）警戒区域、宅地造成等工事規制区域、浸水想定区域、埋蔵文化財包蔵地、景観計画区域、地区計画などは、該当すると許可・届出・構造制限・重要事項説明が追加されます。入力が空欄の場合は「該当なし」ではなく「未確認」として扱います。",
    action:
      "都道府県・市区町村のハザードマップと都市計画情報、埋蔵文化財包蔵地図（教育委員会）を確認し、該当する区域を入力してください。宅地造成等工事規制区域の指定は令和5年以降順次進んでいるため、古い情報で判断しないでください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "doshaho", article: "7", expectCaption: "（土砂災害警戒区域）" },
      { law: "moridoho", article: "10" },
      { law: "bunkazaiho", article: "93", expectCaption: "（土木工事等のための発掘に関する届出及び指示）" },
    ],
    refs: [MLIT_MORIDO],
    when: (p) => (p.hazards.length === 0 ? "check" : null),
  },

  // ---------------------------------------------------------------- 手続き
  {
    id: "kakunin-shinsei",
    category: "手続き・申請",
    title: "建築確認申請（着工前）",
    summary:
      "2025年4月1日以降に着工する建築物は、①別表第一の特殊建築物で用途部分200㎡超、②階数2以上または延べ面積200㎡超、③都市計画区域等内のその他の建築物、のいずれかに該当すれば確認申請が必要です（法6条1項）。防火・準防火地域外で10㎡以内の増築・改築・移転は不要（同2項）。審査期間は①②が35日以内、③が7日以内（同4項）。",
    action:
      "建築主事または指定確認検査機関へ確認申請。木造2階建て住宅は旧4号から「新2号建築物」になり、構造関係規定・省エネ関連の図書提出と審査が必要です。平屋200㎡以下（新3号）でも基準適合は必要で、審査が省略されるだけです。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "kenkiho", article: "6", expectCaption: "（建築物の建築等に関する申請及び確認）" },
      { law: "kenkiho", article: "6_4", expectCaption: "（建築物の建築に関する確認の特例）" },
    ],
    refs: [MLIT_KAISEI, MLIT_4GO, MLIT_MANUAL],
    when: (p) => (isBuild(p) ? "required" : null),
  },
  {
    id: "shinsa-shoryaku",
    category: "手続き・申請",
    title: "審査省略（新3号建築物）に該当するかの判定",
    summary:
      "審査省略の対象は、法6条1項3号の建築物（平屋かつ延べ面積200㎡以下で、特殊建築物200㎡超でないもの）で建築士の設計に係るものに限られます（法6条の4 1項3号）。階数2以上または200㎡超の木造住宅は新2号建築物となり、構造・省エネの図書が審査対象になります。",
    action:
      "階数・延べ面積から新2号／新3号を判定し、新2号なら壁量計算書・柱の小径・基礎の仕様・省エネ計算書など追加図書の作成工程を見積りに織り込んでください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kenkiho", article: "6_4", expectCaption: "（建築物の建築に関する確認の特例）" },
      { law: "kenkirei", article: "46", expectCaption: "（構造耐力上必要な軸組等）" },
    ],
    refs: [MLIT_4GO, MLIT_MANUAL],
    when: (p) => {
      if (!isBuild(p) || p.structure !== "木造") return null;
      if (p.floors === null || p.totalFloorArea === null) return "check";
      return "likely";
    },
  },
  {
    id: "kozo-keisan",
    category: "構造・居室",
    title: "構造計算が必要な規模（法20条）",
    summary:
      "高さ60m以下の建築物のうち、木造は地階を除く階数4以上または高さ16m超で2号（高度な構造計算）、階数3以上または延べ面積300㎡超で3号（許容応力度計算等）が必要です。鉄骨造は地階を除く階数4以上、RC造・SRC造は高さ20m超で2号。これ未満の木造2階建て等でも、壁量・柱の小径（令46条）など仕様規定への適合が確認審査の対象です。",
    action:
      "規模が3号以上なら構造計算書を作成（木造300㎡超・階数3以上は構造計算ルートの選定が設計工程の律速になります）。2025年4月以降は壁量計算の算定式が改正されているので、旧基準の早見表を使わないでください。",
    roles: ["設計"],
    cites: [
      { law: "kenkiho", article: "20", expectCaption: "（構造耐力）" },
      { law: "kenkirei", article: "46", expectCaption: "（構造耐力上必要な軸組等）" },
    ],
    refs: [MLIT_KAISEI, MLIT_MANUAL],
    when: (p) => {
      if (!isBuild(p)) return null;
      const f = p.floors ?? 0;
      const a = p.totalFloorArea ?? 0;
      const h = p.height ?? 0;
      if (p.structure === "木造" && (f >= 3 || a > 300 || h > 16)) return "required";
      if (p.structure === "鉄骨造" && f >= 4) return "required";
      if (p.structure === "RC造・SRC造" && h > 20) return "required";
      if (p.floors === null || p.totalFloorArea === null) return "check";
      return "likely";
    },
  },
  {
    id: "shoene",
    category: "手続き・申請",
    title: "省エネ基準適合義務・省エネ適合性判定",
    summary:
      "2025年4月以降に着工する全ての新築・増改築で省エネ基準への適合が義務化されました。確認申請を要する建築で、法6条の4 1項3号（新3号）以外のものは着工前に建築物エネルギー消費性能適合性判定（省エネ適判）が必要です（省エネ法11条）。仕様基準で評価する場合は適判が不要になります。",
    action:
      "外皮性能（UA値・ηAC値）と一次エネルギー消費量の計算、または仕様基準での確認を設計初期に行い、確認申請の前に適判（登録省エネ判定機関）を済ませてください。適合しないと確認済証が交付されません。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "shoeneho", article: "11", expectCaption: "（建築物エネルギー消費性能適合性判定）" },
      { law: "shoeneho", article: "13", expectCaption: "（基準適合命令等）" },
    ],
    refs: [MLIT_KAISEI, SHOENE_FAQ],
    when: (p) => (["新築", "増築", "改築・大規模修繕・模様替", "未定"].includes(p.workType) ? "required" : null),
  },
  {
    id: "kanryo-kensa",
    category: "手続き・申請",
    title: "中間検査・完了検査と検査済証前の使用制限",
    summary:
      "確認を受けた工事が完了したら完了検査の申請が必要です（法7条）。法6条1項1号・2号の建築物は、検査済証の交付を受けるまで原則として使用できません（法7条の6）。特定行政庁が指定する工程では中間検査も必要です。",
    action: "工程表に中間検査・完了検査の日程と、検査済証交付までは引渡し・使用開始できないことを織り込み、施主にも事前説明してください。",
    roles: ["施工", "コーディネーター", "営業"],
    cites: [
      { law: "kenkiho", article: "7", expectCaption: "（建築物に関する完了検査）" },
      { law: "kenkiho", article: "7_6", expectCaption: "（検査済証の交付を受けるまでの建築物の使用制限）" },
    ],
    when: (p) => (isBuild(p) ? "required" : null),
  },
  {
    id: "koji-todoke",
    category: "手続き・申請",
    title: "建築工事届・建築物除却届",
    summary: "床面積10㎡超の建築・除却は、建築主事等を経由して都道府県知事に届け出ます（法15条）。確認申請と同時に提出するのが通例です。",
    action: "確認申請時に建築工事届を添付。解体を伴う場合は除却届も忘れないこと。",
    roles: ["設計", "施工"],
    cites: [{ law: "kenkiho", article: "15", expectCaption: "（届出及び統計）" }],
    when: (p) => (isBuild(p) || p.workType === "解体のみ" ? "required" : null),
  },
  {
    id: "shobo-doi",
    category: "防火・避難・消防",
    title: "消防同意",
    summary:
      "確認申請には所轄消防長（消防署長）の同意が必要です。ただし、防火地域・準防火地域以外の区域内の住宅（長屋・共同住宅等を除く）は同意が不要です（法93条1項ただし書、消防法7条1項ただし書）。",
    action: "防火・準防火地域内、または住宅以外・長屋・共同住宅の計画は、消防同意の期間（確認審査期間に加算）を工程に含めてください。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "kenkiho", article: "93", expectCaption: "（許可又は確認に関する消防長等の同意等）" },
      { law: "shoboho", article: "7" },
    ],
    when: (p) => {
      if (!isBuild(p)) return null;
      const fire = p.fireZone === "防火地域" || p.fireZone === "準防火地域";
      const notDetached = p.buildingUse !== "専用住宅" && p.buildingUse !== "兼用住宅（店舗・事務所併用）";
      if (fire || notDetached) return "required";
      return p.fireZone === "不明" ? "check" : null;
    },
  },
  {
    id: "yoto-henko",
    category: "手続き・申請",
    title: "用途変更の確認申請",
    summary:
      "建築物の用途を変更して別表第一の特殊建築物（用途部分200㎡超）にする場合は、確認申請の規定が準用されます（法87条1項）。確認が不要な規模でも、変更後の用途に応じた防火・避難・消防法の規定は満たす必要があります。",
    action: "変更前後の用途・面積を整理し、類似用途（令137条の18）に該当するかを建築指導課で事前相談。検査済証の有無を先に確認してください（無いと手続きが大幅に難しくなります）。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [{ law: "kenkiho", article: "87", expectCaption: "（用途の変更に対するこの法律の準用）" }],
    when: (p) => (p.workType === "用途変更" ? "required" : null),
  },

  // ---------------------------------------------------------------- 敷地・道路
  {
    id: "setsudo",
    category: "敷地・道路",
    title: "接道義務（2m以上）",
    summary:
      "建築物の敷地は、建築基準法上の道路（幅員4m以上。42条）に2m以上接しなければなりません（法43条1項）。接していない敷地は、幅員4m以上の道に2m以上接する一定の建築物の認定、または建築審査会の同意を得た許可（43条2項）がなければ建築できません。",
    action:
      "接道長さが2m未満、または前面が法上の道路でない場合は、計画の前に建築指導課で43条2項の認定・許可の見込みを確認。旗竿地は路地状部分の幅を実測し、条例の路地状敷地制限（長さに応じて幅2m超を求める自治体あり）も確認してください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kenkiho", article: "43", expectCaption: "（敷地等と道路との関係）" },
      { law: "kenkiho", article: "42", expectCaption: "（道路の定義）" },
    ],
    when: (p) => {
      if (!isBuild(p)) return null;
      if (p.roadType === "道路に該当しない・不明（通路・農道・水路等）") return "required";
      if (p.frontage !== null && p.frontage < 2) return "required";
      if (p.roadWidth !== null && p.roadWidth < 4 && p.roadType !== "2項道路（幅員4m未満の既存道）") return "required";
      // Road type, width and frontage all known and sufficient: nothing left to check.
      const lawfulRoad = p.roadType === "建築基準法上の道路（42条1項）" || p.roadType === "位置指定道路（42条1項5号）";
      if (lawfulRoad && p.frontage !== null && p.frontage >= 2 && (p.roadWidth === null || p.roadWidth >= 4)) return null;
      return "likely";
    },
  },
  {
    id: "setback",
    category: "敷地・道路",
    title: "2項道路のセットバック（道路中心線から2m）",
    summary:
      "幅員4m未満の既存道で特定行政庁が指定したもの（2項道路）は、道路中心線から水平距離2m（指定区域では3m）の線が道路境界線とみなされます（法42条2項）。後退部分には建築物・門・塀を建てられず、敷地面積にも算入できないため、建蔽率・容積率の計算に効きます（令2条1項1号）。",
    action: "現況幅員と中心線を測量し、後退後の有効敷地面積で建蔽率・容積率を再計算。道路の反対側が崖・川・線路敷の場合は一方後退（4m）になります。",
    roles: ["設計", "営業"],
    cites: [
      { law: "kenkiho", article: "42", expectCaption: "（道路の定義）" },
      { law: "kenkirei", article: "2", expectCaption: "（面積、高さ等の算定方法）" },
    ],
    when: (p) => {
      if (!isBuild(p)) return null;
      if (p.roadType === "2項道路（幅員4m未満の既存道）") return "required";
      if (p.roadWidth !== null && p.roadWidth < 4) return "likely";
      return null;
    },
  },
  {
    id: "shido",
    category: "敷地・道路",
    title: "私道・位置指定道路",
    summary:
      "位置指定道路（法42条1項5号）は令144条の4の基準（幅員4m以上、原則両端が他の道路に接続、袋路状は35m以下など）で指定されます。私道の変更・廃止は、接道義務に抵触する場合は特定行政庁が禁止・制限できます（法45条）。",
    action: "私道の所有者・持分、掘削承諾（上下水道・ガス引込み）、通行承諾を契約前に書面で確保。位置指定図（指定年月日・番号）を取得して現況と照合してください。",
    roles: ["営業", "コーディネーター", "設計"],
    cites: [
      { law: "kenkiho", article: "42", expectCaption: "（道路の定義）" },
      { law: "kenkirei", article: "144_4", expectCaption: "（道に関する基準）" },
      { law: "kenkiho", article: "45", expectCaption: "（私道の変更又は廃止の制限）" },
    ],
    when: (p) => (p.roadType === "位置指定道路（42条1項5号）" || extra(p, "私道に接する") ? "likely" : null),
  },
  {
    id: "kenpei-yoseki",
    category: "用途・形態制限",
    title: "建蔽率・容積率",
    summary:
      "建蔽率は用途地域ごとに都市計画で定めた数値（例：低層住専・中高層住専・田園住居・工業専用は3/10〜6/10のうち指定値）を超えてはならず（法53条）、容積率も都市計画の指定値以下で、さらに前面道路幅員12m未満では幅員×法定乗数（住居系4/10、その他6/10）との小さい方が上限です（法52条2項）。角地・防火地域内の耐火建築物等は建蔽率が緩和されます（法53条3項）。",
    action: "都市計画図で指定建蔽率・容積率を確認し、前面道路幅員による容積率制限、セットバック後の敷地面積で再計算。住宅の地階（法52条3項）、車庫（令2条1項4号・3項）、共用廊下・エレベーター（法52条6項）の容積率不算入は条件を確認してください。",
    roles: ["設計", "営業"],
    cites: [
      { law: "kenkiho", article: "53", expectCaption: "（建蔽率）" },
      { law: "kenkiho", article: "52", expectCaption: "（容積率）" },
    ],
    when: (p) => (isBuild(p) ? "required" : null),
  },
  {
    id: "low-rise-form",
    category: "用途・形態制限",
    title: "低層住居専用地域等の外壁後退・絶対高さ（10m/12m）",
    summary:
      "第一種・第二種低層住居専用地域、田園住居地域では、都市計画で定めがあれば外壁を敷地境界線から1mまたは1.5m後退させ（法54条）、建築物の高さは10mまたは12mの指定値を超えられません（法55条）。北側斜線（法56条1項3号）も適用されます。",
    action: "都市計画図で外壁後退距離・高さ限度・敷地面積の最低限度（法53条の2）の指定を確認。3階建てや屋根形状はこの地域では成立しないことが多いので、営業段階で確認してください。",
    roles: ["設計", "営業"],
    cites: [
      { law: "kenkiho", article: "54", expectCaption: "（第一種低層住居専用地域等内における外壁の後退距離）" },
      { law: "kenkiho", article: "55", expectCaption: "（第一種低層住居専用地域等内における建築物の高さの限度）" },
      { law: "kenkiho", article: "53_2", expectCaption: "（建築物の敷地面積）" },
    ],
    when: (p) => (isBuild(p) && lowRise(p) ? "required" : null),
  },
  {
    id: "shasen",
    category: "用途・形態制限",
    title: "道路斜線・隣地斜線・北側斜線",
    summary:
      "建築物の各部分の高さは、前面道路の反対側境界線からの距離に応じた道路斜線、隣地境界線からの隣地斜線、住居専用地域（低層・中高層・田園住居）では北側斜線によって制限されます（法56条）。天空率による緩和（法56条7項）も選択できます。",
    action: "敷地の方位・前面道路幅員・隣地との高低差を測量し、斜線制限を断面図で確認。北側道路や北側隣地が低い場合は特に注意。",
    roles: ["設計"],
    cites: [{ law: "kenkiho", article: "56", expectCaption: "（建築物の各部分の高さ）" }],
    when: (p) => (isBuild(p) ? (residentialOnly(p) ? "required" : "likely") : null),
  },
  {
    id: "nichiei",
    category: "用途・形態制限",
    title: "日影規制",
    summary:
      "地方公共団体の条例で指定する区域内では、冬至日の8時〜16時に敷地境界線から5m・10mの線で測った日影時間の上限が定められています（法56条の2、別表第四）。対象は低層住専・田園住居で軒高7m超または地階を除く階数3以上、その他の住居系・近商・準工等で高さ10m超などです。",
    action: "3階建て・高さ10m超・軒高7m超の計画は、条例の指定区域と測定面・規制時間を確認し、日影図で検証してください。",
    roles: ["設計"],
    cites: [{ law: "kenkiho", article: "56_2", expectCaption: "（日影による中高層の建築物の高さの制限）" }],
    when: (p) => {
      if (!isBuild(p)) return null;
      if ((p.floors ?? 0) >= 3 || (p.height ?? 0) > 10) return "likely";
      return p.floors === null && p.height === null ? "check" : null;
    },
  },
  {
    id: "shikichi-eisei",
    category: "敷地・道路",
    title: "敷地の衛生・安全（排水、崖・擁壁）",
    summary:
      "敷地は接する道より高く、地盤面は周囲より高くするのが原則で、崖崩れ等の被害を受けるおそれがある場合は擁壁の設置など安全上適当な措置が必要です（法19条）。崖に近接する敷地は多くの都道府県が建築基準条例で「がけ条例」（崖高の2倍以内の距離の建築制限など）を定めています。",
    action: "高低差・既存擁壁の種類と検査済証の有無を現地で確認。無確認の既存擁壁は建て替えや構造補強を求められることがあるため、見積り前に建築指導課へ相談してください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [{ law: "kenkiho", article: "19", expectCaption: "（敷地の衛生及び安全）" }],
    when: (p) => (isBuild(p) ? (extra(p, "高さ2m超の擁壁・崖に近接") ? "required" : "likely") : null),
  },
  {
    id: "saitei-shikichi",
    category: "用途・形態制限",
    title: "敷地面積の最低限度",
    summary: "用途地域に関する都市計画で敷地面積の最低限度（200㎡以下の値）が定められている場合、それ未満の敷地には原則として建築できません（法53条の2）。地区計画や条例でも最低敷地が定められることがあります。",
    action: "分筆・分割して建てる計画は、都市計画・地区計画の最低敷地面積を確認してください。",
    roles: ["営業", "設計"],
    cites: [{ law: "kenkiho", article: "53_2", expectCaption: "（建築物の敷地面積）" }],
    when: (p) => (isBuild(p) && (p.siteArea !== null && p.siteArea < 200 || mentions(p, /分筆|分割|分譲/)) ? "likely" : null),
  },
  {
    id: "lifeline",
    category: "敷地・道路",
    title: "上下水道・浄化槽の引込みと届出",
    summary:
      "公共下水道の処理区域内では排水設備の設置が義務で（下水道法10条）、くみ取便所は供用開始から3年以内に水洗化が必要です（11条の3）。下水道がない場合は浄化槽の設置届（浄化槽法5条）。給水装置は水道法16条の構造・材質基準に適合させ、水道事業者の手続きが必要です。他人の土地を通さないと引込みができない場合、民法213条の2の設備設置権が根拠になります。",
    action: "前面道路の本管（下水・上水・ガス）の位置と口径、取出し可否、受益者負担金・加入金を自治体で確認。私道経由の引込みは所有者の掘削承諾を事前に取得。",
    roles: ["コーディネーター", "設計", "営業"],
    cites: [
      { law: "gesuidoho", article: "10", expectCaption: "（排水設備の設置等）" },
      { law: "jokasoho", article: "5", expectCaption: "（設置等の届出、勧告及び変更命令）" },
      { law: "suidoho", article: "16", expectCaption: "（給水装置の構造及び材質）" },
      { law: "minpo", article: "213_2", expectCaption: "（継続的給付を受けるための設備の設置権等）" },
    ],
    when: (p) => (isNew(p) ? (extra(p, "浄化槽（下水道なし）") || extra(p, "井戸・上水道の新規引込み") ? "required" : "likely") : null),
  },

  // ---------------------------------------------------------------- 用途
  {
    id: "yoto-seigen",
    category: "用途・形態制限",
    title: "用途地域による用途制限（法48条・別表第二）",
    summary:
      "建てられる用途は用途地域ごとに別表第二で定められています。例：第一種低層住居専用地域は住宅・兼用住宅（延べ面積の1/2以上が居住用で、店舗等部分50㎡以下。令130条の3）・共同住宅・学校・老人ホーム・保育所・診療所などに限られ、事務所専用・店舗専用・工場・ホテル・病院は建てられません。工業専用地域では住宅・共同住宅・老人ホーム・物販店舗・飲食店が禁止。工業地域ではホテル・旅館・学校・病院が禁止です。",
    action: "計画用途が別表第二で許容されるかを確認。許容されない場合は特定行政庁の許可（法48条ただし書）が必要で、原則として長期の手続きになります。特別用途地区・特定用途制限地域の条例上乗せも確認。",
    roles: ["営業", "設計", "コーディネーター"],
    cites: [
      { law: "kenkiho", article: "48", expectCaption: "（用途地域等）" },
      { law: "kenkirei", article: "130_3", expectCaption: "（第一種低層住居専用地域内に建築することができる兼用住宅）" },
    ],
    when: (p) => {
      if (!(isBuild(p) || p.workType === "用途変更")) return null;
      if (p.zoning === "不明") return "check";
      // 専用住宅・長屋・共同住宅は工業専用地域以外ではどの用途地域でも建てられる（別表第二）。それ以外の用途だけ確認対象にする。
      const dwelling = ["専用住宅", "長屋", "共同住宅・寄宿舎"].includes(p.buildingUse);
      if (dwelling && p.zoning !== "工業専用地域") return null;
      return "required";
    },
  },
  {
    id: "tokushu",
    category: "防火・避難・消防",
    title: "特殊建築物の耐火・避難・内装制限",
    summary:
      "共同住宅・店舗・飲食店・旅館・ホテル・病院・児童福祉施設等・学校・倉庫・車庫などは別表第一の特殊建築物で、階数や面積に応じて耐火建築物等とする義務（法27条）、避難規定（法35条：直通階段・2方向避難・排煙・非常用照明など。令120条・121条・126条の2・126条の4）、内装制限（法35条の2、令128条の4・128条の5）、防火区画（令112条）が適用されます。",
    action: "用途・階数・面積から法27条の該当（例：共同住宅3階以上の階300㎡以上、物販店舗500㎡以上など別表第一）、2以上の直通階段の要否、排煙・非常用照明の要否を早期に整理し、プランに反映してください。",
    roles: ["設計"],
    cites: [
      { law: "kenkiho", article: "27", expectCaption: "（耐火建築物等としなければならない特殊建築物）" },
      { law: "kenkiho", article: "35", expectCaption: "（特殊建築物等の避難及び消火に関する技術的基準）" },
      { law: "kenkiho", article: "35_2", expectCaption: "（特殊建築物等の内装）" },
      { law: "kenkirei", article: "112", expectCaption: "（防火区画）" },
      { law: "kenkirei", article: "121", expectCaption: "（二以上の直通階段を設ける場合）" },
      { law: "kenkirei", article: "126_2", expectCaption: "（設置）", note: "排煙設備" },
      { law: "kenkirei", article: "126_4", expectCaption: "（設置）", note: "非常用の照明装置" },
    ],
    when: (p) => (isSpecial(p) && (isBuild(p) || p.workType === "用途変更") ? "required" : null),
  },
  {
    id: "kaihekiheki",
    category: "防火・避難・消防",
    title: "長屋・共同住宅の界壁",
    summary: "長屋・共同住宅の各戸の界壁は、遮音性能を持たせ、原則として小屋裏または天井裏に達するものとしなければなりません（法30条、令114条1項）。天井に遮音・防火性能を持たせる場合の緩和（法30条2項）があります。",
    action: "界壁の仕様（準耐火構造＋遮音）と、天井裏までの立上げ、または遮音天井による代替を決めてください。",
    roles: ["設計"],
    cites: [
      { law: "kenkiho", article: "30", expectCaption: "（長屋又は共同住宅の各戸の界壁）" },
      { law: "kenkirei", article: "114", expectCaption: "（建築物の界壁、間仕切壁及び隔壁）" },
    ],
    when: (p) => (isBuild(p) && (p.buildingUse === "長屋" || p.buildingUse === "共同住宅・寄宿舎") ? "required" : null),
  },
  {
    id: "barrier-free",
    category: "用途・形態制限",
    title: "バリアフリー法の基準適合義務（2,000㎡以上）",
    summary:
      "病院・診療所、物販店舗、ホテル・旅館、飲食店、老人ホーム等の特別特定建築物（令5条）で床面積2,000㎡以上（公衆便所は50㎡）の建築・用途変更は、建築物移動等円滑化基準への適合が義務です（法14条、令9条）。地方公共団体は条例で対象規模の引下げ・用途追加ができ（法14条3項）、多くの都府県が条例で上乗せしています。",
    action: "延べ面積2,000㎡未満でも、所在地の福祉のまちづくり条例・バリアフリー条例の対象規模（例：500㎡、1,000㎡）を確認してください。",
    roles: ["設計"],
    cites: [
      { law: "barrierfreeho", article: "14", expectCaption: "（特別特定建築物の建築主等の基準適合義務等）" },
      { law: "barrierfreerei", article: "9", expectCaption: "（基準適合義務の対象となる特別特定建築物の規模）" },
      { law: "barrierfreerei", article: "5", expectCaption: "（特別特定建築物）" },
    ],
    when: (p) => {
      const target = ["店舗・飲食店", "宿泊施設（旅館・ホテル・民泊）", "福祉施設・保育所・児童福祉施設", "病院・診療所", "学校・集会場"].includes(p.buildingUse);
      if (!target || !(isBuild(p) || p.workType === "用途変更")) return null;
      if ((p.totalFloorArea ?? 0) >= 2000) return "required";
      return "check";
    },
  },
  {
    id: "chusha",
    category: "用途・形態制限",
    title: "駐車施設の附置義務（条例）",
    summary: "商業地域・近隣商業地域等の駐車場整備地区や条例指定区域では、一定規模以上の建築物に駐車施設の附置が条例で義務付けられます（駐車場法20条）。対象規模・台数の算定は市の条例ごとに異なります。",
    action: "延べ面積・用途から附置義務条例の対象かを市の担当課で確認。共同住宅は別途、開発許可や地区計画で駐車場設置基準が課されることがあります。",
    roles: ["設計", "営業"],
    cites: [{ law: "chushajoho", article: "20", expectCaption: "（建築物の新築又は増築の場合の駐車施設の附置）" }],
    when: (p) =>
      isBuild(p) && ["商業地域", "近隣商業地域", "準住居地域", "準工業地域"].includes(p.zoning) && (p.totalFloorArea ?? 0) >= 1000 ? "likely" : null,
  },
  {
    id: "minpaku",
    category: "用途・形態制限",
    title: "宿泊利用（旅館業許可・住宅宿泊事業の届出）",
    summary:
      "宿泊料を受けて人を宿泊させる営業は旅館業法3条の許可（都道府県知事・保健所設置市長）が必要です。住宅宿泊事業（民泊）は届出で営めますが（住宅宿泊事業法3条）、年間180日が上限で、条例で区域・期間がさらに制限されることがあります（同18条）。建築基準法上はホテル・旅館は住居専用地域等で建てられず、消防法では（5）項イの防火対象物として自動火災報知設備等の設置義務が生じます。",
    action: "用途地域で旅館業が可能か、民泊なら条例の制限区域・期間を確認。消防署で消防用設備の事前相談（住宅用火災警報器では足りない場合が多い）。",
    roles: ["営業", "設計", "コーディネーター"],
    cites: [
      { law: "ryokangyoho", article: "3" },
      { law: "minpakuho", article: "3", expectCaption: "（届出）" },
      { law: "minpakuho", article: "18", expectCaption: "（条例による住宅宿泊事業の実施の制限）" },
      { law: "shoboho", article: "17" },
    ],
    when: (p) => (p.buildingUse === "宿泊施設（旅館・ホテル・民泊）" || extra(p, "民泊・宿泊利用の予定") || mentions(p, /民泊|旅館|ホテル|宿泊/) ? "required" : null),
  },
  {
    id: "daiten",
    category: "用途・形態制限",
    title: "大規模小売店舗立地法の届出（店舗面積1,000㎡超）",
    summary: "店舗面積の合計が1,000㎡を超える小売店舗の新設は、都道府県への届出（新設の8か月前まで）が必要です（大店立地法5条、2条）。",
    action: "物販店舗1,000㎡超の計画は、交通・騒音・廃棄物の予測を含む届出スケジュール（8か月以上）を事業計画に組み込んでください。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "daitenho", article: "5", expectCaption: "（大規模小売店舗の新設に関する届出等）" },
      { law: "daitenho", article: "2", expectCaption: "（定義）" },
    ],
    when: (p) => (p.buildingUse === "店舗・飲食店" && (p.totalFloorArea ?? 0) > 1000 ? "likely" : null),
  },
  {
    id: "kojo-richi",
    category: "用途・形態制限",
    title: "工場立地法の届出（特定工場）",
    summary: "製造業等の工場で敷地面積9,000㎡以上または建築面積3,000㎡以上の特定工場の新設は、生産施設面積率・緑地面積率等について市町村長への届出が必要です（工場立地法6条）。",
    action: "敷地・建築面積が基準に近い工場計画は、緑地・環境施設の配置を含めて早期に市の担当課へ相談。",
    roles: ["設計", "営業"],
    cites: [{ law: "kojorichiho", article: "6", expectCaption: "（届出）" }],
    when: (p) => (p.buildingUse === "工場・作業場・倉庫" && ((p.siteArea ?? 0) >= 9000 || (p.buildingArea ?? 0) >= 3000) ? "likely" : null),
  },
  {
    id: "fukushi",
    category: "用途・形態制限",
    title: "福祉施設・保育所の建築・消防・事業認可",
    summary:
      "児童福祉施設等（保育所、認定こども園、老人ホーム、グループホーム等）は建築基準法上の特殊建築物（別表第一（二）項に類するもの。令115条の3）で、消防法上は（6）項の防火対象物として、規模によらず自動火災報知設備・スプリンクラー等の設置義務が厳しく、避難上の制約も多いです。事業の認可・指定（児童福祉法・老人福祉法・介護保険法等）は建築とは別の所管です。",
    action: "設計着手前に、建築指導課・消防署・事業認可の担当課（市の保育課・高齢福祉課等）の三者と事前相談を行い、設備要件と面積基準を確定させてください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kenkirei", article: "115_3", expectCaption: "（耐火建築物等としなければならない特殊建築物）" },
      { law: "shoboho", article: "17" },
      { law: "shoborei", article: "21", expectCaption: "（自動火災報知設備に関する基準）" },
      { law: "shoborei", article: "12", expectCaption: "（スプリンクラー設備に関する基準）" },
    ],
    when: (p) => (p.buildingUse === "福祉施設・保育所・児童福祉施設" ? "required" : null),
  },

  // ---------------------------------------------------------------- 防火
  {
    id: "boka-chiiki",
    category: "防火・避難・消防",
    title: "防火地域・準防火地域内の構造制限",
    summary:
      "防火地域内は階数3以上または延べ面積100㎡超で耐火建築物等、それ以外は準耐火建築物等。準防火地域内は地階を除く階数4以上または延べ1,500㎡超で耐火建築物等、階数3（1,500㎡以下）または延べ500㎡超1,500㎡以下で準耐火建築物等、地上2階以下・延べ500㎡以下の木造建築物等は延焼のおそれのある部分の外壁・軒裏を防火構造とし、その部分の外壁開口部に20分の防火設備を設けます（非木造は開口部のみ）（法61条、令136条の2 各号）。いずれも延焼防止時間による同等の方法も選べます。屋根は火の粉で燃えない構造（法62条）。敷地が地域の内外にわたる場合は厳しい側の規定が全体に適用されます（法65条）。",
    action: "防火指定を都市計画図で確定し、階数・延べ面積から区分（令136条の2 の何号か）を決める。配置図に延焼ライン（1階3m・2階以上5m）を描き、ラインにかかる外壁・軒裏・開口部（換気口を含む）の仕様を、告示仕様か大臣認定（認定書の条件どおり）で仕様書に反映。断熱・ZEH仕様と両立する防火サッシを選ぶ。",
    roles: ["設計", "営業"],
    cites: [
      { law: "kenkiho", article: "61", expectCaption: "（防火地域及び準防火地域内の建築物）" },
      { law: "kenkirei", article: "136_2", expectCaption: "（防火地域又は準防火地域内の建築物の壁、柱、床その他の部分及び防火設備の性能に関する技術的基準）" },
      { law: "kenkiho", article: "65", expectCaption: "（建築物が防火地域又は準防火地域の内外にわたる場合の措置）" },
    ],
    when: (p) => (isBuild(p) ? (p.fireZone === "防火地域" || p.fireZone === "準防火地域" ? "required" : p.fireZone === "不明" ? "check" : null) : null),
  },
  {
    id: "ho22",
    category: "防火・避難・消防",
    title: "法22条区域の屋根・外壁",
    summary: "特定行政庁が指定する法22条区域内では、屋根を不燃材料で造るか葺く等の構造とし（法22条）、木造建築物等の外壁で延焼のおそれのある部分は準防火性能を持つ構造にしなければなりません（法23条）。",
    action: "屋根材・外壁材の認定番号（DR・PC等）を確認し、仕様書に明記。",
    roles: ["設計"],
    cites: [
      { law: "kenkiho", article: "22", expectCaption: "（屋根）" },
      { law: "kenkiho", article: "23", expectCaption: "（外壁）" },
    ],
    when: (p) => (isBuild(p) && p.fireZone === "法22条区域" ? "required" : null),
  },
  {
    id: "jukeiki",
    category: "防火・避難・消防",
    title: "住宅用火災警報器の設置",
    summary:
      "住宅の関係者は、市町村条例の基準に従って住宅用防災機器（住宅用火災警報器等）を設置・維持しなければなりません（消防法9条の2）。政令の条例基準では、就寝に使う居室と、その居室がある階（避難階を除く）から直下階に通じる階段上部が設置場所で（消防法施行令5条の7）、条例で台所などが追加されている市町村があります。",
    action: "寝室の位置と階段の設置箇所を図面に明記。所在地の火災予防条例で台所・居室の追加義務を確認（消防署に照会可）。",
    roles: ["設計", "施工"],
    cites: [
      { law: "shoboho", article: "9_2" },
      { law: "shoborei", article: "5_7", expectCaption: "（住宅用防災機器の設置及び維持に関する条例の基準）" },
    ],
    refs: [FDMA_QA],
    when: (p) => (isBuild(p) && isHousing(p) ? "required" : null),
  },
  {
    id: "shobo-setsubi",
    category: "防火・避難・消防",
    title: "消防用設備等の設置・届出（住宅以外・共同住宅）",
    summary:
      "消防法施行令別表第一の防火対象物（店舗、飲食店、事務所（15）項、工場（12）項、倉庫（14）項、共同住宅・寄宿舎（5）項ロ、旅館（5）項イ、福祉施設（6）項など）は、用途・延べ面積・階数に応じて消火器（令10条）、自動火災報知設備（令21条）、スプリンクラー（令12条）、誘導灯（令26条）等の設置義務があります（消防法17条）。設置後は消防長への設置届と検査（法17条の3の2）、一定の設備は着工10日前までの着工届（法17条の14）、収容人員30人（特定用途）／50人以上は防火管理者の選任（法8条、令1条の2）が必要です。",
    action: "計画段階で所轄消防署の予防課と事前相談し、用途判定（複合用途（16）項の扱いを含む）と必要設備を確定。消防設備士の手配と届出スケジュールを工程に入れてください。",
    roles: ["設計", "施工", "コーディネーター"],
    cites: [
      { law: "shoboho", article: "17" },
      { law: "shoborei", article: "6", expectCaption: "（防火対象物の指定）" },
      { law: "shoborei", article: "10", expectCaption: "（消火器具に関する基準）" },
      { law: "shoborei", article: "21", expectCaption: "（自動火災報知設備に関する基準）" },
      { law: "shoboho", article: "17_3_2" },
      { law: "shoboho", article: "17_14" },
      { law: "shoboho", article: "8" },
      { law: "shoborei", article: "1_2", expectCaption: "（防火管理者を定めなければならない防火対象物等）" },
    ],
    when: (p) => {
      if (!(isBuild(p) || p.workType === "用途変更")) return null;
      if (p.buildingUse === "専用住宅") return null;
      if (p.buildingUse === "兼用住宅（店舗・事務所併用）") return "check";
      return "required";
    },
  },

  // ---------------------------------------------------------------- 構造・居室
  {
    id: "saiko-kanki",
    category: "構造・居室",
    title: "居室の採光・換気・シックハウス対策",
    summary:
      "住宅の居室には、床面積の1/7以上（令19条3項の割合。有効面積の算定は令20条）の採光に有効な開口部と、床面積の1/20以上の換気に有効な開口部または換気設備が必要です（法28条）。内装の木質建材等からのホルムアルデヒド対策として、居室には原則0.5回/h以上の機械換気設備が必要です（法28条の2、令20条の2・20条の3、令20条の8）。",
    action: "採光補正係数（隣地境界・庇の影響）を各居室で確認。納戸扱いにする部屋は図面表記を統一。",
    roles: ["設計"],
    cites: [
      { law: "kenkiho", article: "28", expectCaption: "（居室の採光及び換気）" },
      { law: "kenkiho", article: "28_2", expectCaption: "（石綿その他の物質の飛散又は発散に対する衛生上の措置）" },
      { law: "kenkirei", article: "19", expectCaption: "（居室の採光）" },
      { law: "kenkirei", article: "20", expectCaption: "（有効面積の算定方法）" },
      { law: "kenkirei", article: "20_2", expectCaption: "（換気設備の技術的基準）" },
    ],
    when: (p) => (isBuild(p) && isHousing(p) ? "required" : null),
  },
  {
    id: "kaidan",
    category: "構造・居室",
    title: "階段寸法・天井高・床高",
    summary:
      "住宅の階段は幅75cm以上、蹴上げ23cm以下、踏面15cm以上（令23条。回り階段の踏面は狭い方から30cmの位置で測る）。居室の天井高は2.1m以上（令21条）、最下階の居室の床は原則45cm以上の高さと防湿措置（令22条）。",
    action: "ロフト・スキップフロアの階段、小屋裏収納のはしごの扱いを確認申請前に建築指導課で確認。",
    roles: ["設計"],
    cites: [
      { law: "kenkirei", article: "23", expectCaption: "（階段及びその踊場の幅並びに階段の蹴上げ及び踏面の寸法）" },
      { law: "kenkirei", article: "21", expectCaption: "（居室の天井の高さ）" },
      { law: "kenkirei", article: "22", expectCaption: "（居室の床の高さ及び防湿方法）" },
    ],
    when: (p) => (isBuild(p) && isHousing(p) ? "likely" : null),
  },
  {
    id: "elevator",
    category: "構造・居室",
    title: "エレベーター（確認申請・定期検査）",
    summary: "エレベーター・エスカレーター・小荷物専用昇降機は確認等を要する建築設備で（法87条の4、令146条）、設置後は定期検査報告の対象になります（法12条3項）。ホームエレベーターも確認申請の対象です。",
    action: "昇降機の確認申請（建築物と同時申請が可能）とメーカーの検査資料を手配。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "kenkirei", article: "146", expectCaption: "（確認等を要する建築設備）" },
      { law: "kenkiho", article: "12", expectCaption: "（報告、検査等）" },
    ],
    when: (p) => (extra(p, "エレベーター設置") ? "required" : null),
  },
  {
    id: "kizon-futekikaku",
    category: "構造・居室",
    title: "既存不適格建築物への増築・改修",
    summary:
      "現行規定に適合しない既存建築物は、法改正前からあるものなら「既存不適格」として当該規定の適用を受けませんが（法3条2項）、増築・改築・大規模の修繕等をすると原則として建物全体に現行規定が及びます（法3条3項）。一定の範囲内の増築等については緩和があります（法86条の7、令137条の2以下）。",
    action: "検査済証・確認申請図書の有無を最初に確認。無い場合は建築基準法適合状況調査（ガイドライン調査）が必要になることを施主に説明してください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kenkiho", article: "3", expectCaption: "（適用の除外）" },
      { law: "kenkiho", article: "86_7", expectCaption: "（既存の建築物に対する制限の緩和）" },
    ],
    when: (p) =>
      ["増築", "改築・大規模修繕・模様替", "用途変更"].includes(p.workType) ? (extra(p, "既存不適格建築物あり") ? "required" : "likely") : null,
  },
  {
    id: "taishin",
    category: "構造・居室",
    title: "旧耐震の既存建物（耐震診断・改修）",
    summary:
      "昭和56年5月31日以前の旧耐震基準で建てられた建築物は、耐震改修促進法で、多数の者が利用する一定規模のもの（特定既存耐震不適格建築物）に耐震診断・改修の努力義務（法14条）、要安全確認計画記載建築物には診断の義務（法7条）、それ以外の住宅等にも努力義務（法16条）が定められています。増築・用途変更時は現行構造規定への適合（既存不適格の遡及）が問題になります。",
    action: "耐震診断の実施と、自治体の補助制度（診断・改修・除却）の有無を確認。",
    roles: ["設計", "営業"],
    cites: [
      { law: "taishinho", article: "14", expectCaption: "（特定既存耐震不適格建築物の所有者の努力）" },
      { law: "taishinho", article: "7", expectCaption: "（要安全確認計画記載建築物の所有者の耐震診断の義務）" },
      { law: "taishinho", article: "16" },
    ],
    when: (p) => (extra(p, "旧耐震（1981年以前）の既存建物") ? "likely" : null),
  },

  // ---------------------------------------------------------------- 土地・区域
  {
    id: "chosei-kuiki",
    category: "土地・区域・開発",
    title: "市街化調整区域の建築許可・開発許可",
    summary:
      "市街化調整区域では、開発許可を受けた区域以外での建築物の新築・改築・用途変更に都道府県知事（指定都市等は市長）の許可が必要です（都計法43条）。開発行為は規模にかかわらず許可対象で（29条）、許可できるのは34条各号（周辺居住者の日常生活店舗、農林漁業用施設、条例で定める区域・用途（11号・12号）、開発審査会の議を経るもの（14号）など）に限られます。農林漁業用建築物とその従事者の住宅は許可不要です（29条1項2号）。",
    action: "計画の前に、都道府県・市の開発指導課で34条のどの号に当たりうるか（分家住宅、既存集落、線引き前宅地等）を事前相談。該当しなければ原則建てられません。土地購入の判断はこの確認の後に。",
    roles: ["営業", "コーディネーター", "設計"],
    cites: [
      { law: "toshikeikakuho", article: "43", expectCaption: "（開発許可を受けた土地以外の土地における建築等の制限）" },
      { law: "toshikeikakuho", article: "29", expectCaption: "（開発行為の許可）" },
      { law: "toshikeikakuho", article: "34" },
      { law: "toshirei", article: "36", expectCaption: "（開発許可を受けた土地以外の土地における建築等の許可の基準）" },
    ],
    refs: [MLIT_KAIHATSU, MLIT_UNYO],
    when: (p) => (p.areaDivision === "市街化調整区域" ? "required" : null),
  },
  {
    id: "kaihatsu-kyoka",
    category: "土地・区域・開発",
    title: "開発許可（区画形質の変更を伴う場合）",
    summary:
      "建築目的の土地の区画形質の変更（切土・盛土、区画の変更など）は開発行為で、市街化区域では1,000㎡以上（三大都市圏の既成市街地・近郊整備地帯等は500㎡以上。条例で300㎡まで引下げ可）、非線引き都市計画区域・準都市計画区域では3,000㎡以上、都市計画区域外では1ha以上で許可が必要です（都計法29条、令19条）。許可には道路・排水等の技術基準（33条）への適合と公共施設管理者の同意（32条）が必要です。",
    action: "敷地面積と造成の有無から該当を判断し、該当すれば設計前に開発指導課へ事前協議。許可済みの土地でも、予定建築物の用途変更には42条の制限があります。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "toshikeikakuho", article: "29", expectCaption: "（開発行為の許可）" },
      { law: "toshirei", article: "19", expectCaption: "（許可を要しない開発行為の規模）" },
      { law: "toshikeikakuho", article: "33", expectCaption: "（開発許可の基準）" },
      { law: "toshikeikakuho", article: "32", expectCaption: "（公共施設の管理者の同意等）" },
    ],
    refs: [MLIT_KAIHATSU],
    when: (p) => {
      if (p.areaDivision === "市街化調整区域") return null; // covered by chosei-kuiki
      const a = Math.max(p.siteArea ?? 0, p.earthworkArea ?? 0);
      const earthwork = (p.fillHeight ?? 0) > 0 || (p.cutHeight ?? 0) > 0 || (p.earthworkArea ?? 0) > 0 || p.workType === "造成・土地利用のみ" || mentions(p, /造成|分譲|区画/);
      if (p.areaDivision === "市街化区域") {
        if (a >= 1000) return "likely";
        if (a >= 300) return earthwork ? "likely" : "check";
        return null;
      }
      if (p.areaDivision === "非線引き都市計画区域" || p.areaDivision === "準都市計画区域") return a >= 3000 ? "likely" : earthwork ? "check" : null;
      if (p.areaDivision === "都市計画区域外") return a >= 10000 ? "likely" : null;
      return earthwork || a >= 1000 ? "check" : null;
    },
  },
  {
    id: "chiku-keikaku",
    category: "土地・区域・開発",
    title: "地区計画の届出（着手30日前）",
    summary: "地区整備計画が定められた地区計画の区域内で建築・土地の区画形質の変更等を行うには、着手の30日前までに市町村長への届出が必要で（都計法58条の2）、地区計画の内容（用途・敷地面積の最低限度・壁面後退・高さ・形態意匠など）は市町村条例で建築確認の審査対象になっていることがあります（法68条の2）。",
    action: "地区計画の計画書・計画図を取得し、壁面位置・高さ・垣柵・色彩の制限を設計与条件に。届出期間を工程に入れる。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "toshikeikakuho", article: "58_2", expectCaption: "（建築等の届出等）" },
      { law: "kenkiho", article: "68_2", expectCaption: "（市町村の条例に基づく制限）" },
    ],
    when: (p) => (has(p, "地区計画の区域") ? "required" : isBuild(p) ? "check" : null),
  },
  {
    id: "keikan",
    category: "土地・区域・開発",
    title: "景観計画区域の届出（着手30日前）",
    summary: "景観計画区域内で一定規模の建築・外観変更等を行う場合、景観行政団体への届出が必要で（景観法16条）、届出受理から30日間は着手できません（18条）。多くの市町村が全域を景観計画区域としており、対象規模・色彩基準は景観計画ごとに異なります。",
    action: "所在地の景観計画（届出対象規模、色彩・屋外広告のガイドライン）を確認し、外観決定前に協議。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "keikanho", article: "16", expectCaption: "（届出及び勧告等）" },
      { law: "keikanho", article: "18", expectCaption: "（行為の着手の制限）" },
    ],
    when: (p) => (has(p, "景観計画区域・景観地区") ? "required" : isBuild(p) ? "check" : null),
  },
  {
    id: "maizo",
    category: "土地・区域・開発",
    title: "埋蔵文化財包蔵地の届出（着手60日前）",
    summary: "周知の埋蔵文化財包蔵地で土木工事等を行う場合、着手の60日前までに文化庁長官（実務は都道府県・市教育委員会経由）への届出が必要です（文化財保護法93条）。試掘・本発掘調査を求められると工期・費用に大きく影響します。工事中に遺跡を発見した場合も届出義務があります（96条）。",
    action: "教育委員会の文化財課で包蔵地図を確認し、該当すれば試掘調査の時期と費用負担（個人住宅は公費調査の制度あり）を早期に確認。",
    roles: ["コーディネーター", "営業", "施工"],
    cites: [
      { law: "bunkazaiho", article: "93", expectCaption: "（土木工事等のための発掘に関する届出及び指示）" },
      { law: "bunkazaiho", article: "96", expectCaption: "（遺跡の発見に関する届出、停止命令等）" },
    ],
    when: (p) => (has(p, "周知の埋蔵文化財包蔵地") ? "required" : isBuild(p) || p.workType === "造成・土地利用のみ" ? "check" : null),
  },
  {
    id: "kukaku-seiri",
    category: "土地・区域・開発",
    title: "土地区画整理事業施行地区内の建築許可",
    summary: "土地区画整理事業の施行地区内では、事業計画の公告から換地処分の公告まで、事業の障害となるおそれのある建築・土地の形質変更に都道府県知事（または市長）の許可が必要です（土地区画整理法76条）。仮換地の指定状況により建築できる位置も変わります。",
    action: "施行者（組合・市）に仮換地指定・使用収益開始の時期、清算金、建築許可の要否を確認。",
    roles: ["営業", "コーディネーター"],
    cites: [{ law: "kukakuseiriho", article: "76", expectCaption: "（建築行為等の制限）" }],
    when: (p) => (has(p, "土地区画整理事業の施行地区") ? "required" : null),
  },
  {
    id: "seisan-ryokuchi",
    category: "土地・区域・開発",
    title: "生産緑地地区内の行為制限",
    summary: "生産緑地地区内では、建築物の新築・宅地造成等は市町村長の許可が必要で、農林漁業用施設等を除き原則として許可されません（生産緑地法8条）。買取り申出（10条）を経て指定が解除されるまで住宅は建てられません。",
    action: "指定からの経過年数、買取り申出の可否・時期、解除後の農地転用手続きを市の都市計画課・農業委員会で確認。",
    roles: ["営業", "コーディネーター"],
    cites: [{ law: "seisanryokuchiho", article: "8", expectCaption: "（生産緑地地区内における行為の制限）" }],
    when: (p) => (has(p, "生産緑地地区") ? "required" : farmOnSite(p) && p.areaDivision === "市街化区域" ? "check" : null),
  },
  {
    id: "toshi-keikaku-doro",
    category: "土地・区域・開発",
    title: "都市計画道路・都市計画施設の区域内の建築",
    summary: "都市計画施設（都市計画道路等）の区域内で建築するには都道府県知事等の許可が必要で（都計法53条）、許可基準は階数2以下で地階がなく、容易に移転・除却できる構造（木造・鉄骨造等）であること等に限られます（54条）。事業認可後の事業地内では65条の許可が必要です。",
    action: "都市計画課で計画線の位置・事業化の見通しを確認し、建物配置を計画線外にできるか検討。",
    roles: ["設計", "営業"],
    cites: [
      { law: "toshikeikakuho", article: "53", expectCaption: "（建築の許可）" },
      { law: "toshikeikakuho", article: "65", expectCaption: "（建築等の制限）" },
    ],
    when: (p) => (has(p, "都市計画道路・都市計画施設の区域") ? "required" : null),
  },
  {
    id: "saigai-kiken",
    category: "造成・災害リスク",
    title: "災害危険区域（条例による建築制限）",
    summary: "地方公共団体は条例で、津波・高潮・出水等による危険の著しい区域を災害危険区域に指定し、住居用建築物の建築禁止やその他の建築制限を定めることができます（建築基準法39条）。区域の種別ごとに、居室の床高（例：基準水位以上）、構造（RC造等）、用途の制限が条例で具体化されています。",
    action: "指定主体（市・県）の条例名と区域の種別を確認し、床高・構造・用途の制限を設計与条件にしてください。重要事項説明の対象です。",
    roles: ["設計", "営業"],
    cites: [{ law: "kenkiho", article: "39", expectCaption: "（災害危険区域）" }],
    when: (p) => (has(p, "災害危険区域（条例）") ? "required" : null),
  },
  {
    id: "omori-zosei",
    category: "造成・災害リスク",
    title: "大規模盛土造成地（地盤・基礎の確認）",
    summary: "大規模盛土造成地マップに載る谷埋め型・腹付け型の盛土地では、地震時の滑動崩落リスクが指摘されています。建築基準法上は敷地の安全確保（法19条）と、地盤の状況を考慮した基礎の構造（令38条3項）の規定が働くため、地盤調査結果に基づく基礎形式・地盤改良の判断が重要です。自治体が宅地耐震化推進事業で詳細調査（第二次スクリーニング）を行っていることがあります。",
    action: "地盤調査（SWS／ボーリング）を必ず実施し、市の宅地防災担当課で当該盛土地の調査状況と結果を確認してください。",
    roles: ["設計", "施工"],
    cites: [
      { law: "kenkiho", article: "19", expectCaption: "（敷地の衛生及び安全）" },
      { law: "kenkirei", article: "38", expectCaption: "（基礎）" },
    ],
    refs: [MLIT_MORIDO],
    when: (p) => (has(p, "大規模盛土造成地") ? "likely" : null),
  },
  {
    id: "ritteki",
    category: "土地・区域・開発",
    title: "立地適正化計画（居住誘導区域外の届出）",
    summary: "立地適正化計画区域のうち居住誘導区域外で、一定戸数以上（政令で3戸以上）の住宅開発や住宅の新築・用途変更を行う場合、着手30日前までに市町村長への届出が必要です（都市再生特別措置法88条）。届出は義務ですが、市町村は勧告ができるにとどまります。",
    action: "市の都市計画課で居住誘導区域の内外を確認し、区域外なら届出の対象行為（戸数・規模）と様式を確認してください。1戸の自己用住宅は原則対象外です。",
    roles: ["営業", "コーディネーター"],
    cites: [{ law: "toshisaiseiho", article: "88" }],
    when: (p) => (has(p, "立地適正化計画区域（居住誘導区域外の可能性）") ? "check" : null),
  },
  {
    id: "kodo-chiku",
    category: "用途・形態制限",
    title: "高度地区の高さ制限",
    summary: "高度地区内では、都市計画で定められた最高限度（または最低限度）の高さ・北側斜線型の制限に適合しなければなりません（法58条）。自治体ごとに「第1種高度地区」などの名称で斜線勾配が異なります。",
    action: "都市計画図の高度地区の種別と、その自治体の高度地区の制限内容（断面図）を取得。",
    roles: ["設計"],
    cites: [{ law: "kenkiho", article: "58", expectCaption: "（高度地区）" }],
    when: (p) => (has(p, "高度地区") ? "required" : null),
  },
  {
    id: "missyu",
    category: "土地・区域・開発",
    title: "防災街区整備地区計画の区域内の届出",
    summary: "防災街区整備地区計画の区域内で建築・土地の形質変更等を行うには、着手30日前までに市町村長への届出が必要です（密集市街地整備法33条）。",
    action: "地区計画の内容と届出期間を確認。",
    roles: ["設計", "コーディネーター"],
    cites: [{ law: "missyuho", article: "33", expectCaption: "（行為の届出等）" }],
    when: (p) => (has(p, "密集市街地（防災街区整備地区計画）") ? "required" : null),
  },
  {
    id: "kokudo-riyo",
    category: "土地・区域・開発",
    title: "国土利用計画法の事後届出（大規模な土地取引）",
    summary:
      "市街化区域で2,000㎡以上、その他の都市計画区域で5,000㎡以上、都市計画区域外で10,000㎡以上の土地売買等の契約を締結した権利取得者は、契約日から2週間以内に市町村経由で都道府県知事に届出が必要です（国土利用計画法23条1項・2項1号）。一団の土地として取得する場合は合計面積で判断されます。",
    action: "土地取得を伴う大規模計画は、契約後2週間の届出期限を売買スケジュールに組み込む。",
    roles: ["営業"],
    cites: [{ law: "kokudoriyoho", article: "23", expectCaption: "（土地に関する権利の移転又は設定後における利用目的等の届出）" }],
    when: (p) => {
      const a = p.siteArea ?? 0;
      const big =
        (p.areaDivision === "市街化区域" && a >= 2000) ||
        (["非線引き都市計画区域", "準都市計画区域", "市街化調整区域"].includes(p.areaDivision) && a >= 5000) ||
        (p.areaDivision === "都市計画区域外" && a >= 10000) ||
        (p.areaDivision === "不明" && a >= 2000);
      return big ? (mentions(p, /購入|売買|取得|仲介/) ? "likely" : "check") : null;
    },
  },
  {
    id: "kouyuchi",
    category: "土地・区域・開発",
    title: "公有地拡大推進法の届出（譲渡時）",
    summary: "都市計画施設の区域内の土地（200㎡以上）や、市街化区域内の5,000㎡以上の土地などを有償で譲渡しようとする所有者は、譲渡の3週間前までに市町村長を経由して都道府県知事に届出が必要です（公拡法4条、令で定める面積）。",
    action: "大規模な土地や都市計画道路にかかる土地を仲介・取得する場合、売主側の届出手続き（3週間の譲渡制限）を売買スケジュールに反映。",
    roles: ["営業"],
    cites: [{ law: "kouyuchiho", article: "4", expectCaption: "（土地を譲渡しようとする場合の届出義務）" }],
    when: (p) =>
      (has(p, "都市計画道路・都市計画施設の区域") && (p.siteArea ?? 0) >= 200) || (p.areaDivision === "市街化区域" && (p.siteArea ?? 0) >= 5000) ? "check" : null,
  },

  // ---------------------------------------------------------------- 農地・山林
  {
    id: "nochi-tenyo",
    category: "農地・山林",
    title: "農地転用（農地法4条・5条）",
    summary:
      "農地を農地以外にするには都道府県知事等の許可が必要で（農地法4条1項）、所有権移転・賃借権設定を伴う転用は当事者が5条の許可を受けます。市街化区域内の農地は許可ではなく農業委員会への届出で足ります（4条1項7号、5条1項6号）。無許可転用は工事停止・原状回復命令（51条）の対象で、3年以下の拘禁刑または300万円以下の罰金（64条）。登記上の地目が宅地でも現況が農地なら農地として扱われます。",
    action:
      "農業委員会で農地区分（農用地区域内農地・甲種・第1種・第2種・第3種）と許可見込みを確認。市街化区域内は届出（受理通知まで着工不可）。許可・届出前に着工・売買代金決済をしないこと。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "nochiho", article: "4", expectCaption: "（農地の転用の制限）" },
      { law: "nochiho", article: "5", expectCaption: "（農地又は採草放牧地の転用のための権利移動の制限）" },
      { law: "nochiho", article: "51", expectCaption: "（違反転用に対する処分）" },
      { law: "nochiho", article: "64" },
    ],
    refs: [MAFF_TENYO, MAFF_IHAN],
    when: (p) => (p.landCategory === "田・畑（農地）" || mentions(p, /農地|田|畑|農転|農地転用/) ? "required" : p.landCategory === "不明" ? "check" : null),
  },
  {
    id: "noshin",
    category: "農地・山林",
    title: "農用地区域（青地）の除外と開発行為許可",
    summary:
      "農業振興地域整備計画の農用地区域内の農地は、原則として転用が許可されません（農振法17条、農地法）。住宅等を建てるには、まず市町村の整備計画変更による農用地区域からの除外（農振除外。農振法13条）が必要で、年数回の受付・半年〜1年以上の期間がかかります。農用地区域内での宅地造成等の開発行為は都道府県知事等の許可が必要です（15条の2）。",
    action: "市の農政課で農用地区域の内外を確認。青地なら除外申出の受付時期・要件（代替地がないこと等）を確認し、スケジュール全体を見直す。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "noshinho", article: "13", expectCaption: "（農業振興地域整備計画の変更）" },
      { law: "noshinho", article: "15_2", expectCaption: "（農用地区域内における開発行為の制限）" },
      { law: "noshinho", article: "6", expectCaption: "（農業振興地域の指定）", note: "3項：市街化区域には指定しない" },
      { law: "noshinho", article: "17", expectCaption: "（農地等の転用の制限）" },
    ],
    refs: [MAFF_TENYO],
    when: (p) =>
      p.farmlandBlue === "はい"
        ? "required"
        : farmOnSite(p) && p.farmlandBlue === "不明" && p.areaDivision !== "市街化区域"
          ? ruralArea(p)
            ? "likely"
            : "check"
          : null,
  },
  {
    id: "nochi-genkyo",
    category: "農地・山林",
    title: "地図上は現況が田・畑（登記の地目と違う可能性）",
    summary:
      "農地法の「農地」は耕作の目的に供される土地で（農地法2条）、登記の地目ではなく現況で判断されます。地目が宅地・雑種地でも、現況が田畑なら転用の許可・届出が必要です。逆に転用後は、地目の変更があった日から1か月以内に地目変更登記を申請する義務があります（不動産登記法37条）。住宅ローンの融資実行や分筆も地目変更登記が前提になることが多く、工程に入れておく必要があります。",
    action:
      "法務局で登記事項証明書（地目）を、農業委員会で農地台帳（農地か・農振区域か・転用許可の履歴）を確認。現況農地なら、許可・届出の受理前に造成・建築・売買代金の決済をしないこと。引渡し前に土地家屋調査士へ地目変更登記を依頼してください。",
    roles: ["営業", "コーディネーター", "設計"],
    cites: [
      { law: "nochiho", article: "2", expectCaption: "（定義）" },
      { law: "fudosantokiho", article: "37", expectCaption: "（地目又は地積の変更の登記の申請）" },
    ],
    refs: [MAFF_IHAN],
    when: (p) => (p.signals.farmland === "敷地が農地の可能性" ? "required" : null),
  },
  {
    id: "tochikairyo",
    category: "農地・山林",
    title: "土地改良区の地区内の農地（意見書・地区除外・決済金）",
    summary:
      "転用する農地が土地改良区の地区内にあると、市街化区域外の許可申請では申請書に土地改良区の意見書を添付します（農地法施行規則30条1項6号、5条許可は57条の4第2項3号）。市街化区域の届出（施行規則26条・50条）には意見書の添付はありません。ただし届出でも、土地改良区は地区内の土地に経費（賦課金）を課しており（土地改良法36条）、地区から外す手続き（66条など）と、定款・規程に基づく地区除外決済金の支払いを求められるのが一般的です。金額・手続き期間は土地改良区ごとに異なり、施主の想定外の費用になりやすい項目です。",
    action:
      "農業委員会または市町村の農政課で、敷地が土地改良区の地区内か・どの土地改良区かを確認し、土地改良区に意見書の手続き、地区除外決済金の額、賦課金の清算、用排水路への放流の可否を問い合わせ、資金計画に入れてください。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "nochikisoku", article: "30", expectCaption: "（農地を転用するための許可申請）" },
      { law: "nochikisoku", article: "57_4", expectCaption: "（農地又は採草放牧地の転用のための権利移動についての許可申請）" },
      { law: "nochikisoku", article: "50", expectCaption: "（市街化区域内の農地又は採草放牧地の転用のための権利移動の届出）" },
      { law: "tochikairyoho", article: "36", expectCaption: "（経費の賦課）" },
      { law: "tochikairyoho", article: "66", expectCaption: "（地区変更）" },
    ],
    when: (p) => (farmOnSite(p) ? "likely" : null),
  },
  {
    id: "rinsetsu-nochi",
    category: "農地・山林",
    title: "周りが田畑の土地（農道・水路・過去の転用許可）",
    summary:
      "周辺に田畑がある土地では、見落としが3つ起きやすくなります。①前面の道が農道・里道で、建築基準法上の道路（法42条）でないことがある（接道義務は法43条）。②用排水路が敷地の中や境界を通っていて、管理者との境界確定や付替えが必要になる。③過去に農地転用許可を受けて宅地になった土地で、許可時の事業計画（用途・建築主）と違う使い方をすると違反転用として是正の対象になりうる（農地法51条）。",
    action:
      "建築指導課で前面道路の種別を、公図で水路の有無を、農業委員会で過去の転用許可の有無と条件を確認してください。周辺の農地への雨水・土砂の流出や日照への配慮も、近隣説明の論点になります。",
    roles: ["営業", "設計", "コーディネーター"],
    cites: [
      { law: "kenkiho", article: "42", expectCaption: "（道路の定義）" },
      { law: "kenkiho", article: "43", expectCaption: "（敷地等と道路との関係）" },
      { law: "nochiho", article: "51", expectCaption: "（違反転用に対する処分）" },
    ],
    when: (p) => (isBuild(p) && p.signals.farmland === "周辺に農地" && p.landCategory !== "田・畑（農地）" ? "check" : null),
  },
  {
    id: "shinrin",
    category: "農地・山林",
    title: "森林法（林地開発許可・伐採届）",
    summary: "地域森林計画の対象民有林で1haを超える開発行為（太陽光発電設備は0.5ha超）は都道府県知事の林地開発許可が必要です（森林法10条の2）。1ha以下でも立木の伐採には市町村長への伐採及び伐採後の造林の届出が必要です（10条の8）。保安林内は別途許可が必要です。",
    action: "都道府県の林務課で地域森林計画対象森林・保安林の該当を確認。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "shinrinho", article: "10_2", expectCaption: "（開発行為の許可）" },
      { law: "shinrinho", article: "10_8", expectCaption: "（伐採及び伐採後の造林の届出等）" },
    ],
    when: (p) => (p.landCategory === "山林" || mentions(p, /山林|林地|伐採/) ? "required" : null),
  },

  // ---------------------------------------------------------------- 造成・災害
  {
    id: "morido",
    category: "造成・災害リスク",
    title: "盛土規制法（宅地造成等工事規制区域の許可）",
    summary:
      "宅地造成等工事規制区域内では、盛土で高さ1m超の崖を生じるもの、切土で高さ2m超の崖を生じるもの、盛土と切土で2m超の崖を生じるもの、高さ2m超の盛土、面積500㎡超の盛土・切土（令3条）は、着工前に都道府県知事等の許可が必要です（法12条）。これに満たない小規模な工事も届出（法21条）の対象になることがあります。特定盛土等規制区域では規模基準が大きくなり（2m・5m・3,000㎡等）、許可（法30条）または届出（法27条）が必要です。擁壁は令8条以下の技術基準に適合させ（鉄筋コンクリート造等は構造計算）、高さ5m超の擁壁など一定の工事は有資格者の設計が必要です（令21条）。",
    action: "都道府県の盛土規制法担当課で規制区域の指定状況（令和5年以降順次指定）を確認。造成計画を早期に確定し、許可期間（概ね1〜2か月以上）と完了検査を工程に入れる。",
    roles: ["設計", "施工", "コーディネーター"],
    cites: [
      { law: "moridoho", article: "12", expectCaption: "（宅地造成等に関する工事の許可）" },
      { law: "moridorei", article: "3", expectCaption: "（宅地造成及び特定盛土等）" },
      { law: "moridoho", article: "21", expectCaption: "（工事等の届出）" },
      { law: "moridoho", article: "30", expectCaption: "（特定盛土等又は土石の堆積に関する工事の許可）" },
      { law: "moridorei", article: "8", expectCaption: "（擁壁の設置に関する技術的基準）" },
    ],
    refs: [MLIT_MORIDO, MLIT_MORIDO_GAIYO],
    when: (p) => {
      const fill = p.fillHeight ?? 0;
      const cut = p.cutHeight ?? 0;
      const area = p.earthworkArea ?? 0;
      const inZone = has(p, "宅地造成等工事規制区域") || has(p, "特定盛土等規制区域");
      const overThreshold = fill > 1 || cut > 2 || area > 500;
      if (inZone && overThreshold) return "required";
      if (inZone) return "likely";
      if (overThreshold || extra(p, "高さ2m超の擁壁・崖に近接")) return "likely";
      if (fill > 0 || cut > 0 || area > 0 || p.workType === "造成・土地利用のみ") return "check";
      return null;
    },
  },
  {
    id: "dosha-red",
    category: "造成・災害リスク",
    title: "土砂災害特別警戒区域（レッド）内の建築",
    summary:
      "特別警戒区域内で住宅宅地分譲や社会福祉施設・学校・医療施設など（制限用途）の予定建築物を伴う開発行為は都道府県知事の許可が必要です（土砂災害防止法10条）。居室を有する建築物は、想定される土石等の力に対して安全な構造（外壁・構造耐力上主要な部分の構造規制。法24条→令80条の3）が確認申請で審査されます。移転勧告（26条）の対象区域でもあります。",
    action: "都道府県が公表する土石等の高さ・力の数値を取得し、RC壁・待受け擁壁などの対策費用を見積りに反映。宅建業法上の重要事項説明の対象です。",
    roles: ["設計", "営業", "コーディネーター"],
    cites: [
      { law: "doshaho", article: "9", expectCaption: "（土砂災害特別警戒区域）" },
      { law: "doshaho", article: "10", expectCaption: "（特定開発行為の制限）" },
      { law: "doshaho", article: "24", expectCaption: "（特別警戒区域内における居室を有する建築物の構造耐力に関する基準）" },
      { law: "kenkirei", article: "80_3", expectCaption: "（土砂災害特別警戒区域内における居室を有する建築物の構造方法）" },
    ],
    when: (p) => (has(p, "土砂災害特別警戒区域（レッド）") ? "required" : null),
  },
  {
    id: "dosha-yellow",
    category: "造成・災害リスク",
    title: "土砂災害警戒区域（イエロー）",
    summary: "警戒区域は建築制限はありませんが、市町村の警戒避難体制の対象で（土砂災害防止法7条・8条）、宅地建物取引業法35条の重要事項説明の対象です。要配慮者利用施設には避難確保計画の作成義務があります。",
    action: "施主への説明（ハザードマップ）と、火災保険・水災補償の助言。特別警戒区域に隣接する場合は区域の拡大指定の可能性も確認。",
    roles: ["営業", "コーディネーター"],
    cites: [
      { law: "doshaho", article: "7", expectCaption: "（土砂災害警戒区域）" },
      { law: "takkenho", article: "35", expectCaption: "（重要事項の説明等）" },
    ],
    when: (p) => (has(p, "土砂災害警戒区域（イエロー）") ? "likely" : null),
  },
  {
    id: "kyukeisha",
    category: "造成・災害リスク",
    title: "急傾斜地崩壊危険区域内の行為制限",
    summary: "急傾斜地崩壊危険区域内では、切土・盛土、工作物の設置など崩壊を助長・誘発するおそれのある行為に都道府県知事の許可が必要です（急傾斜地法7条）。多くの都道府県は建築基準条例（がけ条例）でも建築制限を定めています。",
    action: "都道府県の砂防課で区域図と許可基準を確認。",
    roles: ["設計", "コーディネーター"],
    cites: [{ law: "kyukeishaho", article: "7", expectCaption: "（行為の制限）" }],
    when: (p) => (has(p, "急傾斜地崩壊危険区域") ? "required" : null),
  },
  {
    id: "jisuberi",
    category: "造成・災害リスク",
    title: "地すべり防止区域内の行為制限",
    summary: "地すべり防止区域内では、地下水の排除を阻害する行為、のり切り・切土、一定規模の盛土などに都道府県知事の許可が必要です（地すべり等防止法18条）。",
    action: "都道府県の担当課で区域と許可要件を確認。",
    roles: ["設計", "コーディネーター"],
    cites: [{ law: "jisuberiho", article: "18", expectCaption: "（行為の制限）" }],
    when: (p) => (has(p, "地すべり防止区域") ? "required" : null),
  },
  {
    id: "shinsui",
    category: "造成・災害リスク",
    title: "浸水想定区域",
    summary: "浸水想定区域内の建築に法律上の直接の建築制限はありませんが、水害ハザードマップにおける所在地は宅建業法35条の重要事項説明の対象で、浸水深に応じた床高・電気設備の位置・止水対策は設計上の重要な検討事項です。自治体によっては条例・地区計画で床高等を定めています。",
    action: "想定浸水深・継続時間を確認し、基礎高・1階床高・受電設備位置を施主と合意。",
    roles: ["設計", "営業"],
    cites: [{ law: "takkenho", article: "35", expectCaption: "（重要事項の説明等）" }],
    when: (p) => (has(p, "浸水想定区域") ? "likely" : null),
  },
  {
    id: "kasen",
    category: "造成・災害リスク",
    title: "川・水路に近い敷地（河川区域・河川保全区域・水路の管理者）",
    summary:
      "河川区域内の土地の占用（河川法24条）、工作物の新築・改築（26条）、掘削・盛土（27条）は河川管理者の許可が必要です。河川区域の外でも、河川管理者は河岸・堤防を守るため河川区域の境界から50m以内に河川保全区域を指定でき（54条）、その中では土地の形状変更や工作物の新築に許可が要ります（55条）。一級・二級河川以外でも市町村長が指定した準用河川には河川法が準用され（100条）、それ以外の普通河川・農業用水路（法定外公共物など）は市町村の条例や土地改良区が管理します。区域界は現地の見た目では分からず、管理者の図面と立会いで決まります。",
    action:
      "河川管理者（一級河川の直轄区間は国の河川事務所、それ以外は都道府県の土木事務所、準用・普通河川は市町村の河川・土木課）で、①河川の種別と管理者、②河川区域・河川保全区域の境界と敷地との位置関係、③水路の官民境界（境界確定の要否）、④橋・排水管・擁壁など水路にかかる工作物の許可、を確認。建物配置・基礎・外構の掘削位置はその結果で決めてください。",
    roles: ["設計", "コーディネーター", "営業"],
    cites: [
      { law: "kasenho", article: "6", expectCaption: "（河川区域）" },
      { law: "kasenho", article: "24", expectCaption: "（土地の占用の許可）" },
      { law: "kasenho", article: "26", expectCaption: "（工作物の新築等の許可）" },
      { law: "kasenho", article: "27", expectCaption: "（土地の掘削等の許可）" },
      { law: "kasenho", article: "54", expectCaption: "（河川保全区域）" },
      { law: "kasenho", article: "55", expectCaption: "（河川保全区域における行為の制限）" },
      { law: "kasenho", article: "100", expectCaption: "（この法律の規定を準用する河川）" },
    ],
    when: (p) => (has(p, "河川区域・河川保全区域") ? "required" : waterWithin(p, 20) ? "likely" : waterWithin(p, 60) ? "check" : null),
  },
  {
    id: "suiro-setsudo",
    category: "敷地・道路",
    title: "水路・川を挟んで道路に接する敷地（橋・暗渠と接道）",
    summary:
      "敷地と道路の間に水路があると、敷地は道路に直接接していません。接道義務（法43条1項）を満たすには、水路に橋や暗渠を設けて管理者の占用・工作物の許可を受けたうえで、特定行政庁がそれを接道として扱うかの確認が必要です（扱いは自治体の運用によります）。認められない場合は43条2項の認定・許可が必要になり、建てられない、または工程が数か月延びることがあります。",
    action:
      "公図で敷地と道路の間に水路（青線・地番のない細長い土地）がないかを確認。あれば、建築指導課で接道の扱いを、水路管理者（市町村の土木課・土地改良区）で橋・乗入れの占用許可の要件と期間を、契約前に確認してください。",
    roles: ["設計", "営業", "コーディネーター"],
    cites: [
      { law: "kenkiho", article: "43", expectCaption: "（敷地等と道路との関係）" },
      { law: "kasenho", article: "24", expectCaption: "（土地の占用の許可）" },
    ],
    // "likely" only when the documents say the waterway lies between the road and the site;
    // a waterway merely nearby (or along another side) is a check, and none once the road type is known.
    when: (p) =>
      !isBuild(p)
        ? null
        : WATER_BETWEEN.test(p.landInfo)
          ? "likely"
          : (waterWithin(p, 20) || /水路|青線|用水|暗渠/.test(p.landInfo)) && p.roadType === "不明"
            ? "check"
            : null,
  },
  {
    id: "horyusaki",
    category: "敷地・道路",
    title: "雨水・生活排水の放流先（側溝・水路・用排水路）",
    summary:
      "敷地の雨水・汚水は下水道・側溝などへ排出する施設を設ける必要があります（法19条2項）。下水道の処理区域外では浄化槽で処理した水と雨水を側溝や水路へ放流しますが、浄化槽の設置届（浄化槽法5条）では放流先を示す必要があり、放流先が農業用排水路・普通河川の場合は管理者（土地改良区・水利組合・市町村）の同意書を求める自治体が多くあります。同意が得られないと浸透処理などの設計変更が必要になります。",
    action:
      "上下水道課で下水道の処理区域か（供用開始時期を含む）を確認。区域外なら、放流先の側溝・水路の管理者と同意の要否・様式を確認し、浄化槽の位置・放流管のルート・高さ（放流先の水位より高いか）を配置計画の段階で決めてください。",
    roles: ["設計", "コーディネーター", "施工"],
    cites: [
      { law: "kenkiho", article: "19", expectCaption: "（敷地の衛生及び安全）" },
      { law: "jokasoho", article: "5", expectCaption: "（設置等の届出、勧告及び変更命令）" },
      { law: "gesuidoho", article: "10", expectCaption: "（排水設備の設置等）" },
    ],
    when: (p) => (isNew(p) && (extra(p, "浄化槽（下水道なし）") || waterWithin(p, 60) || farmOnSite(p) || p.signals.farmland === "周辺に農地" || ruralArea(p)) ? "likely" : null),
  },
  {
    id: "shizen-koen",
    category: "造成・災害リスク",
    title: "自然公園内の行為",
    summary: "国立・国定公園の特別地域内での建築・土地の形状変更等は環境大臣または都道府県知事の許可が必要で（自然公園法20条）、普通地域でも一定規模の建築・形状変更は届出が必要です（33条）。都道府県立自然公園は各県の条例に基づきます。",
    action: "環境省自然保護官事務所または県の自然保護課で地域区分（特別保護地区・第1〜3種特別地域・普通地域）と許可基準（高さ13m、建築面積等）を確認。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "shizenkoenho", article: "20", expectCaption: "（特別地域）" },
      { law: "shizenkoenho", article: "33", expectCaption: "（普通地域）" },
    ],
    when: (p) => (has(p, "自然公園（国立・国定・県立）") ? "required" : null),
  },

  // ---------------------------------------------------------------- 資格・契約
  {
    id: "kenchikushi",
    category: "資格・契約・販売",
    title: "設計・工事監理に必要な建築士資格",
    summary:
      "木造で延べ面積100㎡超は木造建築士以上（建築士法3条の3）、木造で300㎡超または階数3以上、非木造（RC・S等）で30㎡超は二級建築士以上（3条の2）、木造で高さ16m超または地階を除く階数4以上、非木造で延べ面積300㎡超・高さ13m超・軒高9m超のいずれか、学校・病院・百貨店等で500㎡超、延べ面積1,000㎡超かつ階数2以上は一級建築士（3条）でなければ設計・工事監理ができません。建築士の設計でないと確認申請は受理されません（建築基準法6条3項）。",
    action: "計画規模から必要資格を確定し、社内の設計者・工事監理者の資格と建築士事務所登録（23条）を確認。",
    roles: ["設計", "コーディネーター"],
    cites: [
      { law: "kenchikushiho", article: "3", expectCaption: "（一級建築士でなければできない設計又は工事監理）" },
      { law: "kenchikushiho", article: "3_2", expectCaption: "（一級建築士又は二級建築士でなければできない設計又は工事監理）" },
      { law: "kenchikushiho", article: "3_3", expectCaption: "（一級建築士、二級建築士又は木造建築士でなければできない設計又は工事監理）" },
      { law: "kenchikushiho", article: "23", expectCaption: "（登録）" },
    ],
    when: (p) => (isBuild(p) ? "required" : null),
  },
  {
    id: "juyo-jiko",
    category: "資格・契約・販売",
    title: "設計・工事監理契約の重要事項説明と書面交付",
    summary: "建築士事務所の開設者は、設計受託契約・工事監理受託契約を結ぶ前に、管理建築士等に書面を交付して重要事項（作成する設計図書の種類、工事と設計図書との照合方法、報酬額、建築士の氏名等）を説明させ（建築士法24条の7）、契約締結時には書面を交付しなければなりません（24条の8）。",
    action: "設計契約前の重説（建築士免許証の提示を含む）と契約書面の交付を営業・コーディネーターの標準フローに組み込む。",
    roles: ["コーディネーター", "営業"],
    cites: [
      { law: "kenchikushiho", article: "24_7", expectCaption: "（重要事項の説明等）" },
      { law: "kenchikushiho", article: "24_8", expectCaption: "（書面の交付）" },
    ],
    when: (p) => (isBuild(p) ? "required" : null),
  },
  {
    id: "kensetsugyo",
    category: "資格・契約・販売",
    title: "建設業許可と請負契約書面",
    summary:
      "請負代金500万円（建築一式工事は1,500万円）以上、または延べ面積150㎡以上の木造住宅の建築一式工事を請け負うには建設業許可が必要です（建設業法3条、令1条の2）。請負契約は工事内容・代金・工期・支払・契約不適合責任など法定事項を記載した書面（電磁的方法可）で締結し（19条）、現場には主任技術者（または監理技術者）を置きます（26条）。",
    action: "請負金額・面積から許可の要否を確認し、下請も含めて許可業種を確認。契約書は法19条の記載事項を満たす標準様式を使用。",
    roles: ["施工", "営業"],
    cites: [
      { law: "kensetsugyoho", article: "3", expectCaption: "（建設業の許可）" },
      { law: "kensetsugyorei", article: "1_2", expectCaption: "（法第三条第一項ただし書の軽微な建設工事）" },
      { law: "kensetsugyoho", article: "19", expectCaption: "（建設工事の請負契約の内容）" },
      { law: "kensetsugyoho", article: "26", expectCaption: "（主任技術者及び監理技術者の設置等）" },
    ],
    when: (p) => (isBuild(p) || p.workType === "解体のみ" ? "required" : null),
  },
  {
    id: "kashitanpo",
    category: "資格・契約・販売",
    title: "新築住宅の10年瑕疵担保責任と資力確保",
    summary:
      "新築住宅の請負人・売主は、構造耐力上主要な部分と雨水の浸入を防止する部分について引渡しから10年間の瑕疵担保責任を負い（品確法94条・95条）、建設業者・宅建業者はそのために保証金の供託または保険加入が義務です（住宅瑕疵担保履行法3条・11条）。",
    action: "保険法人への申込み（基礎配筋検査前）を工程に入れ、契約書に瑕疵担保責任・保険の記載。",
    roles: ["営業", "施工", "コーディネーター"],
    cites: [
      { law: "hinkakuho", article: "94", expectCaption: "（住宅の新築工事の請負人の瑕疵担保責任）" },
      { law: "hinkakuho", article: "95", expectCaption: "（新築住宅の売主の瑕疵担保責任）" },
      { law: "kashitanpoho", article: "3", expectCaption: "（住宅建設瑕疵担保保証金の供託等）" },
    ],
    when: (p) => (isNew(p) && isHousing(p) ? "required" : null),
  },
  {
    id: "takken-juyo",
    category: "資格・契約・販売",
    title: "土地・建物売買の重要事項説明（宅建業法35条）",
    summary:
      "宅建業者が売買・交換・貸借の媒介等を行うときは、契約前に宅地建物取引士が重要事項説明書を交付して説明する義務があります（宅建業法35条）。都市計画法・建築基準法等の法令上の制限、私道負担、接道、ハザードマップ上の所在地、土砂災害警戒区域等が説明事項です。",
    action: "自社で土地を仲介・販売する場合は、本チェック結果の法令制限を重要事項説明書に反映。買主側の場合は重説記載と本チェックの不一致を確認。",
    roles: ["営業"],
    cites: [
      { law: "takkenho", article: "35", expectCaption: "（重要事項の説明等）" },
      { law: "takkenho", article: "37", expectCaption: "（書面の交付）" },
    ],
    when: (p) => (mentions(p, /購入|売買|仲介|分譲|取得|建売|土地探し/) ? "likely" : null),
  },

  // ---------------------------------------------------------------- 工事
  {
    id: "recycle",
    category: "工事・解体",
    title: "建設リサイクル法の届出（着工7日前）",
    summary:
      "床面積80㎡以上の解体工事、500㎡以上の新築・増築工事、請負代金1億円以上の修繕・模様替等（令2条）は対象建設工事として、発注者が着工7日前までに都道府県知事（市）に分別解体等の計画を届け出なければなりません（法10条）。受注者は発注者への事前説明と契約書面への記載義務があります。",
    action: "解体を含む請負契約では、届出書の作成と発注者への説明（法12条）を工程表の冒頭に。",
    roles: ["施工", "コーディネーター"],
    cites: [
      { law: "recycleho", article: "10", expectCaption: "（対象建設工事の届出等）" },
      { law: "recyclerei", article: "2", expectCaption: "（建設工事の規模に関する基準）" },
      { law: "recycleho", article: "9", expectCaption: "（分別解体等実施義務）" },
    ],
    when: (p) => {
      if ((p.demolitionArea ?? 0) >= 80 || (p.totalFloorArea ?? 0) >= 500) return "required";
      if (p.workType === "解体のみ" || (p.demolitionArea ?? 0) > 0 || mentions(p, /解体|建て替え|建替/)) return "check";
      return null;
    },
  },
  {
    id: "asbestos",
    category: "工事・解体",
    title: "石綿（アスベスト）の事前調査・報告",
    summary:
      "建築物の解体・改造・補修工事の元請業者は、規模にかかわらず石綿含有建材の有無を設計図書と目視等で事前調査し、結果を発注者に書面で説明しなければなりません（大気汚染防止法18条の15）。一定規模（解体部分の床面積80㎡以上、改修請負100万円以上）の工事は調査結果を都道府県等に電子報告し、石綿含有建材の除去作業は作業開始14日前までの届出が必要です（18条の17）。2023年10月以降、事前調査は有資格者（建築物石綿含有建材調査者等）が行う必要があります。",
    action: "解体・リフォームを含む見積りには有資格者による事前調査費を計上。2006年9月以前の建物は含有の可能性を前提に工程を組む。",
    roles: ["施工", "営業"],
    cites: [
      { law: "taikiho", article: "18_15", expectCaption: "（解体等工事に係る調査及び説明等）" },
      { law: "taikiho", article: "18_17", expectCaption: "（特定粉じん排出等作業の実施の届出）" },
    ],
    when: (p) =>
      p.workType === "解体のみ" || p.workType === "改築・大規模修繕・模様替" || (p.demolitionArea ?? 0) > 0 || extra(p, "既存建物が2006年以前の建築（石綿の可能性）") || mentions(p, /解体|建て替え|建替|リフォーム|改修/)
        ? "required"
        : null,
  },
  {
    id: "soon-shindo",
    category: "工事・解体",
    title: "特定建設作業の届出（騒音・振動）",
    summary: "指定地域内でくい打ち機・バックホウ・ブレーカー等を使う特定建設作業を行う場合、作業開始7日前までに市町村長への届出が必要です（騒音規制法14条、振動規制法14条）。作業時間・日数の基準も定められています。",
    action: "解体・基礎工事の重機使用を確認し、市の環境課へ届出。近隣説明と併せて実施。",
    roles: ["施工"],
    cites: [
      { law: "soonho", article: "14", expectCaption: "（特定建設作業の実施の届出）" },
      { law: "shindoho", article: "14", expectCaption: "（特定建設作業の実施の届出）" },
    ],
    when: (p) => (isBuild(p) || p.workType === "解体のみ" ? "likely" : null),
  },
  {
    id: "doro-shiyo",
    category: "工事・解体",
    title: "道路使用許可・道路占用許可・乗入れ工事",
    summary:
      "道路上での作業・工事車両の駐停車等は警察署長の道路使用許可（道路交通法77条）、足場・仮囲い・工事用施設を道路に設けるには道路管理者の占用許可（道路法32条）、車両乗入れのための歩道切下げ・側溝改修は道路管理者の承認工事（道路法24条）が必要です。",
    action: "前面道路の管理者（国・県・市）と所轄警察署を特定し、着工前に許可申請。乗入れ位置は設計段階で道路管理者に協議。",
    roles: ["施工", "設計"],
    cites: [
      { law: "dokoho", article: "77", expectCaption: "（道路の使用の許可）" },
      { law: "doroho", article: "32", expectCaption: "（道路の占用の許可）" },
      { law: "doroho", article: "24", expectCaption: "（道路管理者以外の者の行う工事）" },
    ],
    when: (p) => (extra(p, "工事車両の道路使用・乗入れ新設") ? "required" : isBuild(p) || p.workType === "解体のみ" ? "likely" : null),
  },
  {
    id: "anzen",
    category: "工事・解体",
    title: "労働安全衛生法の計画届・工事現場の危害防止",
    summary: "高さ31mを超える建築物の建設等の仕事は開始14日前までに労働基準監督署長への計画届が必要です（労働安全衛生法88条）。また、工事現場では落下物・崩落・火災防止の措置（仮囲い、落下物防護等）が建築基準法でも義務付けられています（法90条）。",
    action: "高層計画は計画届と足場・クレーン等の設置届を工程に。一般住宅でも仮囲い・養生計画を近隣説明資料に添付。",
    roles: ["施工"],
    cites: [
      { law: "anzenho", article: "88", expectCaption: "（計画の届出等）" },
      { law: "kenkiho", article: "90", expectCaption: "（工事現場の危害の防止）" },
    ],
    when: (p) => ((p.height ?? 0) > 31 ? "required" : isBuild(p) ? "likely" : null),
  },
  {
    id: "kasetsu",
    category: "工事・解体",
    title: "現場事務所等の仮設建築物",
    summary: "工事を施工するために現場に設ける事務所・下小屋・材料置場等の仮設建築物には、確認申請（法6条）など多くの規定が適用されません（法85条2項）。ただし防火地域内の規定など一部は適用されます。",
    action: "仮設ハウスの配置は敷地内か道路占用かを整理（道路なら占用許可）。",
    roles: ["施工"],
    cites: [{ law: "kenkiho", article: "85", expectCaption: "（仮設建築物に対する制限の緩和）" }],
    when: (p) => (isBuild(p) ? "likely" : null),
  },
  {
    id: "kokuho",
    category: "工事・解体",
    title: "航空法・電波法の高さ関連規制",
    summary: "空港周辺の制限表面を超える物件の設置は禁止され（航空法49条）、高さ60m以上の物件には航空障害灯の設置義務があります（51条）。伝搬障害防止区域内で高さ31mを超える建築物は電波法102条の2の届出が必要です。",
    action: "空港周辺または高さ31m超の計画は、国土交通省航空局・総務省総合通信局への確認。",
    roles: ["設計"],
    cites: [
      { law: "kokuho", article: "49", expectCaption: "（物件の制限等）" },
      { law: "kokuho", article: "51", expectCaption: "（航空障害灯）" },
      { law: "dempaho", article: "102_2", expectCaption: "（伝搬障害防止区域の指定）" },
    ],
    when: (p) => ((p.height ?? 0) >= 60 ? "required" : (p.height ?? 0) > 31 || mentions(p, /空港|飛行場/) ? "likely" : null),
  },
  {
    id: "koukoku",
    category: "工事・解体",
    title: "屋外広告物（看板）の許可",
    summary: "屋外広告物は都道府県・市の屋外広告物条例で、禁止区域（3条）や許可を要する区域・規模（4条）が定められています（屋外広告物法）。店舗の袖看板・屋上看板・自立看板は多くの場合許可が必要で、一定規模の広告塔は建築基準法の工作物として確認申請の対象になります（法88条、高さ4m超）。",
    action: "看板の位置・面積・高さを決め、市の屋外広告物担当課へ許可申請。",
    roles: ["設計", "営業"],
    cites: [
      { law: "okugaikokokuho", article: "4", expectCaption: "（広告物の表示等の制限）" },
      { law: "kenkiho", article: "88", expectCaption: "（工作物への準用）" },
    ],
    when: (p) => (extra(p, "屋外広告物・看板") || mentions(p, /看板|広告塔|サイン/) ? "required" : null),
  },

  // ---------------------------------------------------------------- 近隣・民事
  {
    id: "minpo-kyokai",
    category: "近隣・民事",
    title: "境界線付近の建築（50cm）と目隠し（1m）",
    summary:
      "建物は境界線から50cm以上離すのが民法の原則で（民法234条）、違反すると隣地所有者は着工から1年以内かつ完成前なら建築の中止・変更を求められます。境界線から1m未満で隣地を見通せる窓・ベランダには目隠しの設置義務があります（235条）。異なる慣習があればそれに従います（236条）。防火地域・準防火地域内の耐火構造の外壁は隣地境界線に接して建てられ（建築基準法63条）、判例上この場合は民法234条は適用されません。",
    action: "境界確定（筆界・所有権界）と越境物の有無を契約前に確認。隣地と50cm未満の配置は事前に隣地所有者と合意書を取る。",
    roles: ["設計", "営業", "コーディネーター"],
    cites: [
      { law: "minpo", article: "234", expectCaption: "（境界線付近の建築の制限）" },
      { law: "minpo", article: "235" },
      { law: "minpo", article: "236", expectCaption: "（境界線付近の建築に関する慣習）" },
      { law: "kenkiho", article: "63", expectCaption: "（隣地境界線に接する外壁）" },
    ],
    when: (p) => (isBuild(p) ? (extra(p, "境界未確定・越境あり") ? "required" : "likely") : null),
  },
  {
    id: "rinchi-shiyo",
    category: "近隣・民事",
    title: "隣地使用権・囲繞地通行権",
    summary: "境界付近の建築・修繕のために必要な範囲で隣地を使用できますが、原則として事前通知が必要です（民法209条）。公道に通じない土地は公道に至るための他の土地の通行権があります（210条）が、建築基準法上の接道義務を満たすことにはなりません。",
    action: "足場が隣地にかかる場合は事前に隣地所有者へ通知し、使用範囲・期間・補償を書面化。",
    roles: ["施工", "コーディネーター"],
    cites: [
      { law: "minpo", article: "209", expectCaption: "（隣地の使用）" },
      { law: "minpo", article: "210", expectCaption: "（公道に至るための他の土地の通行権）" },
    ],
    when: (p) => (isBuild(p) && (extra(p, "境界未確定・越境あり") || p.roadType === "道路に該当しない・不明（通路・農道・水路等）" || (p.frontage !== null && p.frontage < 2)) ? "likely" : null),
  },
];

// Where each rule bites and whom to ask. Agency names are generic (the actual
// section name differs by municipality); the agent names the real counter.
const KENCHIKU = "建築指導課（特定行政庁）・確認検査機関";
const TOSHI = "都市計画課・開発指導課";
const NOGYO = "農業委員会";
const KASEN = "河川管理者（国・県の河川／土木事務所、市町村の河川・土木課）";
const KAIRYO = "土地改良区";
const SUIDO = "上下水道課";
const SHOBO = "消防本部（予防課）";
const BUNKAZAI = "教育委員会（文化財担当）";
const DORO = "道路管理者・警察署";
const KEN_SABO = "都道府県（砂防・治山・林務の担当課）";
const KANKYO = "環境部局（騒音・振動・石綿・建設リサイクル）";
const KEIKAN = "景観・まちづくり担当課";
const FUKUSHI = "保健所・福祉部局・観光部局";
const SHANAI = "社内（契約・書面・保険）";

const META: Record<string, RuleMeta> = {
  "zoning-unknown": { stage: "計画段階", agency: TOSHI },
  "road-unknown": { stage: "計画段階", agency: KENCHIKU },
  "hazard-unknown": { stage: "計画段階", agency: TOSHI },
  "kakunin-shinsei": { stage: "申請・届出", agency: KENCHIKU, routine: true },
  "shinsa-shoryaku": { stage: "申請・届出", agency: KENCHIKU, routine: true },
  "kozo-keisan": { stage: "設計", agency: KENCHIKU, routine: true },
  shoene: { stage: "設計", agency: KENCHIKU, routine: true },
  "kanryo-kensa": { stage: "申請・届出", agency: KENCHIKU, routine: true },
  "koji-todoke": { stage: "申請・届出", agency: KENCHIKU, routine: true },
  "shobo-doi": { stage: "申請・届出", agency: SHOBO, routine: true },
  "yoto-henko": { stage: "申請・届出", agency: KENCHIKU },
  setsudo: { stage: "計画段階", agency: KENCHIKU },
  setback: { stage: "計画段階", agency: KENCHIKU },
  shido: { stage: "計画段階", agency: KENCHIKU },
  "suiro-setsudo": { stage: "計画段階", agency: KENCHIKU },
  "kenpei-yoseki": { stage: "設計", agency: KENCHIKU, routine: true },
  "low-rise-form": { stage: "設計", agency: KENCHIKU },
  shasen: { stage: "設計", agency: KENCHIKU, routine: true },
  nichiei: { stage: "設計", agency: KENCHIKU },
  "shikichi-eisei": { stage: "設計", agency: KENCHIKU },
  "saitei-shikichi": { stage: "計画段階", agency: TOSHI },
  lifeline: { stage: "計画段階", agency: SUIDO, routine: true },
  horyusaki: { stage: "計画段階", agency: SUIDO },
  "yoto-seigen": { stage: "計画段階", agency: KENCHIKU },
  tokushu: { stage: "設計", agency: KENCHIKU },
  kaihekiheki: { stage: "設計", agency: KENCHIKU },
  "barrier-free": { stage: "設計", agency: KENCHIKU },
  chusha: { stage: "設計", agency: TOSHI },
  minpaku: { stage: "計画段階", agency: FUKUSHI },
  daiten: { stage: "計画段階", agency: "都道府県（商工担当）" },
  "kojo-richi": { stage: "計画段階", agency: "市町村（工場立地担当）" },
  fukushi: { stage: "計画段階", agency: FUKUSHI },
  "boka-chiiki": { stage: "設計", agency: KENCHIKU },
  ho22: { stage: "設計", agency: KENCHIKU },
  jukeiki: { stage: "設計", agency: SHOBO, routine: true },
  "shobo-setsubi": { stage: "設計", agency: SHOBO },
  "saiko-kanki": { stage: "設計", agency: KENCHIKU, routine: true },
  kaidan: { stage: "設計", agency: KENCHIKU, routine: true },
  elevator: { stage: "設計", agency: KENCHIKU },
  "kizon-futekikaku": { stage: "設計", agency: KENCHIKU },
  taishin: { stage: "設計", agency: KENCHIKU },
  "chosei-kuiki": { stage: "計画段階", agency: TOSHI },
  "kaihatsu-kyoka": { stage: "計画段階", agency: TOSHI },
  "chiku-keikaku": { stage: "申請・届出", agency: TOSHI },
  keikan: { stage: "申請・届出", agency: KEIKAN },
  maizo: { stage: "計画段階", agency: BUNKAZAI },
  "kukaku-seiri": { stage: "計画段階", agency: "区画整理事務所・都市計画課" },
  "seisan-ryokuchi": { stage: "計画段階", agency: TOSHI },
  "toshi-keikaku-doro": { stage: "計画段階", agency: TOSHI },
  "saigai-kiken": { stage: "計画段階", agency: KENCHIKU },
  "omori-zosei": { stage: "設計", agency: TOSHI },
  ritteki: { stage: "申請・届出", agency: TOSHI },
  "kodo-chiku": { stage: "設計", agency: TOSHI },
  missyu: { stage: "申請・届出", agency: TOSHI },
  "kokudo-riyo": { stage: "計画段階", agency: "市町村（国土利用計画法担当）" },
  kouyuchi: { stage: "計画段階", agency: TOSHI },
  "nochi-tenyo": { stage: "計画段階", agency: NOGYO },
  noshin: { stage: "計画段階", agency: "市町村の農政課（農振担当）" },
  "nochi-genkyo": { stage: "計画段階", agency: NOGYO },
  tochikairyo: { stage: "計画段階", agency: KAIRYO },
  "rinsetsu-nochi": { stage: "計画段階", agency: NOGYO },
  shinrin: { stage: "計画段階", agency: KEN_SABO },
  morido: { stage: "計画段階", agency: TOSHI },
  "dosha-red": { stage: "計画段階", agency: KEN_SABO },
  "dosha-yellow": { stage: "設計", agency: KEN_SABO },
  kyukeisha: { stage: "計画段階", agency: KEN_SABO },
  jisuberi: { stage: "計画段階", agency: KEN_SABO },
  shinsui: { stage: "設計", agency: "防災・河川担当課" },
  kasen: { stage: "計画段階", agency: KASEN },
  "shizen-koen": { stage: "計画段階", agency: "環境省自然保護官事務所・都道府県（自然公園担当）" },
  kenchikushi: { stage: "申請・届出", agency: SHANAI, routine: true },
  "juyo-jiko": { stage: "申請・届出", agency: SHANAI, routine: true },
  kensetsugyo: { stage: "申請・届出", agency: SHANAI, routine: true },
  kashitanpo: { stage: "申請・届出", agency: SHANAI, routine: true },
  "takken-juyo": { stage: "計画段階", agency: SHANAI },
  recycle: { stage: "工事・引渡し", agency: KANKYO, routine: true },
  asbestos: { stage: "工事・引渡し", agency: KANKYO },
  "soon-shindo": { stage: "工事・引渡し", agency: KANKYO, routine: true },
  "doro-shiyo": { stage: "工事・引渡し", agency: DORO, routine: true },
  anzen: { stage: "工事・引渡し", agency: "労働基準監督署", routine: true },
  kasetsu: { stage: "工事・引渡し", agency: KENCHIKU, routine: true },
  kokuho: { stage: "設計", agency: "空港事務所・総務省総合通信局" },
  koukoku: { stage: "申請・届出", agency: KEIKAN },
  "minpo-kyokai": { stage: "設計", agency: "近隣（民事）", routine: true },
  "rinchi-shiyo": { stage: "工事・引渡し", agency: "近隣（民事）" },
};

export const MISSING_META = RULE_DEFS.filter((r) => !META[r.id]).map((r) => r.id);

export const RULES: Rule[] = RULE_DEFS.map((r) => ({ ...r, ...(META[r.id] ?? { stage: "設計", agency: KENCHIKU }) }));

export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));

export const CATEGORY_ORDER: Category[] = [
  "まず確認すること",
  "土地・区域・開発",
  "農地・山林",
  "造成・災害リスク",
  "敷地・道路",
  "用途・形態制限",
  "手続き・申請",
  "防火・避難・消防",
  "構造・居室",
  "資格・契約・販売",
  "工事・解体",
  "近隣・民事",
];
