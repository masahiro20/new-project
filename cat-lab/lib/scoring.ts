import { getBreed, type Breed } from "./breeds.ts";
import type { HumanOpts } from "./human.ts";
import { AXIS_ORDER, COMMON, QUESTION_COUNT, type Axis, type Question } from "./questions.ts";
import { RELATIONS, type Relation } from "./relations.ts";
import { GRADES, type Grade } from "./grades.ts";

export type AxisScores = Record<Axis, number>;
export type Observation = { text: string; weight: number; breed: boolean };

export type Report = {
  answers: string;
  breed: Breed;
  axes: AxisScores;
  relation: Relation;
  /** 2番目に近い関係（「〇〇の素質もあり」用） */
  second: Relation;
  variant: number;
  catLine: string;
  humanLine: string;
  human: HumanOpts;
  sovereignty: number;
  grade: Grade;
  evidence: Observation;
  observations: Observation[];
};

const ANSWER_RE = new RegExp(`^[0-3]{${QUESTION_COUNT}}$`);

export function isValidAnswers(value: unknown): value is string {
  return typeof value === "string" && ANSWER_RE.test(value);
}

export function cleanName(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
  return v || fallback;
}

/** 共通10問のあいだに、猫種専用の2問を差し込む */
export function getQuestions(breedId: string | undefined): Question[] {
  const b = getBreed(breedId);
  return [...COMMON.slice(0, 3), b.questions[0], ...COMMON.slice(3, 7), b.questions[1], ...COMMON.slice(7)];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HAIR: HumanOpts["hair"][] = ["short", "bob", "bun", "spiky"];
const HAIR_COLOR = ["#5a3d2e", "#2e2420", "#a0603a", "#d9a95a", "#6b4a8a"];
const SHIRT = ["#7ec8e3", "#ff9ec4", "#ffd34d", "#62d2a2", "#b48cff", "#ff8c42"];
const PANTS = ["#5a6b8c", "#3b3b4f", "#8b6b4a", "#4f7a6a"];

export function buildReport(answers: string, breedId: string | undefined, catName: string): Report {
  const breed = getBreed(breedId);
  const qs = getQuestions(breed.id);
  const raw: AxisScores = { dom: 0, amae: 0, mood: 0, demand: 0 };
  const mean: AxisScores = { dom: 0, amae: 0, mood: 0, demand: 0 };
  const vari: AxisScores = { dom: 0, amae: 0, mood: 0, demand: 0 };
  const picked: Observation[] = [];

  qs.forEach((q, i) => {
    const choice = q.choices[Number(answers[i])];
    for (const a of AXIS_ORDER) {
      raw[a] += choice.d[a] ?? 0;
      const vals = q.choices.map((c) => c.d[a] ?? 0);
      const m = vals.reduce((x, y) => x + y, 0) / 4;
      mean[a] += m;
      vari[a] += vals.reduce((x, y) => x + (y - m) ** 2, 0) / 4;
    }
    const weight = Math.max(...Object.values(choice.d).map((n) => Math.abs(n ?? 0)));
    picked.push({ text: choice.obs.replaceAll("{cat}", catName), weight, breed: !!q.breed });
  });

  // ランダムに答えたときの平均・ばらつきで正規化し、猫種の傾向を少し足す
  const axes = Object.fromEntries(
    AXIS_ORDER.map((a) => {
      const z = (raw[a] - mean[a]) / Math.sqrt(vari[a] || 1);
      const v = 50 + z * 17 + (breed.bias[a] ?? 0) * 1.5;
      return [a, Math.max(3, Math.min(97, Math.round(v)))];
    }),
  ) as AxisScores;

  const ranked = RELATIONS.map((r) => ({
    r,
    dist: AXIS_ORDER.reduce((s, a, i) => s + (axes[a] - r.center[i]) ** 2, 0) + r.offset,
  })).sort((x, y) => x.dist - y.dist);
  const relation = ranked[0].r;
  const second = ranked[1].r;

  const seed = hash(answers + "|" + breed.id + "|" + catName);
  const variant = seed % 3;
  const catLine = relation.catLines[(seed >>> 3) % relation.catLines.length];
  const humanLine = relation.humanLines[(seed >>> 7) % relation.humanLines.length];
  const human: HumanOpts = {
    hair: HAIR[(seed >>> 11) % HAIR.length],
    hairColor: HAIR_COLOR[(seed >>> 13) % HAIR_COLOR.length],
    shirt: SHIRT[(seed >>> 16) % SHIRT.length],
    pants: PANTS[(seed >>> 19) % PANTS.length],
  };

  const sovereignty = Math.round(axes.dom * 0.6 + axes.demand * 0.4);
  const grade = GRADES.find((g) => sovereignty >= g.min)!;

  // 決定的証拠は猫種専用の質問から。残りは印象の強い回答順
  const breedObs = picked.filter((o) => o.breed).sort((x, y) => y.weight - x.weight);
  const evidence = breedObs[0];
  const observations = picked
    .filter((o) => o !== evidence)
    .map((o, i) => ({ o, k: o.weight * 10 + ((seed >>> i) % 7) }))
    .sort((x, y) => y.k - x.k)
    .slice(0, 4)
    .map((x) => x.o);

  return { answers, breed, axes, relation, second, variant, catLine, humanLine, human, sovereignty, grade, evidence, observations };
}

/** 調書番号。回答と名前から決まるので、同じ内容なら同じ番号になる */
export function documentNumber(answers: string, breedId: string, catName: string): string {
  return hash(answers + "|" + breedId + "|" + catName).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

export type Comparison = { matched: number; title: string; comment: string; gap: number; leader: "a" | "b" | "even" };

const MATCH_TEXT: Record<number, { title: string; comment: string }> = {
  4: { title: "ほぼ同一個体", comment: "二匹は驚くほど似ています。飼い主同士、毎日のように同じ苦労を語り合えるはずです。" },
  3: { title: "近縁種", comment: "ほとんどの傾向が一致しています。お互いの「あるある」に、深くうなずけるでしょう。" },
  2: { title: "遠くない親戚", comment: "共通点も違いも半々です。話してみると、意外な発見がありそうです。" },
  1: { title: "遠い親戚", comment: "傾向は大きく異なります。それぞれの猫様の個性を、存分に語り合ってください。" },
  0: { title: "完全に別の生き物", comment: "ここまで違う二匹は貴重です。同じ「猫」という種であることが、研究所には不思議でなりません。" },
};

export function compare(a: Report, b: Report): Comparison {
  const matched = AXIS_ORDER.filter((x) => a.axes[x] >= 50 === b.axes[x] >= 50).length;
  const gap = Math.abs(a.sovereignty - b.sovereignty);
  const leader = gap < 5 ? "even" : a.sovereignty > b.sovereignty ? "a" : "b";
  return { matched, gap, leader, ...MATCH_TEXT[matched] };
}
