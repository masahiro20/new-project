import { AXIS_ORDER, QUESTIONS, QUESTION_COUNT, type Axis } from "./questions";
import { GRADES, TYPE_BY_CODE, type CatType, type Grade } from "./types";

export type AxisScores = Record<Axis, number>;

export type Observation = { axis: Axis; text: string; extremity: number };

export type Report = {
  answers: string;
  axes: AxisScores;
  typeCode: string;
  type: CatType;
  sovereignty: number;
  grade: Grade;
  /** もっとも決定的な証拠 */
  evidence: Observation;
  observations: Observation[];
};

const ANSWER_RE = new RegExp(`^[0-3]{${QUESTION_COUNT}}$`);

export function isValidAnswers(value: unknown): value is string {
  return typeof value === "string" && ANSWER_RE.test(value);
}

export function cleanName(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return v || fallback;
}

export function buildReport(answers: string, catName: string): Report {
  const sum: AxisScores = { dom: 0, amae: 0, mood: 0, demand: 0 };
  const picked: Observation[] = [];

  QUESTIONS.forEach((q, i) => {
    const choice = q.choices[Number(answers[i])];
    sum[q.axis] += choice.score;
    picked.push({
      axis: q.axis,
      text: choice.obs.replaceAll("{cat}", catName),
      extremity: Math.abs(choice.score - 1.5),
    });
  });

  const perAxis = QUESTIONS.filter((q) => q.axis === "dom").length * 3;
  const axes = Object.fromEntries(
    AXIS_ORDER.map((a) => [a, Math.round((sum[a] / perAxis) * 100)]),
  ) as AxisScores;

  const typeCode = AXIS_ORDER.map((a) => (axes[a] >= 50 ? "H" : "L")).join("");
  const type = TYPE_BY_CODE.get(typeCode)!;

  const sovereignty = Math.round(axes.dom * 0.6 + axes.demand * 0.4);
  const grade = GRADES.find((g) => sovereignty >= g.min)!;

  // 極端な回答ほど「証拠」として採用する。1つの軸に偏らないよう最大2件まで
  const sorted = [...picked].sort((a, b) => b.extremity - a.extremity);
  const used: Record<Axis, number> = { dom: 0, amae: 0, mood: 0, demand: 0 };
  const observations: Observation[] = [];
  for (const o of sorted) {
    if (used[o.axis] >= 2) continue;
    used[o.axis] += 1;
    observations.push(o);
    if (observations.length === 6) break;
  }

  return {
    answers,
    axes,
    typeCode,
    type,
    sovereignty,
    grade,
    evidence: observations[0],
    observations,
  };
}

/** 調書番号。回答と名前から決まるので、同じ内容なら同じ番号になる */
export function documentNumber(answers: string, catName: string): string {
  let h = 2166136261;
  for (const ch of answers + "|" + catName) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

export type Comparison = {
  matched: number;
  title: string;
  comment: string;
  gap: number;
  leader: "a" | "b" | "even";
};

const MATCH_TEXT: Record<number, { title: string; comment: string }> = {
  4: { title: "ほぼ同一個体", comment: "二匹は驚くほど似ています。飼い主同士で、毎日のように同じ苦労を語り合えるはずです。" },
  3: { title: "近縁種", comment: "ほとんどの傾向が一致しています。お互いの「あるある」に、深くうなずけるでしょう。" },
  2: { title: "遠くない親戚", comment: "共通点も違いも半々です。話してみると、意外な発見がありそうです。" },
  1: { title: "遠い親戚", comment: "傾向は大きく異なります。それぞれの猫様の個性を、存分に語り合ってください。" },
  0: { title: "完全に別の生き物", comment: "ここまで違う二匹は貴重です。同じ「猫」という種であることが、研究所には不思議でなりません。" },
};

export function compare(a: Report, b: Report): Comparison {
  const matched = AXIS_ORDER.filter((x) => a.typeCode[AXIS_ORDER.indexOf(x)] === b.typeCode[AXIS_ORDER.indexOf(x)]).length;
  const gap = Math.abs(a.sovereignty - b.sovereignty);
  const leader = gap < 5 ? "even" : a.sovereignty > b.sovereignty ? "a" : "b";
  return { matched, gap, leader, ...MATCH_TEXT[matched] };
}
