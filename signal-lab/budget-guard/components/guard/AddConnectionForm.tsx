"use client";

import { useState } from "react";
import { api, toSignIn } from "@/components/client/http";
import { ConsentCheckbox, type ConsentLabels } from "@/components/ConsentCheckbox";
import { PROVIDER_INFO } from "@/lib/guard/info";
import type { ProviderId } from "@/lib/guard/providers";

type State = { status: "idle" | "ok" | "error"; message: string };

export function AddConnectionForm({ allowDemo, onAdded, consent, blocked }: { allowDemo: boolean; onAdded?: () => void; consent: ConsentLabels; blocked?: boolean }) {
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<State>({ status: "idle", message: "" });
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("vercel");
  const info = PROVIDER_INFO[provider];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    const r = await api<{ message?: string; error?: string }>("/api/app/connections", { body: { ...Object.fromEntries(new FormData(form)), consent: agreed } });
    setPending(false);
    if (r.status === 401) return toSignIn();
    if (r.status < 400) {
      form.reset();
      setAgreed(false);
      setState({ status: "ok", message: r.data.message ?? "Added." });
      onAdded?.();
    } else {
      setState({ status: "error", message: r.data.error ?? "Invalid input" });
    }
  }

  return (
    <form onSubmit={submit} className="card stack">
      <label>
        Provider
        <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          <option value="vercel">Vercel</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label>
        Label <input type="text" name="label" required maxLength={60} placeholder={`${info.name} production`} />
      </label>
      <label>
        Monthly budget (USD) <input type="number" name="budgetUsd" required min="1" step="0.01" placeholder="100" />
      </label>
      {provider === "vercel" && (
        <>
          <label>Team ID <input type="text" name="teamId" required placeholder="team_…" /></label>
          <label>Project IDs to pause at 100% (comma separated) <input type="text" name="projectIds" required placeholder="prj_…, prj_…" /></label>
        </>
      )}
      {provider === "openai" && <label>Project ID <input type="text" name="projectId" required placeholder="proj_…" /></label>}
      {provider === "anthropic" && (
        <>
          <label>Workspace ID (not the Default workspace) <input type="text" name="workspaceId" required placeholder="wrkspc_…" /></label>
          <label>API key IDs to keep active (optional) <input type="text" name="keepKeyIds" placeholder="apikey_…" /></label>
        </>
      )}
      <label>
        {info.tokenName} <input type="password" name="token" required autoComplete="off" placeholder={allowDemo ? 'Type "demo" to try offline' : ""} />
      </label>
      <p className="hint">{info.leastPrivilege}</p>
      <p className="hint">{info.spendScope}</p>
      <ConsentCheckbox labels={consent} checked={agreed} onChange={setAgreed} />
      <button className="btn" disabled={pending || !agreed || blocked}>{pending ? "Checking token…" : "Add connection"}</button>
      {state.message && <p className={state.status === "error" ? "msg err" : "msg"} role={state.status === "error" ? "alert" : undefined}>{state.message}</p>}
    </form>
  );
}
