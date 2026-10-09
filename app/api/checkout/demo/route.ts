import { z } from "zod";
import { demoPurchase } from "@/lib/launch";
import { payDemoCheckout } from "@/lib/payments/demo";

// Completes a demo checkout. The card was validated in the browser and is never
// sent here: the demo only flips the signed token to "paid". Refused unless demo mode.
const bodySchema = z.object({ token: z.string().max(1000) });

export async function POST(request: Request) {
  if (!demoPurchase()) {
    return Response.json({ error: "デモ決済は無効です。" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  const paid = await payDemoCheckout(parsed.data.token).catch((error) => {
    console.error("demo checkout failed", error);
    return null;
  });
  if (!paid) {
    return Response.json({ error: "このデモ決済は見つからないか、有効期限（1時間）が切れました。最初からやり直してください。" }, { status: 400 });
  }
  return Response.json({ url: `/generate?session_id=${paid}` });
}
