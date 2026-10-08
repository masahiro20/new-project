import Link from "next/link";
import { AddConnectionForm } from "@/components/guard/AddConnectionForm";
import { getKV } from "@/lib/redis";
import { requireAccess } from "@/lib/session";
import { isProduction } from "@/lib/site";
import { PROVIDER_INFO } from "@/lib/guard/info";
import { getLog, getSnapshot, listConnections, MAX_CONNECTIONS } from "@/lib/guard/store";
import { checkNowAction } from "./actions";
import { Flash } from "./messages";

const usd = (n: number) => `$${n.toFixed(2)}`;
const MODE_LABEL = { off: "Stop: off (alerts only)", test: "Stop: test mode", live: "Stop: LIVE" } as const;

export default async function Dashboard(props: PageProps<"/app">) {
  const access = await requireAccess();
  if (!access.gated) return <p>Budget Guard requires access.gate = &quot;license&quot;.</p>;
  const { msg } = await props.searchParams;
  const kv = getKV();
  const acct = access.entitlement.id;
  const conns = await listConnections(kv, acct);
  const snaps = await Promise.all(conns.map((c) => getSnapshot(kv, acct, c.id)));
  const log = await getLog(kv, acct);
  const labels = new Map(conns.map((c) => [c.id, c.label]));

  return (
    <section>
      <h1>Budget Guard</h1>
      <p className="lead">Checked every hour. Email at 80% of budget; the stop action runs at 100% when armed. Alerts go to {access.entitlement.email}.</p>
      <Flash msg={msg} />

      <div className="grid">
        {conns.map((c, i) => {
          const s = snaps[i];
          const pct = s ? Math.round(s.ratio * 100) : 0;
          return (
            <div key={c.id} className={`card guard ${s?.level ?? "ok"}`}>
              <h3>{c.label}</h3>
              <p>{PROVIDER_INFO[c.target.provider].name} · token {c.tokenHint}</p>
              <p className="spend">{s ? `${usd(s.spendUsd)} / ${usd(c.budgetUsd)}` : `— / ${usd(c.budgetUsd)}`}</p>
              <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                <span style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <p>{s ? `${pct}% · checked ${s.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "Not checked yet"}</p>
              {s?.error && <p className="msg err">{s.error}</p>}
              <p><span className={`badge mode-${c.stopMode}`}>{MODE_LABEL[c.stopMode]}</span></p>
              <div className="actions">
                <form action={checkNowAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn secondary">Check now</button>
                </form>
                <Link className="btn secondary" href={`/app/c/${c.id}`}>Stop action…</Link>
              </div>
            </div>
          );
        })}
      </div>

      {conns.length < MAX_CONNECTIONS ? (
        <>
          <h2 style={{ marginTop: 40 }}>Add a connection ({conns.length}/{MAX_CONNECTIONS})</h2>
          <AddConnectionForm allowDemo={!isProduction()} />
        </>
      ) : (
        <p className="msg">You are using all {MAX_CONNECTIONS} connections on this plan.</p>
      )}

      <h2 style={{ marginTop: 40 }}>Activity</h2>
      {log.length === 0 ? (
        <p className="lead">Nothing yet.</p>
      ) : (
        <ul className="log">
          {log.map((e, i) => (
            <li key={i} className={`log-${e.kind}`}>
              <time>{e.at.slice(0, 16).replace("T", " ")}</time> <strong>{labels.get(e.connectionId) ?? "(removed)"}</strong> {e.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
