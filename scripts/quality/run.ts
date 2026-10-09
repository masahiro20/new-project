// Quality run for the paid generation (有料化の判断基準①). Goes through the real API like a buyer:
// demo checkout → demo payment → generate each set, then scores every set (lib/quality.ts) and
// checks that it converts to a Word file. Writes .quality/report.md.
//
//   npm run quality                         # against http://127.0.0.1:8787 (npm run api:dev)
//   QUALITY_API=https://gensan-zero-api.<sub>.workers.dev npm run quality
//
// The Worker must run with PAYMENTS_MODE=demo (and AI_MOCK=1 for a dry run without an Anthropic key).
import { mkdirSync, writeFileSync } from "node:fs";
import { Packer } from "docx";
import { buildDocx } from "../../lib/docx-export";
import type { FacilityInput } from "../../lib/form";
import { evaluateSet, worst, type Finding, type QualityPart } from "../../lib/quality";

const API = (process.env.QUALITY_API ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const ORIGIN = process.env.QUALITY_ORIGIN ?? "http://localhost:8099";

const NOTES = `・前回決めたヒヤリハット報告は4〜8月で5件。送迎時が3件。
・利用者Aが不安定になった場面で、職員が強い口調になったことがあった。声かけの方法を見直す。
・次回の研修は12月に実施する。欠席者には資料で個別に実施する。`;

const base = (serviceType: FacilityInput["serviceType"], withNotes: boolean): FacilityInput => ({
  serviceType,
  facilityName: `品質テスト事業所（${serviceType.replace(/（.*$/, "")}）`,
  staffCount: 10,
  userCharacteristics: "知的障害のある方が中心。予定の変更に不安を感じやすい方がいる。",
  meetingDate: withNotes ? "2026年9月18日（金）17:30〜18:30" : "",
  committeeMembers: "管理者、サービス管理責任者等、支援員2名",
  meetingNotes: withNotes ? NOTES : "",
  recentIssues: "送迎時のヒヤリハットが多い。",
  useRestraint: "なし",
});

// 4 service types from the quality criterion × with / without meeting notes.
const SERVICES: FacilityInput["serviceType"][] = ["放課後等デイサービス", "児童発達支援", "生活介護", "共同生活援助（グループホーム）"];
const CASES = SERVICES.flatMap((s) => [base(s, true), base(s, false)]);
const PARTS: QualityPart[] = ["committee", "training", "restraint"];

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify(body) });
}

async function buy(input: FacilityInput): Promise<string> {
  const checkout = (await (await post("/api/checkout", input)).json()) as { url?: string; error?: string };
  const token = checkout.url && new URL(checkout.url, "http://x").searchParams.get("token");
  if (!token) throw new Error(`checkout: ${checkout.error ?? "no demo token (is PAYMENTS_MODE=demo?)"}`);
  const paid = (await (await post("/api/checkout/demo", { token })).json()) as { url?: string; error?: string };
  const session = paid.url && new URL(paid.url, "http://x").searchParams.get("session_id");
  if (!session) throw new Error(`demo pay: ${paid.error}`);
  return session;
}

type Row = { service: string; notes: boolean; part: QualityPart; seconds: number; chars: number; docxBytes: number; findings: Finding[] };

const rows: Row[] = [];
for (const input of CASES) {
  const session = await buy(input);
  for (const part of PARTS) {
    const started = Date.now();
    const res = await post("/api/generate", { sessionId: session, part, input });
    const text = await res.text();
    const seconds = (Date.now() - started) / 1000;
    const findings: Finding[] = res.ok ? evaluateSet(part, text, input) : [{ level: "fail", check: "API が応答した", detail: `${res.status} ${text.slice(0, 120)}` }];
    let docxBytes = 0;
    try {
      docxBytes = (await Packer.toBuffer(buildDocx(text))).length;
    } catch (error) {
      findings.push({ level: "fail", check: "Word に変換できる", detail: String(error) });
    }
    rows.push({ service: input.serviceType, notes: !!input.meetingNotes, part, seconds, chars: text.length, docxBytes, findings });
    console.log(`${worst(findings).padEnd(4)} ${input.serviceType} / メモ${input.meetingNotes ? "あり" : "なし"} / ${part}  ${seconds.toFixed(1)}秒 ${text.length}字`);
  }
}

const mark = { pass: "○", warn: "△", fail: "×" } as const;
const lines = [
  `# 生成の品質チェック（${new Date().toISOString().slice(0, 10)}）`,
  "",
  `API：${API}　ケース：${CASES.length}件 × ${PARTS.length}セット＝${rows.length}件`,
  `結果：○ ${rows.filter((r) => worst(r.findings) === "pass").length}　△ ${rows.filter((r) => worst(r.findings) === "warn").length}　× ${rows.filter((r) => worst(r.findings) === "fail").length}`,
  `所要時間：平均 ${(rows.reduce((a, r) => a + r.seconds, 0) / rows.length).toFixed(1)}秒、最大 ${Math.max(...rows.map((r) => r.seconds)).toFixed(1)}秒`,
  "",
  "| 判定 | サービス種別 | 会議メモ | セット | 秒 | 文字数 | Word | 指摘 |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const issues = r.findings.filter((f) => f.level !== "pass").map((f) => `${mark[f.level]}${f.check}${f.detail ? `（${f.detail}）` : ""}`).join("、") || "—";
    return `| ${mark[worst(r.findings)]} | ${r.service} | ${r.notes ? "あり" : "なし"} | ${r.part} | ${r.seconds.toFixed(1)} | ${r.chars} | ${r.docxBytes ? "○" : "×"} | ${issues.replace(/\|/g, "｜")} |`;
  }),
  "",
  "1件あたりの費用は、Anthropic Console の使用量（この実行の前後の差）で確認する。",
];
mkdirSync(".quality", { recursive: true });
writeFileSync(".quality/report.md", lines.join("\n") + "\n");
console.log("\nreport: .quality/report.md");
process.exit(rows.some((r) => worst(r.findings) === "fail") ? 1 : 0);
