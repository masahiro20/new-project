"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./http";

type Info = { planLabel: string; status: string; active: boolean; last4: string | null };

/** /checkout/demo/portal (static shell): stand-in for the Stripe billing portal. */
export function DemoPortalView({ banner }: { banner: React.ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api<Info>("/api/checkout/demo/portal");
    if (r.status === 401) return window.location.replace("/access");
    if (r.status !== 200) return window.location.replace("/app");
    setInfo(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "cancel" | "reactivate") {
    setBusy(true);
    const r = await api<{ done?: string }>("/api/checkout/demo/portal", { body: { action } });
    if (r.status === 401) return window.location.replace("/access");
    setDone(r.data.done ?? null);
    await load();
    setBusy(false);
  }

  if (!info) return <p className="lead" data-testid="loading">読み込み中… / Loading…</p>;
  return (
    <>
      {banner}
      <h1>デモ請求管理 / Demo billing</h1>
      {done && <p className="msg ok">{done === "cancel" ? "デモプランを解約しました。" : "デモプランを再開しました。"}</p>}
      <div className="card stack">
        <p>プラン / Plan: <strong>{info.planLabel}</strong></p>
        <p>状態 / Status: <strong data-testid="demo-plan-status">{info.status}</strong></p>
        {info.last4 && <p>カード / Card: •••• {info.last4}（デモ）</p>}
        <button className={info.active ? "btn secondary" : "btn"} disabled={busy} onClick={() => act(info.active ? "cancel" : "reactivate")}>
          {info.active ? "解約する（デモ） / Cancel plan" : "再開する（デモ） / Reactivate"}
        </button>
      </div>
      <p style={{ marginTop: 16 }}><Link href="/app">アプリに戻る / Back to app</Link></p>
    </>
  );
}
