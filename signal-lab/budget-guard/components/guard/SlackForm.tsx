"use client";

import { useState } from "react";
import { api, toSignIn } from "@/components/client/http";

type State = { status: "idle" | "ok" | "error"; message: string };

export function SlackForm({ allowDemo, onSaved }: { allowDemo: boolean; onSaved?: () => void }) {
  const [state, setState] = useState<State>({ status: "idle", message: "" });
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const url = String(new FormData(e.currentTarget).get("slackUrl") ?? "");
    const r = await api<{ message?: string; error?: string }>("/api/app/slack", { body: { op: "save", url } });
    setPending(false);
    if (r.status === 401) return toSignIn();
    if (r.status < 400) {
      setState({ status: "ok", message: r.data.message ?? "Saved." });
      onSaved?.();
    } else setState({ status: "error", message: r.data.error ?? "Invalid input" });
  }

  return (
    <form onSubmit={submit} className="stack">
      <label>
        Slack incoming webhook URL
        <input type="password" name="slackUrl" required autoComplete="off" placeholder={allowDemo ? 'https://hooks.slack.com/services/… (or "demo")' : "https://hooks.slack.com/services/…"} />
      </label>
      <button className="btn secondary" disabled={pending}>{pending ? "Saving…" : "Save Slack webhook"}</button>
      {state.message && <p className={state.status === "error" ? "msg err" : "msg ok"}>{state.message}</p>}
    </form>
  );
}
