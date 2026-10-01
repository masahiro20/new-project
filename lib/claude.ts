import Anthropic from "@anthropic-ai/sdk";
import type { FacilityInput } from "./form";
import type { Part } from "./parts";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

let client: Anthropic | null = null;

const MODEL = "claude-opus-5-5";

/**
 * Streams one document set as plain UTF-8 text. Errors and refusals are
 * written into the stream as a trailing notice, since headers are already sent.
 */
export function streamDocuments(part: Part | "preview", input: FacilityInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const isPreview = part === "preview";

  return new ReadableStream({
    async start(controller) {
      try {
        client ??= new Anthropic();
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: isPreview ? 8000 : 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: isPreview ? "low" : "medium" },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(part, input) }],
        });

        stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        const final = await stream.finalMessage();

        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n> 生成できませんでした。入力内容を見直して、もう一度お試しください。"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n> 文字数の上限に達したため、途中で終了しました。"));
        }
      } catch (error) {
        console.error("generation failed", error);
        const message =
          error instanceof Anthropic.RateLimitError
            ? "現在混み合っています。少し時間をおいて再度お試しください。"
            : "生成中にエラーが発生しました。時間をおいて再度お試しください。";
        controller.enqueue(encoder.encode(`\n\n> ${message}`));
      } finally {
        controller.close();
      }
    },
  });
}
