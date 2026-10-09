import { TEMPLATE_NOTICE as NOTICE, type TemplateContext } from "./context";

// 無料テンプレート：委員会セット（年間実施計画表・議事次第・議事録の様式）。
// lib/samples.ts の committee を元にした定型文。会議の内容は作らず、議事録は空欄の様式にする。


const BLANK = "【要記入】";

type Row = { month: string; title: string; detail: string; restraintOnly?: boolean };

function committeeName(ctx: TemplateContext): string {
  return ctx.restraintRate === null ? "虐待防止委員会" : "虐待防止委員会（身体拘束適正化検討委員会と一体開催）";
}

/** 担当者欄：虐待防止担当者の役職。空なら【要記入】 */
function officer(ctx: TemplateContext): string {
  return ctx.officerRole.trim() || BLANK;
}

function planRows(ctx: TemplateContext): Row[] {
  const restraint = ctx.restraintRate !== null;
  const longBreak = ctx.child ? "夏休み中の活動・送迎体制とリスクの確認" : ctx.kind === "residential" ? "夜間・休日の職員体制とリスクの確認" : "繁忙期・職員が少ない時間帯の体制とリスクの確認";
  const report = restraint
    ? "虐待・不適切な対応・ヒヤリハット、身体拘束等に当たるか迷った場面の報告を集計し、委員会の資料にする"
    : ctx.kind === "consultation"
      ? "訪問・面談などで気づいた気になる事例（個人が特定されないよう配慮）を集め、委員会の資料にする"
      : "虐待・不適切な対応・ヒヤリハットの報告を集計し、委員会の資料にする";
  const family = ctx.child ? "保護者" : "利用者・家族";
  return [
    {
      month: "4月",
      title: "第1回委員会",
      detail: `前年度の振り返り、年間計画の決定、担当者・委員の確認、報告の方法の確認${restraint ? "、身体拘束等の実施状況の確認" : ""}`,
    },
    { month: "4月", title: "新規採用者の研修", detail: `4月に採用した職員に、採用時の虐待防止研修${restraint ? "・身体拘束等の適正化の研修" : ""}を実施` },
    { month: "5月", title: "結果の周知", detail: "職員会議で委員会の決定事項を報告し、議事録を掲示・回覧（確認欄に署名）" },
    { month: "6月", title: "セルフチェック", detail: "全職員で虐待防止セルフチェックリストを実施" },
    { month: "7月", title: "BCPの研修", detail: "業務継続計画（感染症・自然災害）の内容と自分の役割を全職員で確認" },
    { month: "8月", title: "報告の集計", detail: report },
    { month: "8月", title: "体制の確認", detail: longBreak },
    { month: "9月", title: "第2回委員会", detail: `報告事例の検討${restraint ? "、身体拘束等の実施状況の確認" : ""}、研修計画の確認、結果の周知方法の決定` },
    {
      month: "10月",
      title: "虐待防止研修",
      detail: `全職員対象。5類型・通報義務・不適切なケアの具体例${restraint ? "・身体拘束等の適正化" : ""}、理解度テスト`,
    },
    { month: "11月", title: "欠席者フォロー", detail: "研修欠席者への個別実施、テスト結果の確認" },
    { month: "11月", title: "BCPの訓練", detail: ctx.kind === "consultation" ? "災害時の利用者の安否確認を机上で実施" : "感染症・自然災害を想定した訓練（机上訓練または実地訓練）" },
    { month: "12月", title: "セルフチェック", detail: "2回目のセルフチェック、6月との比較" },
    { month: "1月", title: "虐待防止の指針の見直し準備", detail: "虐待防止のための指針（作成している場合）の見直し案作成" },
    {
      month: "1月",
      title: "身体拘束等適正化の指針の見直し準備",
      detail: "身体拘束等の適正化のための指針の見直し案作成",
      restraintOnly: true,
    },
    { month: "2月", title: `${family}への周知`, detail: `指針の閲覧方法・相談窓口を${family}へお知らせ` },
    { month: "2月", title: "BCPの見直し", detail: "研修・訓練で分かった課題を業務継続計画に反映" },
    { month: "3月", title: "第3回委員会", detail: "年間の振り返り、指針の見直し、次年度計画案" },
  ].filter((r: Row) => restraint || !r.restraintOnly);
}

function annualPlan(ctx: TemplateContext): string {
  const facility = ctx.fill(ctx.facilityName, "事業所名");
  const restraint = ctx.restraintRate !== null;
  const title = restraint ? "虐待防止・身体拘束等適正化 年間実施計画表" : "虐待防止 年間実施計画表";
  const staff = ctx.staffCount ? `${ctx.staffCount}名` : "【要記入：職員数】";
  const rows = planRows(ctx)
    .map((r) => `| ${r.month} | ${r.title} | ${r.detail} | ${officer(ctx)} | ${BLANK} |`)
    .join("\n");

  const lead = restraint
    ? "虐待防止委員会は、身体拘束適正化検討委員会と一体的に開催します。委員会・研修はいずれも1年に1回以上の実施が必要です。"
    : `${ctx.serviceType}は身体拘束廃止未実施減算の対象外のため、身体拘束等の適正化の委員会・指針・研修は計画に含めていません。虐待防止委員会と研修は、いずれも1年に1回以上の実施が必要です。`;

  const notes = [
    "委員会・研修の「1年に1回以上」は、「年度内」ではなく「直近1年以内」で数える自治体があります。前回の実施日から1年を空けないよう、指定権者に確認して時期を決めてください。",
    "委員会の結果は、開催後速やかに職員会議等で報告し、周知した日と方法を記録します（結果の周知は運営基準で定められた措置です）。",
    "虐待防止委員会は、管理者や虐待防止担当者（必置）が参画して開きます。構成員には、利用者やその家族、専門的な知見のある外部の第三者等も加えるよう努めます（解釈通知）。",
    `新規採用時には必ず研修を実施します（解釈通知）。年度途中の採用者の実施日：${BLANK}`,
    ...(restraint ? ["虐待防止研修の中で身体拘束等の適正化を取り扱えば、身体拘束等の適正化の研修を実施したものとみなすことができます（解釈通知）。その場合は、研修記録に扱った内容を残します。"] : []),
    `${restraint ? "身体拘束等を行った場合や" : ""}虐待が疑われる事案があった場合は、計画外でも臨時に委員会を開きます。`,
    "BCPの研修・訓練の回数は、指定権者の通知で確認してください。",
    "委員会の記録は5年間保存します（解釈通知）。",
  ];

  const gensan = [
    "| 減算 | 減算になる場合 | 減算の率 |",
    "| --- | --- | --- |",
    `| 虐待防止措置未実施減算 | ①委員会の未開催 ②研修の未実施 ③担当者の未配置 のいずれか | 所定単位数の1% |`,
    ...(restraint ? [`| 身体拘束廃止未実施減算 | 記録・委員会・指針・研修の4つのいずれかが行われていない | ${ctx.restraintRate} |`] : []),
    `| 業務継続計画未策定減算 | 感染症・自然災害の業務継続計画の未策定、または計画に従った必要な措置を講じていない | ${ctx.bcpRate} |`,
  ].join("\n");

  return `# ${title}（令和${ctx.reiwaYear}年度）

事業所名：${facility}　サービス種別：${ctx.serviceType}　職員数：${staff}
虐待防止担当者：${ctx.fill(ctx.officerRole, "役職")}【要記入：氏名】
期間：令和${ctx.reiwaYear}年4月〜令和${ctx.reiwaYear + 1}年3月

${lead}実施する月は例です。事業所の行事や勤務体制に合わせて変更してください。

| 月 | 主な取り組み | 内容 | 担当者 | 実施日・確認欄 |
| --- | --- | --- | --- | --- |
${rows}

${notes.map((n) => `- ${n}`).join("\n")}

## （参考）この計画で備える減算
${gensan}

- 虐待防止措置未実施減算${restraint ? "・身体拘束廃止未実施減算" : ""}は、基準を満たしていない状況が確認された月の翌月から、改善が認められた月まで適用されます（さかのぼりません）。
- 基準を満たしていないことが確認されたら、速やかに改善計画を指定権者に提出し、事実が生じた月から3か月後に改善状況を報告します（留意事項通知）。
- 委員会の結果を従業者に周知することは、運営基準で定められた措置の一部です（令和6年度報酬改定の概要も、減算の基準として「委員会を定期的に開催するとともに、その結果について従業者に周知徹底を図ること」を挙げています）。留意事項通知が具体的に挙げる減算の事由は委員会の未開催・研修の未実施・担当者の未配置ですが、周知も必ず行って方法と日付を記録し、扱いに迷う場合は指定権者に確認します。BCPの研修・訓練も運営基準上の義務です。いずれも運営指導で確認されるため、実施記録を残します。`;
}

type Agenda = { title: string; purpose: string; minutes: number; owner: string };

function agendaItems(ctx: TemplateContext): Agenda[] {
  const restraint = ctx.restraintRate !== null;
  const items: Agenda[] = [
    { title: "開会・前回決定事項の確認", purpose: "前回の委員会で決めたことが実行されたか、その効果を確認する", minutes: 5, owner: "委員長" },
    {
      title: "報告事例の集計（虐待・不適切な対応・ヒヤリハット）",
      purpose: "件数と多い場面を共有し、原因を見立てる。報告がない場合も支援の状況を確認する",
      minutes: 10,
      owner: officer(ctx),
    },
    {
      title: `事例検討：【要記入：検討する事例。「${ctx.person}A」など個人が特定されない書き方で】`,
      purpose: "起きた原因を考え、同じ場面を防ぐ方法と担当・期限を決める",
      minutes: 15,
      owner: "委員長",
    },
  ];
  if (restraint) {
    items.push({
      title: "身体拘束等の実施状況",
      purpose: "実施の有無、記録と3要件（切迫性・非代替性・一時性）の確認、判断に迷った場面の検討。実施がない場合も確認する（別紙チェックリスト）",
      minutes: 10,
      owner: "委員長",
    });
  } else {
    items.push({
      title: "家庭・職場・利用先の事業所などでの気になる場面",
      purpose: "訪問・面談などで気づいた行動制限・虐待の兆候と、相談・通報の流れを確認する",
      minutes: 10,
      owner: officer(ctx),
    });
  }
  items.push(
    { title: "職場環境の確認", purpose: "人員配置・休憩・業務の負担など、虐待が起こりやすい状況がないか確認する", minutes: 5, owner: "委員長" },
    { title: "研修の計画", purpose: "研修の時期・講師・内容・欠席者へのフォローを決める", minutes: 5, owner: officer(ctx) },
    {
      title: restraint ? "指針の確認・見直し" : "虐待防止の指針の確認（作成している場合）",
      purpose: "現在の体制と指針の内容が合っているか確認し、見直しの要否を決める",
      minutes: 5,
      owner: "委員長",
    },
    { title: "結果の周知方法・次回予定", purpose: "全職員への伝え方（方法・日付）と次回の日程を決める", minutes: 5, owner: "委員長" },
  );
  return items;
}

function agenda(ctx: TemplateContext): string {
  const name = committeeName(ctx);
  const items = agendaItems(ctx);
  const total = items.reduce((s, a) => s + a.minutes, 0);
  const rows = items.map((a, i) => `| ${i + 1} | ${a.title} | ${a.purpose} | ${a.minutes}分 | ${a.owner} |`).join("\n");
  const restraint = ctx.restraintRate !== null;
  const prepare = [
    "前回の議事録",
    "報告シート（ヒヤリハット・不適切な対応）の集計",
    ...(restraint ? ["身体拘束等の記録（実施した場合）", "身体拘束等の適正化のための指針", "身体拘束等適正化 委員会確認チェックリスト（議事録別紙）"] : ["虐待防止のための指針（作成している場合）"]),
    "研修計画案",
    "年間実施計画表",
  ];

  return `# ${name} 議事次第

- 日時：${ctx.fill(ctx.meetingDate, "開催日時")}
- 場所：${ctx.fill(ctx.facilityName, "事業所名")}【要記入：部屋名。オンラインの場合はその旨】
- 出席予定：${ctx.fill(ctx.committeeMembers, "委員会の構成（役職）")}
- 虐待防止担当者：${ctx.fill(ctx.officerRole, "役職")}
- 進行：委員長（【要記入：役職】）

| 順 | 議題 | 目的 | 時間 | 担当 |
| --- | --- | --- | --- | --- |
${rows}

所要時間：合計${total}分（目安）。議題は例です。その回に扱わない議題は削除し、時間を調整してください。

準備するもの：${prepare.join("、")}`;
}

function minutesForm(ctx: TemplateContext): string {
  const name = committeeName(ctx);
  const restraint = ctx.restraintRate !== null;
  const plannedDate = ctx.meetingDate.trim() ? `【要記入：実際の開催日時（予定：${ctx.meetingDate.trim()}）】` : "【要記入：年月日・開始〜終了時刻】";

  const restraintSection = restraint
    ? `
## 身体拘束等の実施状況
| 確認項目 | 記入欄 |
| --- | --- |
| 前回委員会以降の実施 | □ 実施なし　□ 実施あり（${BLANK}件） |
| 実施した場合の記録の確認（態様・時間・心身の状況・緊急やむを得ない理由） | ${BLANK} |
| 3要件（切迫性・非代替性・一時性）を組織として確認したか | ${BLANK} |
| 判断に迷った場面と検討結果 | ${BLANK} |
| 身体拘束等をしないための支援方法の検討 | ${BLANK} |

別紙「身体拘束等適正化 委員会確認チェックリスト」もあわせて保存します。
`
    : "";

  return `# ${name} 議事録

> この様式は、実際に開いた委員会の記録に使います。開いていない会議の議事録を作成してはいけません。話し合ったこと・決めたことを、事実のとおりに記入してください。

| 項目 | 内容 |
| --- | --- |
| 開催日時 | ${plannedDate} |
| 場所・開催方法 | ${BLANK}（□ 対面　□ オンライン） |
| 出席者（職種・氏名） | ${BLANK} |
| 委員長 | ${BLANK} |
| 虐待防止担当者 | ${ctx.fill(ctx.officerRole, "役職")}【要記入：氏名】 |
| 欠席者 | 【要記入：いない場合は「なし」】 |
| 記録者 | ${BLANK} |

## 議題
| No. | 議題 |
| --- | --- |
| 1 | ${BLANK} |
| 2 | ${BLANK} |
| 3 | ${BLANK} |
| 4 | ${BLANK} |
| 5 | ${BLANK} |

## 議題ごとの検討内容
| No. | 報告・検討した内容 | 出た意見 |
| --- | --- | --- |
| 1 | ${BLANK} | ${BLANK} |
| 2 | ${BLANK} | ${BLANK} |
| 3 | ${BLANK} | ${BLANK} |
| 4 | ${BLANK} | ${BLANK} |
| 5 | ${BLANK} | ${BLANK} |

## 報告事例・前回決定事項の確認
| 確認項目 | 記入欄 |
| --- | --- |
| 前回決定事項の実施状況と効果 | ${BLANK} |
| 報告事例の件数・多い場面・原因の見立て | 【要記入：報告がない場合は「0件」と書き、確認した支援の状況を記入】 |
| 職場環境の確認結果 | ${BLANK} |
${restraintSection}
## 決定事項
| No. | 決定事項 | 担当 | 期限 |
| --- | --- | --- | --- |
| 1 | ${BLANK} | ${BLANK} | ${BLANK} |
| 2 | ${BLANK} | ${BLANK} | ${BLANK} |
| 3 | ${BLANK} | ${BLANK} | ${BLANK} |

## 従業者への周知方法
| 方法 | 予定日 | 実施日 | 備考 |
| --- | --- | --- | --- |
| □ 職員会議で報告 | ${BLANK} | ${BLANK} | 報告者：${BLANK} |
| □ 議事録の掲示 | ${BLANK} | ${BLANK} | 掲示場所：${BLANK} |
| □ 回覧（確認欄に署名） | ${BLANK} | ${BLANK} | 　 |
| □ 欠席者・非常勤職員への個別説明 | ${BLANK} | ${BLANK} | 　 |

## 次回予定
- 開催予定：${BLANK}
- 主な議題：${BLANK}

| 確認欄 | 氏名 | 日付 |
| --- | --- | --- |
| 委員長 | ${BLANK} | ${BLANK} |
| 記録者 | ${BLANK} | ${BLANK} |

## 記入の手引き
- 出席者には職種と氏名を書き、管理者や虐待防止担当者が参画していることが分かるようにします（両方が参画するのが望ましい形です）。人数の下限はありません。
- 報告事例がない回も「特になし」だけにせず、「報告0件」と書いたうえで、確認した支援の状況や職場環境を記入します。
${restraint ? "- 身体拘束適正化検討委員会と一体開催しているため、身体拘束等の実施状況は「実施なし」の場合も必ず記入します。\n" : ""}- 決定事項は「気をつける」ではなく、誰が・何を・いつまでにするかを書きます。次回の委員会で実施状況を確認します。
- 結果の周知は、方法と日付を記録します。結果の周知は運営基準で定められた措置です。
- ${ctx.person === "こども" ? "こども" : "利用者"}の氏名は書かず、「${ctx.person}A」などに置き換えます。
- 議事録は委員会の記録として5年間保存します（解釈通知）。`;
}

export function committeeTemplate(ctx: TemplateContext): string {
  return [`${NOTICE}\n\n${annualPlan(ctx)}`, agenda(ctx), minutesForm(ctx)].join("\n\n---\n\n") + "\n";
}
