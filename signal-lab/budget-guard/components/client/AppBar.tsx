"use client";

import type { Me } from "@/lib/guard/views";
import { api } from "./http";

export function AppBar({ me, labels }: { me: Me; labels: { billing: string; signOut: string } }) {
  async function signOut() {
    await api("/api/access/signout", { body: {} });
    window.location.assign("/");
  }
  return (
    <div className="app-bar">
      <span className="hint" data-testid="plan-status">
        Plan: {me.planLabel} · {me.status}
        {me.demo && "（デモ / demo）"}
      </span>
      {me.billing && (
        <form action="/api/portal" method="post">
          <button className="linkish">{labels.billing}</button>
        </form>
      )}
      <button className="linkish" type="button" onClick={signOut}>{labels.signOut}</button>
    </div>
  );
}
