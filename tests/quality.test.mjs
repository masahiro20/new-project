import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { evaluateSet, worst } from "../lib/quality.ts";

// The fact-checked sample sets must pass their own quality bar.
const src = readFileSync(new URL("../lib/samples.ts", import.meta.url), "utf8");
const sample = (part) => src.match(new RegExp(`const ${part} = \`([\\s\\S]*?)\`;`))[1];
const input = { facilityName: "さくらんぼ教室（架空）", meetingDate: "", meetingNotes: "メモあり", serviceType: "放課後等デイサービス" };

test("sample sets pass (no fail)", () => {
  for (const part of ["committee", "training", "restraint"]) {
    const findings = evaluateSet(part, sample(part), input);
    assert.notEqual(worst(findings), "fail", `${part}: ${JSON.stringify(findings.filter((f) => f.level === "fail"))}`);
  }
});

test("catches truncation, outdated rates and invented minutes", () => {
  const bad = "# 年間計画\n# 議事次第\n---\n# 議事録\n開催：5月10日。出席者：山田さん\n\n> 文字数の上限に達したため、途中で終了しました。";
  const f = evaluateSet("committee", bad, { ...input, meetingNotes: "" });
  assert.equal(worst(f), "fail");
  assert.ok(f.some((x) => x.check === "最後まで生成された" && x.level === "fail"));
  assert.ok(f.some((x) => x.check.startsWith("会議メモがないとき") && x.level === "fail"));
  assert.ok(f.some((x) => x.check === "個人名らしき表記がない" && x.level === "warn"));
  assert.equal(worst(evaluateSet("restraint", "# 指針\n# 記録\n# 説明書\n切迫性 非代替性 一時性 委員会 研修 1日5単位 【要記入】", input)), "fail");
});

test("様式・態様 are not names", () => {
  const f = evaluateSet("restraint", "# 指針\n# 記録様式\n# 説明書\n切迫性 非代替性 一時性 委員会 研修 拘束の態様 報告様式 【要記入】", input);
  assert.equal(f.find((x) => x.check === "個人名らしき表記がない").level, "pass");
});
