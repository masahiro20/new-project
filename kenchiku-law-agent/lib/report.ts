// The agent's final answer as structured data. The model hands it over through
// the `submit_report` tool, so the UI can lay it out as
// "結論 → 見落としチェック → 設計で注意すること → 役所への事前協議 → 手続き → タスク"
// instead of one long Markdown page. Every claim carries a certainty
// (確定／要確認／推測) and its sources, so readers can tell fact from estimate.

import { z } from "zod";

export const VERDICTS = ["通常の手続きで建築可能", "条件付きで建築可能", "許可・協議が前提", "建築が難しい可能性", "情報不足で判断保留"] as const;
export const PRIORITIES = ["高", "中", "低"] as const;
export const CHECK_STATUS = ["該当", "可能性あり", "要確認", "該当なし"] as const;
export const ASK_TO = ["施主", "土地の売主・仲介", "社内", "役所"] as const;
export const ROLES = ["設計", "コーディネーター", "施工", "営業"] as const;
/** How sure a statement is. 確定 needs a source that states it directly. */
export const CERTAINTY = ["確定", "要確認", "推測"] as const;
export type Certainty = (typeof CERTAINTY)[number];
export const CERTAINTY_HELP: Record<Certainty, string> = {
  確定: "条文・公的資料・添付資料に書いてあり、この敷地に当てはまることを確認したもの",
  要確認: "根拠はあるが、窓口の判断・現地・原本・条例を確かめるまで決まらないもの",
  推測: "地図の代表点・写真・一般的な傾向からの見立て。出典では裏付けていないもの",
};
export const CERTAINTY_SHORT: Record<Certainty, string> = { 確定: "出典で確認済み", 要確認: "窓口・現地で決まる", 推測: "地図・写真からの見立て" };
/** When a task has to be done, in project order. */
export const TASK_WHEN = ["今すぐ", "土地契約前", "設計着手前", "確認申請前", "着工前", "工事中", "完了後"] as const;

/** The fixed list the model must walk through, so nothing silently drops out. */
export const CHECKLIST_ITEMS = [
  "現況が農地か（農地転用・農振・土地改良区・地目変更）",
  "川・水路との関係（河川区域・河川保全区域・水路の占用・境界）",
  "前面道路が建築基準法上の道路か（農道・里道・水路を挟む・2項道路）",
  "市街化調整区域等での建築可否（開発許可・建築許可の立地基準）",
  "がけ・高低差・擁壁（がけ条例・盛土規制法）",
  "浸水・土砂災害・地盤（床高さ・構造・盛土造成地）",
  "埋蔵文化財包蔵地",
  "上下水道・浄化槽と放流先",
  "境界・越境・私道の承諾",
  "都市計画道路・地区計画・景観・高度地区",
  "防火・準防火・法22条区域と外壁・開口部",
  "高さ・斜線・日影・建蔽率・容積率",
] as const;

const evidence = z.object({ label: z.string(), url: z.string() });
export type Evidence = z.infer<typeof evidence>;
// A missing or unknown certainty is never shown as 確定.
const certainty = z.enum(CERTAINTY).catch("要確認");

/** 総合所見（土地情報確認AIツールと同じ3段階）。 */
export const GRADES = ["A", "B", "C"] as const;
export const GRADE_HELP: Record<(typeof GRADES)[number], string> = {
  A: "大きな障害なし。通常の手続きで進められる",
  B: "条件付き。許可・届出・追加工事など確認と対応が要る",
  C: "建築が難しいか、大きな追加費用・期間がかかる",
};

const sheetField = z.object({ value: z.string().catch(""), certainty: z.enum(CERTAINTY).catch("要確認"), source: z.string().catch("") }).partial();
const SHEET_KEYS = [
  "heightDistrict", "wallSetback", "buildingAgreement", "otherDistricts",
  "road1Kou", "road1Gou", "road1Direction", "road1Width", "road1Owner",
  "road2Kou", "road2Gou", "road2Direction", "road2Width", "road2Owner",
  "water", "sewage",
] as const;

export const reportSchema = z.object({
  summary: z.object({
    verdict: z.enum(VERDICTS),
    headline: z.string(),
    topRisks: z.array(z.string()),
    schedule: z.string(),
    // Added later; older saved reports have none of these, so they stay optional.
    grade: z.enum(GRADES).optional().catch(undefined),
    costImpacts: z.array(z.string()).optional().catch(undefined),
    customerPoints: z.array(z.string()).optional().catch(undefined),
  }),
  design: z.array(z.object({ title: z.string(), detail: z.string(), priority: z.enum(PRIORITIES), certainty, evidence: z.array(evidence) })),
  consultations: z.array(
    z.object({
      agency: z.string(),
      purpose: z.string(),
      items: z.array(z.string()),
      bring: z.string(),
      timing: z.string(),
      evidence: z.array(evidence),
    }),
  ),
  procedures: z.array(z.object({ step: z.string(), timing: z.string(), duration: z.string(), agency: z.string(), certainty, evidence: z.array(evidence) })),
  checklist: z.array(z.object({ item: z.string(), status: z.enum(CHECK_STATUS), certainty, note: z.string(), evidence: z.array(evidence).catch([]) })),
  documents: z.array(z.object({ name: z.string(), kind: z.string(), facts: z.array(z.string()), concerns: z.array(z.string()) })),
  questions: z.array(z.object({ to: z.enum(ASK_TO), question: z.string() })),
  tasks: z.array(z.object({ task: z.string(), role: z.enum(ROLES), when: z.enum(TASK_WHEN).catch("設計着手前"), agency: z.string().catch("") })),
  assumptions: z.array(z.string()),
  /** 「AIに見てほしいこと」への一問一答（質問がなければ空）。 */
  answers: z.array(z.object({ question: z.string(), answer: z.string(), certainty, evidence: z.array(evidence).catch([]) })).catch([]),
  /** 法令制限確認書の、調べて埋める欄（分かったものだけ）。 */
  sheet: z
    .preprocess(
      // Unknown keys from the model are dropped rather than failing the whole sheet.
      (v) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => (SHEET_KEYS as readonly string[]).includes(k))) : v),
      z.partialRecord(z.enum(SHEET_KEYS), sheetField),
    )
    .optional()
    .catch(undefined),
});

export type Report = z.infer<typeof reportSchema>;

/** Same shape, every field optional — what the UI receives while the tool input is still streaming. */
export type PartialReport = {
  summary?: Partial<Report["summary"]>;
  design?: Partial<Report["design"][number]>[];
  consultations?: Partial<Report["consultations"][number]>[];
  procedures?: Partial<Report["procedures"][number]>[];
  checklist?: Partial<Report["checklist"][number]>[];
  documents?: Partial<Report["documents"][number]>[];
  questions?: Partial<Report["questions"][number]>[];
  tasks?: Partial<Report["tasks"][number]>[];
  assumptions?: string[];
  answers?: Partial<Report["answers"][number]>[];
  sheet?: Report["sheet"];
};

const str = (description: string) => ({ type: "string", description });
const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties: Record<string, unknown>, description?: string) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
});
const certaintyProp = {
  type: "string",
  enum: [...CERTAINTY],
  description: `確定＝${CERTAINTY_HELP.確定}（evidence に直接の出典が必須）／要確認＝${CERTAINTY_HELP.要確認}／推測＝${CERTAINTY_HELP.推測}`,
};
const evidenceArr = {
  type: "array",
  description: "根拠。条文は e-Gov の URL（https://laws.e-gov.go.jp/law/法令ID#Mp-At_条番号）、公的資料はその URL。label は「建築基準法第43条」「浜松市 がけ条例の解説」など短く。",
  items: obj({ label: str("根拠の名前"), url: str("URL。なければ空文字") }),
};

export const REPORT_INPUT_SCHEMA = obj({
  summary: obj(
    {
      verdict: { type: "string", enum: [...VERDICTS], description: "この計画が建てられる見込みの一言判定" },
      headline: str("結論を1〜2文・120字以内で。何がこの計画の成否・工程を決めるかだけを書く（詳細は topRisks 以降に回す）"),
      topRisks: strArr("いちばん効く論点を最大3つ。各1文・80字以内"),
      schedule: str("工程への影響の見込みを100字以内で（例：農地転用と開発許可で着工まで通常より3〜6か月長い）。不明なら何が決まれば分かるか"),
      grade: { type: "string", enum: [...GRADES], description: `総合所見。A＝${GRADE_HELP.A}／B＝${GRADE_HELP.B}／C＝${GRADE_HELP.C}` },
      costImpacts: strArr("費用・工期に影響しうる項目を最大5つ。各60字以内。金額の見積もりは書かない（例：引込φ13なら給水管の増径と負担金）"),
      customerPoints: strArr("お客様への説明ポイントを2〜4つ。専門用語を避け、各60字以内"),
    },
    "冒頭に出す結論",
  ),
  checklist: {
    type: "array",
    description: `見落としチェック表。次の項目をこの順にすべて評価する：${CHECKLIST_ITEMS.join("／")}`,
    items: obj({
      item: str("チェック項目（指定の文言のまま）"),
      status: { type: "string", enum: [...CHECK_STATUS] },
      certainty: certaintyProp,
      note: str("判定の理由と、要確認ならどこで何を見るか。80字以内"),
      evidence: evidenceArr,
    }),
  },
  documents: {
    type: "array",
    description: "添付資料ごとに、読み取った事実と、自動取得データ・入力・ほかの資料との食い違いや気になる点。添付がなければ空配列",
    items: obj({
      name: str("資料名（ファイル名）"),
      kind: str("資料の種類（登記事項証明書／公図／地積測量図／現況測量図／現地写真／重要事項説明書・物件資料／その他）"),
      facts: strArr("読み取った事実（数値・地目・地番・幅員・高低差など）。最大8項目、各60字以内。読めない箇所は『判読できず』"),
      concerns: strArr("法令上気になる点・食い違い（例：登記は宅地だが写真は耕作地）。最大5項目、各80字以内。推測は推測と明記"),
    }),
  },
  design: {
    type: "array",
    description: "この家の設計で注意すること（配置・高さ・構造・防火仕様・床高さ・外構・設備ルートなど設計図に反映すべき事項）。優先度の高い順に最大6件。通常の新築で毎回やること（確認申請そのもの等）は書かない",
    items: obj({
      title: str("設計上の注意点の見出し。40字以内（例：北側斜線で2階北側の屋根勾配が制限される）"),
      detail: str("何をどう設計に反映するか。200字以内。数値は条文・公的資料で確認したものだけ"),
      priority: { type: "string", enum: [...PRIORITIES] },
      certainty: certaintyProp,
      evidence: evidenceArr,
    }),
  },
  consultations: {
    type: "array",
    description: "設計・契約の前に役所・関係機関へ事前協議・確認すべきこと。窓口ごとに1件、協議の優先順に最大6件",
    items: obj({
      agency: str("窓口（例：浜松市 農業委員会、静岡県 浜松土木事務所 河川課）。自治体名が分かれば入れる"),
      purpose: str("何を決めるための協議か（1文・60字以内）"),
      items: strArr("確認・協議する具体的な項目。最大6項目、各60字以内"),
      bring: str("持参する資料（公図・登記事項証明書・配置図案など）"),
      timing: str("いつまでに。15字以内（例：土地契約前、設計着手前、確認申請の1か月前）"),
      evidence: evidenceArr,
    }),
  },
  procedures: {
    type: "array",
    description: "必要な許可・届出・申請を実施順に並べた手続きの流れ。最大10件",
    items: obj({
      step: str("手続き名（例：農地法5条許可申請）"),
      timing: str("時期（例：毎月締切→翌月許可、着工21日前まで）"),
      duration: str("標準的な期間。条文・公的資料で確認できない場合は「窓口で確認」"),
      agency: str("提出先"),
      certainty: { ...certaintyProp, description: "この手続きが必要なことの確かさ。確定＝条文・公的資料で必要と確認／要確認＝条件次第／推測＝可能性" },
      evidence: evidenceArr,
    }),
  },
  questions: {
    type: "array",
    description: "計画を確定するために確認したい質問。非設計職でも答えられる言葉で最大8件",
    items: obj({ to: { type: "string", enum: [...ASK_TO] }, question: str("「○○は確認済みですか？」の形") }),
  },
  tasks: {
    type: "array",
    description: "やることの一覧（タスク）。設計・事前協議・手続き・質問を、誰がいつやるかの行動に落としたもの。重複させず実施順に最大12件",
    items: obj({
      task: str("やること。動詞で終える。50字以内（例：農業委員会に5条届出の受付日と添付書類を確認する）"),
      role: { type: "string", enum: [...ROLES], description: "主に担当する職種" },
      when: { type: "string", enum: [...TASK_WHEN], description: "いつまでに" },
      agency: str("相手先の窓口・人。なければ空文字"),
    }),
  },
  assumptions: strArr("前提にしたこと・未確認のまま置いた仮定・推測で埋めたこと。最大5件"),
  answers: {
    type: "array",
    description: "入力の「AIに見てほしいこと」の各項目への回答。書かれた順に1項目1件。なければ空配列",
    items: obj({
      question: str("入力された要望・質問（要約してよい）"),
      answer: str("結論を先に。この敷地と計画で何が言えるか、できること・できないこと・条件、次に何を確かめるか。200字以内"),
      certainty: certaintyProp,
      evidence: evidenceArr,
    }),
  },
  sheet: {
    type: "object",
    additionalProperties: false,
    description:
      "社内の法令制限確認書に転記する欄。調べて分かった欄だけ入れ、分からない欄は省略する（推測では埋めない）。value は書式どおり短く：高度地区・壁面後退・建築協定は該当なしなら「無」、壁面後退は「1m」、road*Kou は42条の項（1／2）、road*Gou は号（1〜5）、road*Width は数値の文字列（m）、road*Owner は 国道／県道／市道、water は 引込有／引込無／要確認、sewage は 下水道／集中浄化槽／個別浄化槽。",
    properties: Object.fromEntries(
      SHEET_KEYS.map((k) => [k, { type: "object", additionalProperties: false, properties: { value: str("欄に書く値"), certainty: certaintyProp, source: str("根拠の短い名前（例：あま市 都市計画図、道路台帳、添付の重要事項説明書）") }, required: ["value", "certainty", "source"] }]),
    ),
  },
});

export function evidenceMd(list: Partial<Evidence>[] | undefined): string {
  if (!list?.length) return "出典なし";
  return list.map((e) => (e.url ? `[${e.label ?? ""}](${e.url})` : (e.label ?? ""))).join("、");
}

/** Sort key for tasks: project order, then role. */
export const whenIndex = (w?: string) => {
  const i = (TASK_WHEN as readonly string[]).indexOf(w ?? "");
  return i < 0 ? TASK_WHEN.length : i;
};

export function tasksToCsv(tasks: PartialReport["tasks"], done: Record<number, boolean> = {}): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["済", "時期", "担当", "やること", "相手先"].map(cell).join(",")];
  (tasks ?? []).forEach((t, i) => rows.push([done[i] ? "済" : "", t.when, t.role, t.task, t.agency].map(cell).join(",")));
  // BOM so Excel opens the Japanese text correctly.
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

/** Markdown version for copy / print / sharing in chat tools. */
export function reportToMarkdown(r: PartialReport): string {
  const out: string[] = [];
  if (r.summary) {
    out.push(`## 結論：${r.summary.verdict ?? ""}`, r.summary.headline ?? "");
    if (r.summary.topRisks?.length) out.push("", ...r.summary.topRisks.map((t) => `- ${t}`));
    if (r.summary.schedule) out.push("", `**工程への影響**：${r.summary.schedule}`);
    if (r.summary.grade) out.push("", `**総合所見**：${r.summary.grade}（${GRADE_HELP[r.summary.grade]}）`);
    if (r.summary.costImpacts?.length) out.push("", "**費用・工期に影響しうる項目**", ...r.summary.costImpacts.map((t) => `- ${t}`));
    if (r.summary.customerPoints?.length) out.push("", "**お客様への説明ポイント**", ...r.summary.customerPoints.map((t) => `- ${t}`));
  }
  if (r.answers?.length) {
    out.push("", "## ご要望・ご質問への回答");
    for (const a of r.answers) out.push("", `**Q. ${a.question ?? ""}**［${a.certainty ?? "要確認"}］`, a.answer ?? "", `出典：${evidenceMd(a.evidence)}`);
  }
  if (r.documents?.length) {
    out.push("", "## 資料から読み取ったこと");
    for (const d of r.documents) {
      out.push(`- **${d.name ?? ""}**（${d.kind ?? ""}）`);
      for (const f of d.facts ?? []) out.push(`  - ${f}`);
      for (const c of d.concerns ?? []) out.push(`  - ⚠ ${c}`);
    }
  }
  if (r.design?.length) {
    out.push("", "## 設計で注意すること");
    for (const d of r.design) out.push(`- 【${d.priority ?? ""}・${d.certainty ?? "要確認"}】**${d.title ?? ""}** — ${d.detail ?? ""}（出典：${evidenceMd(d.evidence)}）`);
  }
  if (r.consultations?.length) {
    out.push("", "## 役所への事前協議リスト", "| 窓口 | 協議すること | 持参資料 | 時期 | 根拠 |", "|---|---|---|---|---|");
    for (const c of r.consultations) out.push(`| ${c.agency ?? ""} | ${c.purpose ?? ""}<br>${(c.items ?? []).map((i) => `・${i}`).join("<br>")} | ${c.bring ?? ""} | ${c.timing ?? ""} | ${evidenceMd(c.evidence)} |`);
  }
  if (r.procedures?.length) {
    out.push("", "## 手続きの流れ", "| # | 手続き | 確実性 | 時期 | 期間 | 提出先 | 出典 |", "|---|---|---|---|---|---|---|");
    r.procedures.forEach((p, i) => out.push(`| ${i + 1} | ${p.step ?? ""} | ${p.certainty ?? "要確認"} | ${p.timing ?? ""} | ${p.duration ?? ""} | ${p.agency ?? ""} | ${evidenceMd(p.evidence)} |`));
  }
  if (r.checklist?.length) {
    out.push("", "## 見落としチェック", "| 項目 | 判定 | 確実性 | メモ | 出典 |", "|---|---|---|---|---|");
    for (const c of r.checklist) out.push(`| ${c.item ?? ""} | ${c.status ?? ""} | ${c.certainty ?? "要確認"} | ${c.note ?? ""} | ${evidenceMd(c.evidence)} |`);
  }
  if (r.questions?.length) {
    out.push("", "## 確認したい質問");
    for (const q of r.questions) out.push(`- （${q.to ?? ""}へ）${q.question ?? ""}`);
  }
  if (r.tasks?.length) {
    out.push("", "## タスク一覧");
    for (const t of [...r.tasks].sort((a, b) => whenIndex(a.when) - whenIndex(b.when))) out.push(`- [ ] 【${t.when ?? ""}・${t.role ?? ""}】${t.task ?? ""}${t.agency ? `（${t.agency}）` : ""}`);
  }
  if (r.assumptions?.length) {
    out.push("", "## 前提・未確認");
    for (const a of r.assumptions) out.push(`- ${a}`);
  }
  out.push("", `確実性：確定＝${CERTAINTY_HELP.確定}／要確認＝${CERTAINTY_HELP.要確認}／推測＝${CERTAINTY_HELP.推測}`);
  return out.join("\n");
}

const hasSource = (ev: unknown) => Array.isArray(ev) && ev.some((e) => e && typeof e === "object" && String((e as Evidence).label ?? "").trim());

/** 確定 without any source is not 確定. */
function honest<T extends { certainty: Certainty; evidence: Evidence[] }>(x: T): T {
  return x.certainty === "確定" && !hasSource(x.evidence) ? { ...x, certainty: "要確認" } : x;
}

/** Fills absent sections with empty arrays (the tool is not strict) and validates. */
export function coerceReport(input: unknown): Report | null {
  if (!input || typeof input !== "object") return null;
  const x = { ...(input as Record<string, unknown>) };
  // Older answers had role-grouped "actions" instead of tasks.
  if (!Array.isArray(x.tasks) && Array.isArray(x.actions))
    x.tasks = (x.actions as { role?: string; items?: string[] }[]).flatMap((a) => (a.items ?? []).map((task) => ({ task, role: a.role, when: "設計着手前", agency: "" })));
  for (const k of ["checklist", "documents", "design", "consultations", "procedures", "questions", "tasks", "assumptions"]) if (!Array.isArray(x[k])) x[k] = [];
  const parsed = reportSchema.safeParse(x);
  if (!parsed.success) return null;
  const r = parsed.data;
  return { ...r, design: r.design.map(honest), procedures: r.procedures.map(honest), checklist: r.checklist.map(honest) };
}
