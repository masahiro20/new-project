import { facilitySchema } from "@/lib/form";
import { hashInput } from "@/lib/hash";
import { COMING_SOON, salesEnabled } from "@/lib/launch";
import { createCheckout } from "@/lib/payments";

export async function POST(request: Request) {
  if (!salesEnabled()) {
    return Response.json({ error: COMING_SOON.paid }, { status: 503 });
  }
  const parsed = facilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  try {
    return Response.json({ url: await createCheckout(hashInput(parsed.data)) });
  } catch (error) {
    console.error("checkout failed", error);
    return Response.json({ error: "決済ページを開けませんでした。" }, { status: 502 });
  }
}
