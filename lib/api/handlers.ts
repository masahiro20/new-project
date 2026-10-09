import { z } from "zod";
import { streamMock } from "../ai-mock";
import { streamDocuments } from "../claude";
import { facilitySchema } from "../form";
import { hashInput } from "../hash";
import { aiEnabled, aiMock, COMING_SOON, demoPurchase, salesEnabled } from "../launch";
import { PARTS } from "../parts";
import { createCheckout, isPaid } from "../payments";
import { payDemoCheckout } from "../payments/demo";
import { GENERATIONS_PER_PURCHASE, PURCHASE_VALID_DAYS } from "../purchase";
import { allow, clientIp, ipKey } from "../ratelimit";
import { verifyTurnstile } from "../turnstile";

// Request handlers for the paid/AI API. Shared by the Next.js route handlers (app/api/*)
// and the standalone Cloudflare Worker (worker/src/index.ts) used with the static site.

const textStream = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const generator = () => (aiMock() ? streamMock : streamDocuments);

/** Demo generations per IP per hour (default 6 = 2 sets). Raise only for a quality run (DEMO_GENERATE_PER_HOUR). */
function demoGeneratePerHour(): number {
  const n = Number(process.env.DEMO_GENERATE_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : 6;
}

/**
 * A demo purchase is free and fully scriptable (POST /api/checkout → /api/checkout/demo → /api/generate,
 * no card ever reaches the server), so it must never spend the Anthropic key. Real AI for demo
 * purchases needs an explicit opt-in: DEMO_ALLOW_REAL_AI=1 (then Turnstile and Upstash are a must).
 */
const demoAllowsRealAi = () => process.env.DEMO_ALLOW_REAL_AI === "1";

// The page sends null when Turnstile is not configured, so accept null as "no token".
const previewSchema = z.object({ input: facilitySchema, turnstileToken: z.string().max(4096).nullish() });

export async function handlePreview(request: Request): Promise<Response> {
  if (!aiEnabled()) return Response.json({ error: COMING_SOON.ai }, { status: 503 });
  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  if (!(await verifyTurnstile(parsed.data.turnstileToken ?? undefined, clientIp(request)))) {
    return Response.json({ error: "ロボットでないことの確認ができませんでした。もう一度お試しください。" }, { status: 403 });
  }
  if (!(await allow(`preview:${ipKey(request)}`, 3, 60 * 60 * 1000, { failClosed: true }))) {
    return Response.json({ error: "無料お試しは1時間に3回までです。" }, { status: 429 });
  }
  // Site-wide daily budget, so rotating addresses cannot run up unbounded free AI cost.
  if (!(await allow("preview:global", Number(process.env.PREVIEW_PER_DAY) || 300, 24 * 60 * 60 * 1000, { failClosed: true }))) {
    return Response.json({ error: "本日の無料お試しは上限に達しました。明日またお試しください。" }, { status: 429 });
  }
  return textStream(generator()("preview", parsed.data.input));
}

export async function handleCheckout(request: Request): Promise<Response> {
  if (!salesEnabled()) return Response.json({ error: COMING_SOON.paid }, { status: 503 });
  const parsed = facilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  // Each call creates a Stripe Checkout Session; cap it so a script can't burn the account's API rate limit.
  if (!(await allow(`checkout:${ipKey(request)}`, 20, 60 * 60 * 1000))) {
    return Response.json({ error: "短時間に操作が多すぎます。時間をおいて再度お試しください。" }, { status: 429 });
  }
  try {
    return Response.json({ url: await createCheckout(hashInput(parsed.data)) });
  } catch (error) {
    console.error("checkout failed", error);
    return Response.json({ error: "決済ページを開けませんでした。" }, { status: 502 });
  }
}

// The card was validated in the browser and is never sent here: the demo only flips
// the signed token to "paid". Refused unless demo mode.
const demoPaySchema = z.object({ token: z.string().max(1000) });

export async function handleDemoPay(request: Request): Promise<Response> {
  if (!demoPurchase()) return Response.json({ error: "デモ決済は無効です。" }, { status: 404 });
  const parsed = demoPaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  const paid = await payDemoCheckout(parsed.data.token).catch((error) => {
    console.error("demo checkout failed", error);
    return null;
  });
  if (!paid) {
    return Response.json({ error: "このデモ決済は見つからないか、有効期限（1時間）が切れました。最初からやり直してください。" }, { status: 400 });
  }
  return Response.json({ url: `/generate/?session_id=${paid}` });
}

const generateSchema = z.object({ sessionId: z.string().max(200), part: z.enum(PARTS), input: facilitySchema });

export async function handleGenerate(request: Request): Promise<Response> {
  if (!salesEnabled()) return Response.json({ error: COMING_SOON.paid }, { status: 503 });
  if (!aiEnabled()) return Response.json({ error: COMING_SOON.ai }, { status: 503 });
  const parsed = generateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  const { sessionId, part, input } = parsed.data;

  const paid = await isPaid(sessionId, hashInput(input)).catch((error) => {
    console.error("payment check failed", error);
    return false;
  });
  if (!paid) {
    return Response.json({ error: "お支払いを確認できませんでした。購入時と同じ入力内容でお試しください。" }, { status: 402 });
  }
  const demo = demoPurchase();
  const realAi = !aiMock() && (!demo || demoAllowsRealAi());
  // Demo purchases cost nothing to make, so cap them per IP as well (each purchase runs 3 sets).
  if (demo && !(await allow(`demo-generate:${ipKey(request)}`, demoGeneratePerHour(), 60 * 60 * 1000, { failClosed: realAi }))) {
    return Response.json({ error: "デモの作成は1時間に2セットまでです。" }, { status: 429 });
  }
  // One purchase may generate at most GENERATIONS_PER_PURCHASE times in total (d30), so a single
  // payment can't run up unbounded API cost. Counted per session across all sets; with real AI the
  // count must be shared (Upstash), so a missing store refuses rather than allowing per-instance counts.
  if (!(await allow(`generate:${sessionId}`, GENERATIONS_PER_PURCHASE, PURCHASE_VALID_DAYS * 24 * 60 * 60 * 1000, { failClosed: realAi }))) {
    return Response.json(
      { error: `この購入で作成できる回数（合計${GENERATIONS_PER_PURCHASE}回）の上限に達しました。お問い合わせください。` },
      { status: 429 },
    );
  }
  return textStream((realAi ? streamDocuments : streamMock)(part, input));
}
