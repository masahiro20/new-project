"use client";

import { useActionState } from "react";
import { saveSlackAction, type FormState } from "@/app/(product)/app/actions";

const initial: FormState = { status: "idle", message: "" };

export function SlackForm({ allowDemo }: { allowDemo: boolean }) {
  const [state, action, pending] = useActionState(saveSlackAction, initial);
  return (
    <form action={action} className="stack">
      <label>
        Slack incoming webhook URL
        <input type="password" name="slackUrl" required autoComplete="off" placeholder={allowDemo ? 'https://hooks.slack.com/services/… (or "demo")' : "https://hooks.slack.com/services/…"} />
      </label>
      <button className="btn secondary" disabled={pending}>{pending ? "Saving…" : "Save Slack webhook"}</button>
      {state.message && <p className={state.status === "error" ? "msg err" : "msg ok"}>{state.message}</p>}
    </form>
  );
}
