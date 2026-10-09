import { badRequest, guard, json, readJson } from "@/lib/api";
import { getKV } from "@/lib/redis";
import { adapterFor } from "@/lib/guard/providers";
import { connIdSchema, connOpSchema } from "@/lib/guard/schemas";
import { checkAccountDetailed, challengeSecret, fetchFor, openToken, planFor, setVercelWebhookSecret } from "@/lib/guard/service";
import { runStop, verifyChallenge } from "@/lib/guard/stop";
import { appendLog, getConnection, removeConnection, updateConnection } from "@/lib/guard/store";
import { connectionDetailView } from "@/lib/guard/views";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => json({ error: "not found", msg: "not-found" }, 404);
/** `msg` is a key of app/(product)/app/messages.tsx. */
const done = (msg: string, status = 200) => json({ ok: status < 400, msg }, status);

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
      await appendLog(kv, account.id, [{ kind: "stop-test", connectionId: conn.id, message: `Stop mode set to ${op.data.mode}`, at }]);
      return done(`mode-${op.data.mode}`);

    case "test-stop": {
      const plan = await planFor(conn);
      const result = await runStop(plan, "test", {});
      await appendLog(kv, account.id, [
        { kind: "stop-test", connectionId: conn.id, message: `Manual test: would send ${result.requests.length} request(s). ${plan.summary}`, at },
      ]);
      return done("tested");
    }

    case "confirm": {
      // Arm live / stop now: signed challenge (5 min, bound to the plan) + typed label.
      const plan = await planFor(conn);
      const check = verifyChallenge(
        op.data.challenge,
        { connectionId: conn.id, action: op.data.action, plan, label: conn.label, typed: op.data.typed },
        challengeSecret(),
      );
      if (!check.ok) return done(`confirm-${check.reason}`, 400);
      if (op.data.action === "arm-live") {
        await updateConnection(kv, account.id, conn.id, { stopMode: "live" });
        await appendLog(kv, account.id, [{ kind: "stop-test", connectionId: conn.id, message: `Stop action ARMED (live): ${plan.summary}`, at }]);
        return done("armed");
      }
      const token = openToken(conn);
      const result = await runStop(plan, "live", adapterFor(conn.target).authHeaders(token), fetchFor(token));
      await appendLog(kv, account.id, [
        result.ok
          ? { kind: "stopped", connectionId: conn.id, message: `Manual stop: ${plan.summary} Undo: ${plan.undo}`, at }
          : { kind: "stop-failed", connectionId: conn.id, message: `Manual stop failed: ${result.requests.map((x) => x.error ?? x.status).join("; ")}`, at },
      ]);
      return done(result.ok ? "stopped" : "stop-failed", result.ok ? 200 : 502);
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
