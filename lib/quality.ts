// Automatic checks for generated document sets (有料化の判断基準①「品質の確認」).
// Pure and import-free so tests and the runner (scripts/quality) can load it directly.
// A finding with level "fail" means the set must not ship; "warn" means a person should look.

export type QualityPart = "preview" | "committee" | "training" | "restraint";
export type QualityLevel = "pass" | "warn" | "fail";
export type Finding = { level: QualityLevel; check: string; detail?: string };

type Input = { facilityName: string; meetingDate: string; meetingNotes: string; serviceType: string };

const REQUIRED_TERMS: Record<QualityPart, { label: string; anyOf: string[] }[]> = {
  preview: [
    { label: "年間計画", anyOf: ["年間"] },
    { label: "4月〜3月", anyOf: ["4月"] },
  ],
  committee: [
    { label: "年間計画", anyOf: ["年間"] },
    { label: "議事次第", anyOf: ["議事次第", "次第"] },
    { label: "議事録", anyOf: ["議事録"] },
    { label: "結果の周知", anyOf: ["周知"] },
  ],
  training: [
    { label: "身体的虐待", anyOf: ["身体的虐待"] },
    { label: "性的虐待", anyOf: ["性的虐待"] },
    { label: "心理的虐待", anyOf: ["心理的虐待"] },
    { label: "放棄・放置", anyOf: ["放棄", "ネグレクト"] },
    { label: "経済的虐待", anyOf: ["経済的虐待"] },
    { label: "通報義務", anyOf: ["通報"] },
    { label: "通報先（市町村）", anyOf: ["市町村"] },
    { label: "理解度テストの解答", anyOf: ["解答", "正解"] },
  ],
  restraint: [
    { label: "切迫性", anyOf: ["切迫性"] },
    { label: "非代替性", anyOf: ["非代替性"] },
    { label: "一時性", anyOf: ["一時性"] },
    { label: "指針", anyOf: ["指針"] },
    { label: "記録", anyOf: ["記録"] },
    { label: "委員会", anyOf: ["委員会"] },
    { label: "研修", anyOf: ["研修"] },
  ],
};

const MIN_DOCUMENTS: Record<QualityPart, number> = { preview: 1, committee: 3, training: 3, restraint: 3 };

/** Phrases that are known to be wrong after the 令和6年度 revision. */
const OUTDATED = [
  { pattern: /1日[0-9０-９]+単位/, why: "身体拘束廃止未実施減算は所定単位数の%で減算（1日5単位は改定前）" },
  { pattern: /経過措置(中|の期間中)/, why: "業務継続計画未策定減算の経過措置は令和7年3月31日で終了" },
];

/** Trailing notices written by lib/claude.ts when generation stopped early. */
const STOP_NOTICES = ["生成できませんでした", "文字数の上限に達したため", "現在混み合っています", "生成中にエラーが発生しました"];

function section(text: string, title: RegExp): string {
  const docs = text.split(/\n-{3,}\n/);
  return docs.find((d) => title.test(d.split("\n").find((l) => l.startsWith("# ")) ?? "")) ?? "";
}

export function evaluateSet(part: QualityPart, text: string, input: Input): Finding[] {
  const out: Finding[] = [];
  const add = (level: QualityLevel, check: string, detail?: string) => out.push({ level, check, detail });

  const tail = text.trimEnd().slice(-200);
  const stopped = STOP_NOTICES.find((n) => tail.includes(n));
  add(stopped ? "fail" : "pass", "最後まで生成された", stopped);

  const docs = (text.match(/^# /gm) ?? []).length;
  add(docs >= MIN_DOCUMENTS[part] ? "pass" : "fail", `書類の数（${MIN_DOCUMENTS[part]}点以上）`, `${docs}点`);

  const missing = REQUIRED_TERMS[part].filter((t) => !t.anyOf.some((w) => text.includes(w))).map((t) => t.label);
  add(missing.length ? "fail" : "pass", "必須の項目", missing.length ? `不足：${missing.join("、")}` : undefined);

  add(text.includes("【要記入") ? "pass" : "warn", "事業所が書く欄が【要記入】で残っている");

  if (input.facilityName.trim()) add(text.includes(input.facilityName.trim()) ? "pass" : "warn", "事業所名が入っている");

  for (const o of OUTDATED) if (o.pattern.test(text)) add("fail", "古い制度の記述", o.why);

  // Personal names: the generator must write 利用者A etc. Flag kanji names followed by an honorific.
  // 様 only counts when it is an honorific (not 様式・態様・同様…).
  const names = text
    .match(/[一-鿿]{1,4}(さん|様(?!式)|氏|くん|ちゃん)/g)
    ?.filter((n) => !/^(利用者|職員|保護者|家族|管理者|担当者|皆|お子|本人|各位)/.test(n) && !/(態様|同様|多様|仕様|模様|皆様|各様|異様|一様)$/.test(n));
  add(names?.length ? "warn" : "pass", "個人名らしき表記がない", names?.length ? names.slice(0, 5).join("、") : undefined);

  if (part === "committee") {
    const minutes = section(text, /議事録/);
    if (!minutes) add("fail", "議事録がある");
    else if (!input.meetingNotes.trim()) {
      // No notes: the minutes must be a blank form or a clearly labelled example, never a made-up meeting.
      add(/記入例|【要記入/.test(minutes) ? "pass" : "fail", "会議メモがないとき、議事録は様式か「記入例」");
    } else {
      // With notes: every date in the minutes must come from the input (catches invented meetings/dates).
      const allowed = `${input.meetingNotes}\n${input.meetingDate}`;
      const dates = [...new Set(minutes.match(/\d{1,2}月\d{1,2}日/g) ?? [])].filter((d) => !allowed.includes(d));
      add(dates.length ? "warn" : "pass", "議事録の日付が入力にあるものだけ", dates.length ? `入力にない日付：${dates.join("、")}` : undefined);
    }
  }
  return out;
}

export function worst(findings: Finding[]): QualityLevel {
  return findings.some((f) => f.level === "fail") ? "fail" : findings.some((f) => f.level === "warn") ? "warn" : "pass";
}
