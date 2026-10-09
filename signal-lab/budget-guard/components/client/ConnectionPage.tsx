"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flash } from "@/app/(product)/app/messages";
import { PROVIDER_INFO } from "@/lib/guard/info";
import type { ConnectionDetailView } from "@/lib/guard/views";
import { AppBar } from "./AppBar";
import { api, toSignIn, useQueryParam } from "./http";

type Labels = { billing: string; signOut: string };

/** /app/c?id=conn_…: the stop-action page, rendered from GET /api/app/connections/{id}. */
export function ConnectionPage({ labels }: { labels: Labels }) {
  const id = useQueryParam("id");
  const [view, setView] = useState<ConnectionDetailView | null>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const url = id ? `/api/app/connections/${encodeURIComponent(id)}` : "";

  const load = useCallback(async () => {
    if (!url) return;
    const r = await api<ConnectionDetailView>(url);
    if (r.status === 401) return toSignIn();
    if (r.status === 200) setView(r.data);
    else setMissing(true);
  }, [url]);
  useEffect(() => {
    if (id === null) setMissing(true);
    else void load();
  }, [id, load]);

  async function op(body: Record<string, unknown>, method?: string) {
    setBusy(true);
    const r = await api<{ msg?: string }>(url, { body, method });
    if (r.status === 401) return toSignIn();
    if (method === "DELETE" && r.status < 400) return window.location.assign("/app");
    await load(); // fresh plan + fresh challenges, then the message
    setMsg(r.data.msg ?? (r.status < 400 ? undefined : "bad-request"));
    setBusy(false);
  }

  function confirm(action: "arm-live" | "stop-now" | "vercel-limit-on") {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const typed = String(new FormData(e.currentTarget).get("typed") ?? "");
      e.currentTarget.reset();
      const challenge = view?.challenges?.[action] ?? "";
      void op(action === "vercel-limit-on" ? { op: "vercel-limit", enabled: true, challenge, typed } : { op: "confirm", action, challenge, typed });
    };
  }

  if (missing) return <p className="msg err">Connection not found. <Link href="/app">← Dashboard</Link></p>;
  if (!view) return <p className="lead" data-testid="loading">Loading…</p>;
  const { connection: conn, plan, planError } = view;
  const info = PROVIDER_INFO[conn.provider];

  const Confirm = ({ action, cta, danger }: { action: "arm-live" | "stop-now" | "vercel-limit-on"; cta: string; danger?: boolean }) => (
    <form onSubmit={confirm(action)} className="stack">
      <label>
        Type <code>{conn.label}</code> to confirm
        <input type="text" name="typed" required autoComplete="off" />
      </label>
      <button className={danger ? "btn danger" : "btn"} disabled={busy}>{cta}</button>
    </form>
  );

  return (
    <>
      <AppBar me={view.me} labels={labels} />
      <section className="narrow">
        <p><Link href="/app">← Dashboard</Link></p>
        <h1>{conn.label}: stop action</h1>
        <Flash msg={msg} />
        <p className="lead">{info.stop}</p>
        {info.stopNote && <p className="msg err" data-testid="stop-note">{info.stopNote}</p>}
        <p className="hint" data-testid="spend-scope">{info.spendScope}</p>
        <p>
          Current mode: <span className={`badge mode-${conn.stopMode}`} data-testid="stop-mode">{conn.stopMode.toUpperCase()}</span>
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
        <button className="btn secondary" disabled={!plan || busy} onClick={() => op({ op: "test-stop" })}>Run in test mode</button>

        {plan && (
          <>
            <h2>3. Arm or run it</h2>
            {conn.stopMode !== "live" ? (
              <div className="card">
                <p>Arming makes the stop above run automatically the first time spend reaches 100% of {`$${conn.budgetUsd.toFixed(2)}`} this month.</p>
                {view.me.consentRequired && <p className="msg err">Accept the updated Privacy Policy and Terms on the <Link href="/app">dashboard</Link> before going live.</p>}
                <Confirm action="arm-live" cta="Arm live mode" />
              </div>
            ) : (
              <button className="btn secondary" disabled={busy} onClick={() => op({ op: "mode", mode: "test" })}>Disarm (back to test mode)</button>
            )}
            <div className="card" style={{ marginTop: 16 }}>
              <p>Run the stop right now, regardless of spend.</p>
              <Confirm action="stop-now" cta="Stop now" danger />
            </div>
          </>
        )}

        {conn.provider === "vercel" && (
          <>
            <h2>Faster detection: Vercel Spend Management webhook (optional)</h2>
            <div className="card stack">
              <p>
                In Vercel → Settings → Billing → Spend Management, set the webhook URL below and paste the secret Vercel shows. Vercel posts at
                50/75/100% of its on-demand budget; Budget Guard then re-checks your spend immediately and stops (if armed) only when your
                Budget Guard budget of {`$${conn.budgetUsd.toFixed(2)}`} is reached.
              </p>
              <pre className="plan">{conn.webhookUrl}</pre>
              <p>Status: {conn.webhookSecretSet ? "secret saved (signature checked on every request)" : "not set (the URL rejects all requests)"}</p>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const secret = String(new FormData(e.currentTarget).get("secret") ?? "");
                  e.currentTarget.reset();
                  void op({ op: "webhook-secret", secret });
                }}
              >
                <label>
                  Webhook secret <input type="password" name="secret" autoComplete="off" required minLength={8} maxLength={200} />
                </label>
                <button className="btn secondary" disabled={busy}>Save secret</button>
              </form>
              {conn.webhookSecretSet && (
                <button className="btn secondary" disabled={busy} onClick={() => op({ op: "webhook-secret", remove: true })}>Remove secret</button>
              )}
              <p className="hint">Vercel&apos;s budget counts only usage beyond the Pro monthly credit, so its percentage can differ from ours.</p>
            </div>
            <h3>Stop on Vercel&apos;s 100% alert (optional, off by default)</h3>
            <div className="card stack" data-testid="vercel-limit">
              <p>
                Status: <strong>{conn.vercelLimitStops ? "on" : "off"}</strong>. When on and the stop is armed (live), Vercel&apos;s own 100% alert runs
                the stop even if the spend we read is still below your Budget Guard budget. Vercel&apos;s budget is a separate number set in
                Vercel, so only turn this on if it is the limit you want enforced.
              </p>
              {conn.vercelLimitStops ? (
                <button className="btn secondary" disabled={busy} onClick={() => op({ op: "vercel-limit", enabled: false })}>Turn off</button>
              ) : plan ? (
                <Confirm action="vercel-limit-on" cta="Turn on" />
              ) : null}
            </div>
          </>
        )}

        <h2>Other</h2>
        <div className="actions">
          {conn.stopMode !== "off" ? (
            <button className="btn secondary" disabled={busy} onClick={() => op({ op: "mode", mode: "off" })}>Alerts only (turn stop off)</button>
          ) : (
            <button className="btn secondary" disabled={busy} onClick={() => op({ op: "mode", mode: "test" })}>Turn stop back on (test mode)</button>
          )}
          <button className="btn danger" disabled={busy} onClick={() => op({}, "DELETE")}>Delete connection and token</button>
        </div>
        <p className="hint">{info.leastPrivilege}</p>
      </section>
    </>
  );
}
