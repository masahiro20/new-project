"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";

const initial: WaitlistState = { status: "idle", message: "" };

// Labels come from the server (lib/i18n) so the config/zod bundle stays out of the client.
export function WaitlistForm({ labels: t }: { labels: { email: string; submit: string; pending: string } }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);
  if (state.status === "ok") return <p className="ok">{state.message}</p>;
  return (
    <form action={action}>
      <div className="inline-form">
        <label className="hp" aria-hidden="true">
          Company <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
        <input type="email" name="email" required placeholder={t.email} aria-label={t.email} autoComplete="email" />
        <button className="btn" disabled={pending}>{pending ? t.pending : t.submit}</button>
      </div>
      {state.status === "error" && <p className="msg err" role="alert">{state.message}</p>}
    </form>
  );
}
