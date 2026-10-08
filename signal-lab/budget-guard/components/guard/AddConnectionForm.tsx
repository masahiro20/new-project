"use client";

import { useActionState, useState } from "react";
import { addConnectionAction, type FormState } from "@/app/(product)/app/actions";
import { PROVIDER_INFO } from "@/lib/guard/info";
import type { ProviderId } from "@/lib/guard/providers";

const initial: FormState = { status: "idle", message: "" };

export function AddConnectionForm({ allowDemo }: { allowDemo: boolean }) {
  const [state, action, pending] = useActionState(addConnectionAction, initial);
  const [provider, setProvider] = useState<ProviderId>("vercel");
  const info = PROVIDER_INFO[provider];
  return (
    <form action={action} className="card stack">
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
      <button className="btn" disabled={pending}>{pending ? "Checking token…" : "Add connection"}</button>
      {state.message && <p className={state.status === "error" ? "msg err" : "msg"}>{state.message}</p>}
    </form>
  );
}
