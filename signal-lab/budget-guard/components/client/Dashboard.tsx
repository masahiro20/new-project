"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flash } from "@/app/(product)/app/messages";
import { AddConnectionForm } from "@/components/guard/AddConnectionForm";
import { SlackForm } from "@/components/guard/SlackForm";
import { PROVIDER_INFO } from "@/lib/guard/info";
import type { DashboardView } from "@/lib/guard/views";
import { AppBar } from "./AppBar";
import { api, toSignIn } from "./http";

const usd = (n: number) => `$${n.toFixed(2)}`;
const MODE_LABEL = { off: "Stop: off (alerts only)", test: "Stop: test mode", live: "Stop: LIVE" } as const;

type Labels = { billing: string; signOut: string };

/** /app, rendered in the browser from GET /api/app/state (the page itself is a static shell). */
export function Dashboard({ labels, allowDemo }: { labels: Labels; allowDemo: boolean }) {
  const [view, setView] = useState<DashboardView | null>(null);
  const [msg, setMsg] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<DashboardView>("/api/app/state");
    if (r.status === 401) return toSignIn();
    if (r.status === 200) setView(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(url: string, body: unknown) {
    setBusy(true);
    const r = await api<{ msg?: string }>(url, { body });
    if (r.status === 401) return toSignIn();
    await load(); // show the message together with the fresh data
    setMsg(r.data.msg ?? (r.status < 400 ? undefined : "bad-request"));
    setBusy(false);
  }

  if (!view) return <p className="lead" data-testid="loading">Loading…</p>;
  const labelsById = new Map(view.connections.map((c) => [c.id, c.label]));
  return (
    <>
      <AppBar me={view.me} labels={labels} />
      <section>
        <h1>Budget Guard</h1>
        <p className="lead">Checked every hour. Email at 80% of budget; the stop action runs at 100% when armed. Alerts go to {view.me.email}.</p>
        <Flash msg={msg} />

        <div className="grid" data-testid="connections">
          {view.connections.map((c) => {
            const s = c.snapshot;
            const pct = s ? Math.round(s.ratio * 100) : 0;
            return (
              <div key={c.id} className={`card guard ${s?.level ?? "ok"}`} data-testid="connection">
                <h3>{c.label}</h3>
                <p>{PROVIDER_INFO[c.provider].name} · token {c.tokenHint}</p>
                <p className="spend">{s ? `${usd(s.spendUsd)} / ${usd(c.budgetUsd)}` : `— / ${usd(c.budgetUsd)}`}</p>
                <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p>{s ? `${pct}% · checked ${s.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "Not checked yet"}</p>
                {s?.error && <p className="msg err">{s.error}</p>}
                <p><span className={`badge mode-${c.stopMode}`}>{MODE_LABEL[c.stopMode]}</span></p>
                <div className="actions">
                  <button className="btn secondary" disabled={busy} onClick={() => run(`/api/app/connections/${c.id}`, { op: "check" })}>Check now</button>
                  <Link className="btn secondary" href={`/app/c?id=${c.id}`}>Stop action…</Link>
                </div>
              </div>
            );
          })}
        </div>

        {view.connections.length < view.maxConnections ? (
          <>
            <h2 style={{ marginTop: 40 }}>Add a connection ({view.connections.length}/{view.maxConnections})</h2>
            <AddConnectionForm allowDemo={allowDemo} onAdded={load} />
          </>
        ) : (
          <p className="msg">You are using all {view.maxConnections} connections on this plan.</p>
        )}

        <h2 style={{ marginTop: 40 }}>Notifications</h2>
        <div className="card stack">
          <p>Email: {view.me.email} (always on)</p>
          {view.slackHint ? (
            <>
              <p>Slack: {view.slackHint}</p>
              <div className="actions">
                <button className="btn secondary" disabled={busy} onClick={() => run("/api/app/slack", { op: "test" })}>Send test message</button>
                <button className="btn secondary" disabled={busy} onClick={() => run("/api/app/slack", { op: "remove" })}>Remove Slack</button>
              </div>
            </>
          ) : (
            <SlackForm allowDemo={allowDemo} onSaved={load} />
          )}
          <p className="hint">The webhook URL is stored encrypted and only used to post Budget Guard alerts.</p>
        </div>

        <h2 style={{ marginTop: 40 }}>Activity</h2>
        {view.log.length === 0 ? (
          <p className="lead">Nothing yet.</p>
        ) : (
          <ul className="log" data-testid="activity">
            {view.log.map((e, i) => (
              <li key={i} className={`log-${e.kind}`}>
                <time>{e.at.slice(0, 16).replace("T", " ")}</time> <strong>{labelsById.get(e.connectionId) ?? "(removed)"}</strong> {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
