import type { FacilityInput } from "./form";
import type { Part } from "./parts";
import { SAMPLES } from "./samples";

// Fixed output for end-to-end tests of the purchase → generate → Word flow without an
// Anthropic key. Only used when AI_MOCK=1 and no key is set (see aiMock() in lib/launch.ts).

const MOCK_NOTICE = "> テスト用のモック出力です（AI は使っていません）。実際の書類ではありません。";

const PREVIEW = `# 虐待防止・身体拘束等適正化 年間実施計画表（モック）

| 月 | 実施内容 | 担当者 |
|---|---|---|
| 4月 | 年間計画の確認、担当者の周知 | 【要記入：担当者】 |
| 6月 | 虐待防止研修（身体拘束等の適正化を含む） | 【要記入：担当者】 |
| 9月 | 虐待防止委員会（身体拘束等適正化委員会と一体開催） | 【要記入：担当者】 |
| 3月 | 委員会・指針の見直し、次年度の計画 | 【要記入：担当者】 |`;

export function streamMock(part: Part | "preview", input: FacilityInput): ReadableStream<Uint8Array> {
  const text = `${MOCK_NOTICE}\n\n事業所名：${input.facilityName}（${input.serviceType}）\n\n${part === "preview" ? PREVIEW : SAMPLES[part]}`;
  const encoder = new TextEncoder();
  // Stream in a few chunks so the client's streaming path is exercised too.
  const chunks = text.match(/[\s\S]{1,400}/g) ?? [];
  return new ReadableStream({
    async pull(controller) {
      const next = chunks.shift();
      if (next === undefined) return controller.close();
      controller.enqueue(encoder.encode(next));
      await new Promise((r) => setTimeout(r, 5));
    },
  });
}
