import { badRequest, guard, json, readJson } from "@/lib/api";
import { consentCurrent } from "@/lib/consent";
import { getKV } from "@/lib/redis";
import { connIdSchema, connOpSchema } from "@/lib/guard/schemas";
import { checkAccountDetailed, challengeSecret, manualStopLocked, planFor, setVercelWebhookSecret } from "@/lib/guard/service";
import { runStop, verifyChallenge } from "@/lib/guard/stop";
import { appendLog, getConnection, removeConnection, updateConnection } from "@/lib/guard/store";
import { connectionDetailView } from "@/lib/guard/views";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => json({ error: "not found", msg: "not-found" }, 404);
/** `msg` is a key of app/(product)/app/messages.tsx. */
const done = (msg: string, status = 200) => json({ ok: status < 400, msg }, status);
/** The stop plan, or null when it can't be built (provider error, demo token outside demo mode): a 502, not a 500 (Ren QA). */
const planOrNull = (conn: Parameters<typeof planFor>[0]) => planFor(conn).catch(() => null);

async function load(request: Request, ctx: Ctx, mutation: boolean) {
  const kv = getKV();
  const account = await guard(request, kv, { mutation });
  if (account instanceof Response) return account;
  const id = connIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();
  const conn = await getConnection(kv, account.id, id.data); // scoped to the caller's account
  if (!conn) return notFound();
  return { kv, account, conn };
}

/** GET: stop page data incl. the plan and freshly signed confirmation challenges. */
export async function GET(request: Request, ctx: Ctx) {
  const r = await load(request, ctx, false);
  if (r instanceof Response) return r;
  return json(await connectionDetailView(r.kv, r.account, r.conn));
}

/** DELETE: remove the connection and its sealed token. */
export async function DELETE(request: Request, ctx: Ctx) {
  const r = await load(request, ctx, true);
  if (r instanceof Response) return r;
  await removeConnection(r.kv, r.account.id, r.conn.id);
  return done("removed");
}

/** POST (JSON {op,…}): check | test-stop | mode | confirm | webhook-secret. */
export async function POST(request: Request, ctx: Ctx) {
  const r = await load(request, ctx, true);
  if (r instanceof Response) return r;
  const { kv, account, conn } = r;
  const op = connOpSchema.safeParse(await readJson(request));
  if (!op.success) return badRequest();
  const at = new Date().toISOString();

  switch (op.data.op) {
    case "check":
      if ((await checkAccountDetailed(kv, account.id, account.email, new Date(), conn.id)).busy.length) return done("busy", 409);
      return done("checked");

    case "mode": // disarming never needs confirmation
      await updateConnection(kv, account.id, conn.id, { stopMode: op.data.mode });
      await appendLog(kv, account.id, [{ kind: "info", connectionId: conn.id, message: `Stop mode set to ${op.data.mode}`, at }]); // R3-08: not a test run
      return done(`mode-${op.data.mode}`);

    case "test-stop": {
      const plan = await planOrNull(conn);
      if (!plan) return done("plan-failed", 502);
      const result = await runStop(plan, "test", {});
      await appendLog(kv, account.id, [
        { kind: "stop-test", connectionId: conn.id, message: `Manual test: would send ${result.requests.length} request(s). ${plan.summary}`, at },
      ]);
      return done("tested");
    }

    case "confirm": {
      // Going live needs consent to the current Privacy Policy / Terms (re-consent after a version bump).
      if (op.data.action === "arm-live" && !consentCurrent(account.entitlement.consent)) return done("consent-required", 403);
      // Arm live / stop now: signed challenge (5 min, bound to the plan) + typed label.
      const plan = await planOrNull(conn);
      if (!plan) return done("plan-failed", 502);
      const check = verifyChallenge(
        op.data.challenge,
        { connectionId: conn.id, action: op.data.action, plan, label: conn.label, typed: op.data.typed },
        challengeSecret(),
      );
      if (!check.ok) return done(`confirm-${check.reason}`, 400);
      if (op.data.action === "arm-live") {
        await updateConnection(kv, account.id, conn.id, { stopMode: "live" });
        await appendLog(kv, account.id, [{ kind: "info", connectionId: conn.id, message: `Stop action ARMED (live): ${plan.summary}`, at }]);
        return done("armed");
      }
      const stopped = await manualStopLocked(kv, account.id, conn, plan);
      if (stopped.status === "busy") return done("busy", 409); // a check of this connection is running: try again in a moment
      return done(stopped.ok ? "stopped" : "stop-failed", stopped.ok ? 200 : 502);
    }

    case "vercel-limit": {
      // R3-03: Vercel's own 100% alert stops only when opted in. Off is the safe side (no confirmation);
      // on is as strong as arming live: consent to the current terms + signed challenge + typed label.
      if (conn.target.provider !== "vercel") return notFound();
      if (!op.data.enabled) {
        await updateConnection(kv, account.id, conn.id, { vercelLimitStops: false });
        await appendLog(kv, account.id, [{ kind: "info", connectionId: conn.id, message: "Stop on Vercel's 100% alert: off (stops only at the Budget Guard budget)", at }]);
        return done("vercel-limit-off");
      }
      if (!consentCurrent(account.entitlement.consent)) return done("consent-required", 403);
      const plan = await planOrNull(conn);
      if (!plan) return done("plan-failed", 502);
      const check = verifyChallenge(
        op.data.challenge ?? "",
        { connectionId: conn.id, action: "vercel-limit-on", plan, label: conn.label, typed: op.data.typed ?? "" },
        challengeSecret(),
      );
      if (!check.ok) return done(`confirm-${check.reason}`, 400);
      await updateConnection(kv, account.id, conn.id, { vercelLimitStops: true });
      await appendLog(kv, account.id, [{ kind: "info", connectionId: conn.id, message: `Stop on Vercel's 100% alert: ON (when armed: ${plan.summary})`, at }]);
      return done("vercel-limit-on");
    }

    case "webhook-secret": {
      if (conn.target.provider !== "vercel") return notFound();
      const remove = op.data.remove === true;
      const secret = (op.data.secret ?? "").trim();
      if (!remove && (secret.length < 8 || secret.length > 200)) return done("hook-invalid", 400);
      await setVercelWebhookSecret(kv, account.id, conn.id, remove ? null : secret);
      return done(remove ? "hook-removed" : "hook-saved");
    }
  }
}
