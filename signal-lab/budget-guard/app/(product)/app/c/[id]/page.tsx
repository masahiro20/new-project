import Link from "next/link";
import { notFound } from "next/navigation";
import { getKV } from "@/lib/redis";
import { requireAccess } from "@/lib/session";
import { PROVIDER_INFO } from "@/lib/guard/info";
import { challengeSecret, planFor } from "@/lib/guard/service";
import { issueChallenge, type StopPlan } from "@/lib/guard/stop";
import { getConnection } from "@/lib/guard/store";
import { confirmAction, removeConnectionAction, setSafeModeAction, testStopAction } from "../../actions";
import { Flash } from "../../messages";

function Confirm({ id, label, action, challenge, cta, danger }: { id: string; label: string; action: string; challenge: string; cta: string; danger?: boolean }) {
  return (
    <form action={confirmAction} className="stack">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="challenge" value={challenge} />
      <label>
        Type <code>{label}</code> to confirm
        <input type="text" name="typed" required autoComplete="off" />
      </label>
      <button className={danger ? "btn danger" : "btn"}>{cta}</button>
    </form>
  );
}

export default async function StopSettings(props: PageProps<"/app/c/[id]">) {
  const access = await requireAccess();
  if (!access.gated) notFound();
  const { id } = await props.params;
  const { msg } = await props.searchParams;
  const conn = await getConnection(getKV(), access.entitlement.id, id);
  if (!conn) notFound();
  const info = PROVIDER_INFO[conn.target.provider];

  let plan: StopPlan | null = null;
  let planError = "";
  try {
    plan = await planFor(conn);
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err);
  }
  const secret = challengeSecret();

  return (
    <section className="narrow">
      <p><Link href="/app">← Dashboard</Link></p>
      <h1>{conn.label}: stop action</h1>
      <Flash msg={msg} />
      <p className="lead">{info.stop}</p>
      <p>
        Current mode: <span className={`badge mode-${conn.stopMode}`}>{conn.stopMode.toUpperCase()}</span>
      </p>

      <h2>1. Review what will be sent</h2>
      {plan ? (
        <div className="card">
          <p>{plan.summary}</p>
          <pre className="plan">{plan.requests.map((r) => `${r.method} ${r.url}${r.body ? `\n  ${JSON.stringify(r.body)}` : ""}`).join("\n") || "(no requests)"}</pre>
          <p><strong>Undo:</strong> {plan.undo}</p>
        </div>
      ) : (
        <p className="msg err">Could not build the stop plan: {planError}</p>
      )}

      <h2>2. Test it (nothing is sent)</h2>
      <form action={testStopAction}>
        <input type="hidden" name="id" value={conn.id} />
        <button className="btn secondary" disabled={!plan}>Run in test mode</button>
      </form>

      {plan && (
        <>
          <h2>3. Arm or run it</h2>
          {conn.stopMode !== "live" ? (
            <div className="card">
              <p>Arming makes the stop above run automatically the first time spend reaches 100% of {`$${conn.budgetUsd.toFixed(2)}`} this month.</p>
              <Confirm id={conn.id} label={conn.label} action="arm-live" challenge={issueChallenge(conn.id, "arm-live", plan, secret)} cta="Arm live mode" />
            </div>
          ) : (
            <form action={setSafeModeAction}>
              <input type="hidden" name="id" value={conn.id} />
              <input type="hidden" name="mode" value="test" />
              <button className="btn secondary">Disarm (back to test mode)</button>
            </form>
          )}
          <div className="card" style={{ marginTop: 16 }}>
            <p>Run the stop right now, regardless of spend.</p>
            <Confirm id={conn.id} label={conn.label} action="stop-now" challenge={issueChallenge(conn.id, "stop-now", plan, secret)} cta="Stop now" danger />
          </div>
        </>
      )}

      <h2>Other</h2>
      <div className="actions">
        {conn.stopMode !== "off" && (
          <form action={setSafeModeAction}>
            <input type="hidden" name="id" value={conn.id} />
            <input type="hidden" name="mode" value="off" />
            <button className="btn secondary">Alerts only (turn stop off)</button>
          </form>
        )}
        {conn.stopMode === "off" && (
          <form action={setSafeModeAction}>
            <input type="hidden" name="id" value={conn.id} />
            <input type="hidden" name="mode" value="test" />
            <button className="btn secondary">Turn stop back on (test mode)</button>
          </form>
        )}
        <form action={removeConnectionAction}>
          <input type="hidden" name="id" value={conn.id} />
          <button className="btn danger">Delete connection and token</button>
        </form>
      </div>
      <p className="hint">{info.leastPrivilege}</p>
    </section>
  );
}
