// 記入例の生成：無料テンプレート（lib/templates）の出力にある【要記入】を、架空の例で埋める。
// 事業所名・氏名・日付・会議の内容はすべて架空。実際の身体拘束等の事案を想定した記録は作らない（記入のポイントだけ載せる）。
// 実際には開いていない会議の議事録を作らないよう、記入例には必ず「架空の記入例」の表示を付ける（build.ts）。

import { SERVICE_EXAMPLES } from "../../lib/templates/service-examples";
import type { ServiceType, TemplateContext } from "../../lib/templates";

const NAMES = ["佐藤 美咲", "鈴木 健一", "高橋 由美", "田中 翔太", "伊藤 彩", "渡辺 大輔", "中村 恵", "小林 拓也", "加藤 真理"];

const ROLES_CHILD = ["管理者", "児童発達支援管理責任者", "児童指導員", "保育士", "児童指導員", "保育士", "児童指導員", "保育士", "児童指導員"];
const ROLES_WORK = ["管理者", "サービス管理責任者", "職業指導員", "生活支援員", "職業指導員", "生活支援員", "職業指導員", "生活支援員", "職業指導員"];
const ROLES_LIVE = ["管理者", "サービス管理責任者", "生活支援員", "世話人", "生活支援員", "世話人", "生活支援員", "世話人", "生活支援員"];
const ROLES_CONSULT = ["管理者", "相談支援専門員", "相談支援専門員", "相談支援専門員", "相談支援専門員", "相談支援専門員", "相談支援専門員", "相談支援専門員", "相談支援専門員"];
const ROLES_HOME = ["管理者", "サービス提供責任者", "ヘルパー", "ヘルパー", "ヘルパー", "ヘルパー", "ヘルパー", "ヘルパー", "ヘルパー"];
const ROLES_GENERIC = ["管理者", "サービス管理責任者", "支援員", "支援員", "支援員", "支援員", "支援員", "支援員", "支援員"];

export function rolesFor(type: ServiceType): string[] {
  switch (type) {
    case "放課後等デイサービス":
    case "児童発達支援":
      return ROLES_CHILD;
    case "就労継続支援A型":
    case "就労継続支援B型":
    case "就労移行支援":
      return ROLES_WORK;
    case "生活介護":
    case "短期入所":
    case "共同生活援助（グループホーム）":
      return ROLES_LIVE;
    case "相談支援":
      return ROLES_CONSULT;
    case "居宅介護・重度訪問介護":
      return ROLES_HOME;
    default:
      return ROLES_GENERIC;
  }
}

export function exampleFacilityName(type: ServiceType): string {
  if (type === "放課後等デイサービス" || type === "児童発達支援") return "さくらんぼ教室（架空）";
  if (type === "相談支援") return "みどり相談支援事業所（架空）";
  return "ひまわり事業所（架空）";
}

/** Everything the example writer needs, derived from the template context. */
export function exampleInputs(type: ServiceType) {
  const roles = rolesFor(type);
  return {
    serviceType: type,
    facilityName: exampleFacilityName(type),
    staffCount: 8,
    reiwaYear: 8,
    meetingDate: "2026年11月20日（金）17:30〜18:30",
    committeeMembers: `${roles[0]}（委員長）、${roles[1]}、${roles[2]}、${roles[3]}`,
    officerRole: roles[0],
  };
}

const MONTH_DAY: Record<string, string> = { "4月": "4月17日", "5月": "5月15日", "6月": "6月19日", "7月": "7月17日", "8月": "8月21日", "9月": "9月18日", "10月": "10月16日", "11月": "11月20日", "12月": "12月18日", "1月": "1月15日", "2月": "2月19日", "3月": "3月19日" };

const cleanScene = (s: string) => s.replace(/[。]+$/, "");

/** Fills 【要記入】 with example text. Documents that must stay blank (test answer sheet, restraint record forms) are left as they are. */
export function makeExample(md: string, ctx: TemplateContext): string {
  const type = ctx.serviceType;
  const roles = rolesFor(type);
  const person = ctx.person;
  const restraint = ctx.restraintRate !== null;
  const scene = cleanScene(SERVICE_EXAMPLES[type].scenes[0].scene);
  const sceneAnon = `${scene}（${person}Aの場面。個人が特定されない書き方にしている）`;
  const lines = md.split("\n");
  const out: string[] = [];
  let doc = "";
  let section = "";
  let header: string[] = [];
  let rowNo = 0;
  let inTable = false;

  const labelValue = (label: string): string | null => {
    if (label === "氏名") return ` ${NAMES[0]}`;
    if (label === "役職") return roles[0];
    if (label.startsWith("実際の開催日時")) return "2026年11月20日（金）17:30〜18:30";
    if (label === "部屋名。オンラインの場合はその旨") return "相談室";
    if (label === "いない場合は「なし」") return "なし";
    if (label.startsWith("報告がない場合は")) return "2件（いずれも軽微でけがなし）。声かけが強くなりやすい場面は、支援の切り替えの時間帯。";
    if (label === "講師の役職・氏名" || label === "役職・氏名（外部講師の場合は所属）") return `${roles[0]}　${NAMES[0]}`;
    if (label === "市町村の障害者虐待防止センター等") return "○○市 障害者虐待防止センター";
    if (label.startsWith("家庭での虐待の通告先")) return "○○市 こども家庭課／○○児童相談所";
    if (label === "年月日・時間") return "2026年12月10日（木）17:30〜18:30（60分）";
    if (label.startsWith("集合研修／オンライン")) return "集合研修";
    if (label === "その他の資料") return "（その他の資料：なし）";
    if (label.startsWith("資料と録画による個別実施")) return "資料の配布と、録画の視聴（後日個別に実施）";
    if (label === "アンケートや感想から転記") return "「自分の声かけが強くなっていないか振り返れた」「事例が身近で分かりやすかった」";
    if (label.startsWith("検討する事例")) return sceneAnon;
    if (label.startsWith("取り上げた場面")) return scene;
    if (label === "指針の読み合わせ箇所") return "「緊急やむを得ない場合の3要件」の部分を全員で読み合わせた";
    if (label === "様式名・保管場所") return "身体拘束等の記録様式（事務室の書類棚・青いファイル）";
    if (label === "掲示場所") return "事務室前の掲示板";
    if (label.startsWith("ホームページ等で公開する場合")) return "事業所のホームページ「運営情報」のページ";
    if (label === "担当者・電話番号") return `${roles[0]}　${NAMES[0]}（000-0000-0000）`;
    if (label === "保管場所") return "事務室の書類棚（紙）と共有フォルダ「虐待防止」（データ）";
    return null;
  };

  const planDate = (month: string) => `${MONTH_DAY[month] ?? "　月　日"}（予定）`;
  const minuteAgenda = [
    "前回決定事項の確認",
    "報告事例の集計・検討（ヒヤリハットなど）",
    restraint ? "身体拘束等の実施状況の確認" : "不適切な対応が起きやすい場面の確認",
    "研修計画の確認",
    "結果の周知方法と次回予定",
  ];
  const minuteContent: [string, string][] = [
    ["前回決めた「ヒヤリハット報告シート」の運用状況を確認した。提出は2件。", "「書く時間が取れない場合は、メモ書きでもよいか」との意見があり、メモ書きでも可とした。"],
    [`報告された2件を共有。${person}への声かけが強くなりやすいのは、支援の切り替えの時間帯だった。`, `「予定を事前に知らせると落ち着く」「忙しいと言葉が短くなる」との意見が出た。`],
    restraint ? ["前回委員会以降、身体拘束等の実施はなかった。判断に迷う場面の報告もなかった。", "「迷う場面は、その日のうちに報告する」ことを再確認した。"] : ["強い口調や、本人の意思を確かめない対応がないかを、全員で振り返った。", "「声かけの手順を統一したい」との意見が出た。"],
    ["12月に全職員対象の研修を実施する。講師は管理者。理解度テストも行う。", "「事例検討に今回の場面を使いたい」との意見が出た。"],
    ["委員会の結果は、職員会議での報告・掲示・回覧で全職員に周知する。次回は2027年3月。", "特になし。"],
  ];

  for (const raw of lines) {
    let line = raw;
    if (line.startsWith("# ")) {
      doc = line;
      section = "";
      inTable = false;
    } else if (line.startsWith("## ")) {
      section = line;
      inTable = false;
    }
    const skip = /理解度テスト$|やむを得ず身体拘束|ご説明書/.test(doc);
    if (skip) {
      out.push(line);
      continue;
    }

    line = line.replace(/【要記入：([^】]*)】/g, (m, label: string) => labelValue(label) ?? m);

    if (line.startsWith("|")) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      let isData = false;
      if (!inTable) {
        header = cells;
        rowNo = 0;
        inTable = true;
      } else if (!/^:?-{2,}:?$/.test(cells[0])) {
        rowNo++;
        isData = true;
      }
      if (isData) {
        let filled = line.includes("【要記入】") ? cells.map((c, i) => fillCell(c, i, cells[0], cells)) : cells;
        if (doc.includes("委員会確認チェックリスト") && header[2] === "はい") filled = markRow(filled);
        line = `| ${filled.join(" | ")} |`;
      }
    } else {
      inTable = false;
      if (line.includes("【要記入】")) line = fillLine(line);
    }
    out.push(line);
  }
  return out.join("\n");

  function markRow(cells: string[]): string[] {
    const no = Number(cells[0]);
    const out2 = [...cells];
    const notApplicable = no >= 2 && no <= 5;
    const yes = no >= 7;
    out2[2] = yes ? "○" : "　";
    out2[3] = !yes && !notApplicable ? "○" : "　";
    if (no === 1) out2[4] = "実施なし";
    if (notApplicable) out2[4] = "該当なし（実施がないため）";
    if (no === 6) out2[4] = "報告なし";
    return out2;
  }

  function fillLine(line: string): string {
    if (line.startsWith("虐待防止担当者：")) return line.replace("【要記入】", NAMES[0]);
    if (line.includes("年度途中の採用者の実施日")) return line.replace("【要記入】", "採用日当日（勤務開始前に実施）");
    if (line.startsWith("- 実施日：")) return line.replace("【要記入】", "2026年12月10日（木）");
    if (line.startsWith("- 開催予定：")) return line.replace("【要記入】", "2027年3月（第3回委員会）");
    if (line.startsWith("- 主な議題：")) return line.replace("【要記入】", "年間の振り返り、指針の見直し、次年度の計画");
    if (line.startsWith("参加者数：")) return line.replace("【要記入】", "7");
    if (line.startsWith("制定日：")) return line.replace("制定日：【要記入】", "制定日：2025年4月1日").replace("最終見直し日：【要記入】", "最終見直し日：2026年3月19日");
    if (/^- 委員会は年【要記入】回/.test(line)) return line.replace("【要記入】", "3");
    if (/^- 全職員を対象に、本指針に基づく/.test(line)) return line.replace("【要記入】", "1");
    if (line.startsWith("- 平均点：")) return line.replace("【要記入】", "8.9");
    if (line.startsWith("- 正答率が低かった問題：")) return line.replace("【要記入】", "第4問（通報先）");
    if (line.startsWith("- 次回の研修で補う内容：")) return line.replace("【要記入】", "通報先の連絡先を掲示して、全員で確認する");
    if (line.startsWith("委員会開催日：")) return line.replace(/委員会開催日：【要記入】　確認者：【要記入】/, `委員会開催日：2026年11月20日　確認者：${roles[0]} ${NAMES[0]}`);
    return line;
  }

  function fillCell(cell: string, col: number, label: string, cells: string[]): string {
    if (!cell.includes("【要記入】")) return cell;
    if (doc.includes("委員会確認チェックリスト") && cell.includes("最終見直し日")) return cell.replace("【要記入】", "2026年3月");
    const h = header[col] ?? "";
    const rep = (v: string) => cell.replace("【要記入】", v);

    // 年間実施計画表
    if (doc.includes("年間実施計画表")) return rep(planDate(cells[0]));

    // 議事録
    if (doc.includes("議事録") && !/研修/.test(doc)) {
      if (section.startsWith("## 議題") && !section.includes("検討内容")) return rep(minuteAgenda[rowNo - 1] ?? "");
      if (section.includes("検討内容")) return rep(minuteContent[rowNo - 1]?.[col - 1] ?? "");
      if (section.trim() === "## 決定事項") {
        const rows = [
          ["「ヒヤリハット報告シート」の記入例を作り、全職員に配布する", `${roles[0]}`, "12月10日"],
          ["12月の研修で、今回の場面を事例検討に使う", `${roles[1]}`, "12月20日"],
          ["議事録を掲示し、職員会議で報告する", `${roles[2]}`, "11月30日"],
        ];
        return rep(rows[rowNo - 1]?.[col - 1] ?? "");
      }
      if (section.includes("周知方法")) {
        const rows: Record<string, string[]> = {
          "□ 職員会議で報告": ["11月25日", "11月25日", `報告者：${NAMES[0]}`],
          "□ 議事録の掲示": ["11月21日", "11月21日", "掲示場所：事務室前の掲示板"],
          "□ 回覧（確認欄に署名）": ["11月21日", "11月28日", "　"],
          "□ 欠席者・非常勤職員への個別説明": ["11月28日", "12月2日", "　"],
        };
        const v = rows[label]?.[col - 1];
        return v === undefined ? cell : cell.replace(/(掲示場所：|報告者：)?【要記入】/, v.replace(/^(掲示場所：|報告者：)/, ""));
      }
      if (section.includes("次回予定") || h === "氏名" || h === "日付") {
        if (label === "委員長" || label === "記録者") return h === "氏名" ? rep(label === "委員長" ? NAMES[0] : NAMES[2]) : rep("11月20日");
      }
      switch (label) {
        case "場所・開催方法":
          return cell.replace("【要記入】", "相談室").replace("□ 対面", "■ 対面");
        case "出席者（職種・氏名）":
          return rep(`${roles[0]} ${NAMES[0]}、${roles[1]} ${NAMES[1]}、${roles[2]} ${NAMES[2]}、${roles[3]} ${NAMES[3]}`);
        case "委員長":
          return rep(`${roles[0]} ${NAMES[0]}`);
        case "記録者":
          return rep(`${roles[2]} ${NAMES[2]}`);
        case "前回決定事項の実施状況と効果":
          return rep("報告シートを導入し、2件の報告があった。気づきを共有できた。");
        case "職場環境の確認結果":
          return rep("職員配置に問題はない。忙しい時間帯は声かけの余裕がなくなりやすい。");
        case "前回委員会以降の実施":
          return cell.replace("□ 実施なし", "■ 実施なし").replace("【要記入】", "0");
        case "実施した場合の記録の確認（態様・時間・心身の状況・緊急やむを得ない理由）":
          return rep("該当なし（実施がないため）");
        case "3要件（切迫性・非代替性・一時性）を組織として確認したか":
          return rep("該当なし（実施がないため）");
        case "判断に迷った場面と検討結果":
          return rep("なし");
        case "身体拘束等をしないための支援方法の検討":
          return rep("落ち着かなくなる前ぶれと、声かけの手順を職員間で統一する。");
      }
    }

    // 研修資料のスライド
    if (doc.includes("研修資料")) {
      if (/障害者虐待防止センター/.test(label)) return rep("電話 000-0000-0000（○○市 障害福祉課）");
      if (/こども家庭課/.test(label)) return rep("電話 000-0000-0000（○○市 こども家庭課）");
      if (label.startsWith("虐待防止担当者")) return rep(`${roles[0]} ${NAMES[0]}`);
    }

    // 研修 実施記録
    if (doc.includes("実施記録")) {
      if (label === "場所") return rep("相談室");
      if (section.includes("参加者")) {
        const i = rowNo - 1;
        if (h === "氏名") return rep(NAMES[i % NAMES.length]);
        if (h === "職種") return rep(roles[i % roles.length]);
        if (h.startsWith("理解度テスト")) return rep(i === 7 ? "（後日実施）" : String([9, 8, 10, 9, 7, 9, 8][i] ?? 9));
      }
      if (section.includes("欠席者")) {
        const first = rowNo === 1;
        const v = first ? [NAMES[7], "外部の会議に出席", "資料と録画による個別実施", "12月17日", "9点", `${roles[0]} ${NAMES[0]}`][col] : "　";
        return rep(v);
      }
      if (section.includes("新規採用時")) {
        const v = [NAMES[8], roles[8], "2026年4月1日", "2026年4月1日", "採用時研修（虐待防止の3つの措置・5類型・通報義務）", `${roles[0]} ${NAMES[0]}`][col];
        return rep(v);
      }
      if (label === "講師") return rep(col === 1 ? NAMES[0] : "12月10日");
      if (label.startsWith("虐待防止担当者")) return rep(col === 1 ? NAMES[0] : "12月10日");
    }

    // 委員会確認チェックリスト
    if (doc.includes("委員会確認チェックリスト")) {
      if (section.includes("次回までの対応")) {
        const rows = [
          ["指針の見直し案を作成する", roles[0], "2027年2月"],
          ["声かけの手順書を作り、全職員で共有する", roles[1], "2027年1月"],
        ];
        return rep(rows[rowNo - 1]?.[col] ?? "");
      }
    }

    return cell;
  }
}
