import { z } from "zod";
import { streamDocuments } from "@/lib/claude";
import { facilitySchema } from "@/lib/form";
import { hashInput } from "@/lib/hash";
import { PARTS } from "@/lib/parts";
import { isPaidFor, paymentDisabled } from "@/lib/stripe";

export const maxDuration = 300;

const bodySchema = z.object({
  sessionId: z.string().max(200),
  part: z.enum(PARTS),
  input: facilitySchema,
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  const { sessionId, part, input } = parsed.data;

  if (!paymentDisabled()) {
    const paid = await isPaidFor(sessionId, hashInput(input)).catch((error) => {
      console.error("payment check failed", error);
      return false;
    });
    if (!paid) {
      return Response.json(
        { error: "お支払いを確認できませんでした。購入時と同じ入力内容でお試しください。" },
        { status: 402 },
      );
    }
  }

  return new Response(streamDocuments(part, input), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
