import Anthropic from "@anthropic-ai/sdk";
import type { FacilityInput } from "./form";
import type { Part } from "./parts";
import { NOTICES } from "./notices";
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
          controller.enqueue(encoder.encode(`\n\n> ${NOTICES.refusal}`));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode(`\n\n> ${NOTICES.maxTokens}`));
        }
      } catch (error) {
        console.error("generation failed", error);
        const message =
          error instanceof Anthropic.RateLimitError
            ? NOTICES.rateLimited
            : NOTICES.error;
        controller.enqueue(encoder.encode(`\n\n> ${message}`));
      } finally {
        controller.close();
      }
    },
  });
}
