"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getKV } from "@/lib/redis";
import { requireAccess } from "@/lib/session";
import { isDemoToken } from "@/lib/guard/demo";
import { isProduction } from "@/lib/site";
import { checkAccount, challengeSecret, fetchFor, openToken, planFor } from "@/lib/guard/service";
import { adapterFor, type Target } from "@/lib/guard/providers";
import { runStop, verifyChallenge, type ConfirmAction } from "@/lib/guard/stop";
import { addConnection, appendLog, getConnection, removeConnection, updateConnection } from "@/lib/guard/store";

// Server Actions are public endpoints: every one re-checks access and validates input.

export type FormState = { status: "idle" | "ok" | "error"; message: string };

async function account(): Promise<{ id: string; email: string }> {
  const access = await requireAccess();
  if (!access.gated) throw new Error("Budget Guard needs access.gate = license");
  return { id: access.entitlement.id, email: access.entitlement.email };
}

const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/, "IDs may contain letters, digits, - and _");
const idList = z
  .string()
  .transform((s) => s.split(/[\s,]+/).filter(Boolean))
  .pipe(z.array(id).max(20));

const targetSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("vercel"), teamId: id, projectIds: idList.pipe(z.array(id).min(1, "Pick at least one project to pause")) }),
  z.object({ provider: z.literal("openai"), projectId: id }),
  z.object({ provider: z.literal("anthropic"), workspaceId: id, keepKeyIds: idList }),
]);

const addSchema = z.object({
  label: z.string().trim().min(1).max(60),
  token: z.string().trim().min(4).max(500),
  budgetUsd: z.coerce.number().positive().max(1_000_000),
});

export async function addConnectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const acct = await account();
  const raw = Object.fromEntries(formData);
  const base = addSchema.safeParse(raw);
  const target = targetSchema.safeParse({ ...raw, projectIds: raw.projectIds ?? "", keepKeyIds: raw.keepKeyIds ?? "" });
  if (!base.success || !target.success) {
    const issue = (base.error ?? target.error)?.issues[0];
    return { status: "error", message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" };
  }
  if (isDemoToken(base.data.token) && isProduction()) return { status: "error", message: "The demo token only works in development" };
  // Prove the token works before storing it (read-only call).
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await adapterFor(target.data as Target).fetchSpend(target.data as Target, base.data.token, monthStart, now, fetchFor(base.data.token));
  } catch (err) {
    return { status: "error", message: `Could not read usage with this token: ${err instanceof Error ? err.message : err}` };
  }
  try {
    await addConnection(getKV(), acct.id, { ...base.data, target: target.data as Target });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/app");
  return { status: "ok", message: "Connection added in test mode. Run a check to see current spend." };
}

const connId = z.string().regex(/^conn_[a-f0-9]{16}$/);

function parseId(formData: FormData): string {
  const parsed = connId.safeParse(formData.get("id"));
  if (!parsed.success) redirect("/app?msg=bad-request");
  return parsed.data;
}

export async function checkNowAction(formData: FormData): Promise<void> {
  const acct = await account();
  const cid = parseId(formData);
  await checkAccount(getKV(), acct.id, acct.email, new Date(), cid);
  redirect("/app?msg=checked");
}

export async function removeConnectionAction(formData: FormData): Promise<void> {
  const acct = await account();
  await removeConnection(getKV(), acct.id, parseId(formData));
  redirect("/app?msg=removed");
}

/** Disarming never needs confirmation. */
export async function setSafeModeAction(formData: FormData): Promise<void> {
  const acct = await account();
  const cid = parseId(formData);
  const mode = z.enum(["test", "off"]).parse(formData.get("mode"));
  await updateConnection(getKV(), acct.id, cid, { stopMode: mode });
  await appendLog(getKV(), acct.id, [{ kind: "stop-test", connectionId: cid, message: `Stop mode set to ${mode}`, at: new Date().toISOString() }]);
  redirect(`/app/c/${cid}?msg=mode-${mode}`);
}

/** Dry run of the stop action: plan it, send nothing, log what would be sent. */
export async function testStopAction(formData: FormData): Promise<void> {
  const acct = await account();
  const cid = parseId(formData);
  const conn = await getConnection(getKV(), acct.id, cid);
  if (!conn) redirect("/app?msg=not-found");
  const plan = await planFor(conn);
  const result = await runStop(plan, "test", {});
  await appendLog(getKV(), acct.id, [
    { kind: "stop-test", connectionId: cid, message: `Manual test: would send ${result.requests.length} request(s). ${plan.summary}`, at: new Date().toISOString() },
  ]);
  redirect(`/app/c/${cid}?msg=tested`);
}

/** Arm live mode or stop right now. Both need the signed challenge + typed label. */
export async function confirmAction(formData: FormData): Promise<void> {
  const acct = await account();
  const cid = parseId(formData);
  const action = z.enum(["arm-live", "stop-now"]).parse(formData.get("action")) as ConfirmAction;
  const kv = getKV();
  const conn = await getConnection(kv, acct.id, cid);
  if (!conn) redirect("/app?msg=not-found");
  const plan = await planFor(conn);
  const check = verifyChallenge(
    String(formData.get("challenge") ?? ""),
    { connectionId: cid, action, plan, label: conn.label, typed: String(formData.get("typed") ?? "") },
    challengeSecret(),
  );
  if (!check.ok) redirect(`/app/c/${cid}?msg=confirm-${check.reason}`);

  const at = new Date().toISOString();
  if (action === "arm-live") {
    await updateConnection(kv, acct.id, cid, { stopMode: "live" });
    await appendLog(kv, acct.id, [{ kind: "stop-test", connectionId: cid, message: `Stop action ARMED (live): ${plan.summary}`, at }]);
    redirect(`/app/c/${cid}?msg=armed`);
  }
  const token = openToken(conn);
  const result = await runStop(plan, "live", adapterFor(conn.target).authHeaders(token), fetchFor(token));
  await appendLog(kv, acct.id, [
    result.ok
      ? { kind: "stopped", connectionId: cid, message: `Manual stop: ${plan.summary} Undo: ${plan.undo}`, at }
      : { kind: "stop-failed", connectionId: cid, message: `Manual stop failed: ${result.requests.map((r) => r.error ?? r.status).join("; ")}`, at },
  ]);
  redirect(`/app/c/${cid}?msg=${result.ok ? "stopped" : "stop-failed"}`);
}
