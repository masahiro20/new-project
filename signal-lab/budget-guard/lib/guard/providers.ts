import { redactSecrets } from "./redact";
import type { FetchLike, StopPlan } from "./stop";

// One adapter per provider. Endpoints and field paths follow docs/provider-apis.md
// (official docs, checked 2026-10-08). All three only report cost per day, so an
// hourly poll refreshes today's partial bucket.

export type ProviderId = "vercel" | "openai" | "anthropic";

export interface VercelTarget { provider: "vercel"; teamId: string; projectIds: string[] }
export interface OpenAITarget { provider: "openai"; projectId: string }
export interface AnthropicTarget { provider: "anthropic"; workspaceId: string; keepKeyIds: string[] }
export type Target = VercelTarget | OpenAITarget | AnthropicTarget;

export interface Spend { spendUsd: number; from: string; to: string }

export interface Adapter<T extends Target> {
  fetchSpend(target: T, token: string, monthStart: Date, now: Date, fetchImpl: FetchLike): Promise<Spend>;
  planStop(target: T, token: string, budgetUsd: number, fetchImpl: FetchLike): Promise<StopPlan>;
  authHeaders(token: string): Record<string, string>;
}

/** A non-2xx answer from a provider API (keeps the status so 401/403 can be told apart). */
export class ProviderHttpError extends Error {
  override name = "ProviderHttpError";
  constructor(
    readonly host: string,
    readonly status: number,
    body: string,
  ) {
    super(`${host} ${status}: ${redactSecrets(body.slice(0, 200))}`);
  }
}

/** 401 / 403: the token was revoked, expired or lost the permission we need. */
export const isAuthFailure = (err: unknown) => err instanceof ProviderHttpError && (err.status === 401 || err.status === 403);

async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetchImpl(url, { method: "GET", headers });
  if (!res.ok) throw new ProviderHttpError(new URL(url).host, res.status, await res.text());
  return res.json();
}

/** Follow `has_more` / `next_page` pagination shared by OpenAI and Anthropic. */
async function paged(fetchImpl: FetchLike, baseUrl: string, headers: Record<string, string>): Promise<any[]> {
  const pages: any[] = [];
  let page: string | undefined;
  for (let i = 0; i < 20; i++) {
    const body = await getJson(fetchImpl, page ? `${baseUrl}&page=${encodeURIComponent(page)}` : baseUrl, headers);
    pages.push(body);
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return pages;
}

const enc = encodeURIComponent;

export const vercel: Adapter<VercelTarget> = {
  authHeaders: (token) => ({ authorization: `Bearer ${token}` }),
  async fetchSpend(target, token, monthStart, now, fetchImpl) {
    const from = monthStart.toISOString();
    const to = now.toISOString();
    const url = `https://api.vercel.com/v1/billing/charges?from=${enc(from)}&to=${enc(to)}&teamId=${enc(target.teamId)}`;
    const res = await fetchImpl(url, { method: "GET", headers: { ...this.authHeaders(token), "accept-encoding": "gzip" } });
    if (!res.ok) throw new ProviderHttpError("api.vercel.com", res.status, await res.text());
    // JSONL (FOCUS format). BilledCost is documented as a number but the example shows a string.
    let spendUsd = 0;
    for (const line of (await res.text()).split("\n")) {
      if (!line.trim()) continue;
      const charge = JSON.parse(line);
      if (charge.BillingCurrency && charge.BillingCurrency !== "USD") throw new Error(`Unexpected currency ${charge.BillingCurrency}`);
      const cost = Number(charge.BilledCost);
      if (Number.isFinite(cost)) spendUsd += cost;
    }
    return { spendUsd, from, to };
  },
  async planStop(target) {
    if (target.projectIds.length === 0) throw new Error("No Vercel projects selected to pause");
    const q = `?teamId=${enc(target.teamId)}`;
    return {
      summary: `Pause ${target.projectIds.length} Vercel project(s); deployments stop serving traffic.`,
      requests: target.projectIds.map((id) => ({ method: "POST" as const, url: `https://api.vercel.com/v1/projects/${enc(id)}/pause${q}` })),
      undo: `POST https://api.vercel.com/v1/projects/{id}/unpause${q} for each project (or unpause in the dashboard).`,
    };
  },
};

export const openai: Adapter<OpenAITarget> = {
  authHeaders: (token) => ({ authorization: `Bearer ${token}` }),
  async fetchSpend(target, token, monthStart, now, fetchImpl) {
    const start = Math.floor(monthStart.getTime() / 1000);
    const end = Math.floor(now.getTime() / 1000);
    const url =
      `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}` +
      `&bucket_width=1d&limit=31&project_ids[]=${enc(target.projectId)}`;
    let spendUsd = 0;
    for (const page of await paged(fetchImpl, url, this.authHeaders(token))) {
      for (const bucket of page.data ?? []) {
        for (const r of bucket.results ?? []) {
          if (r.amount?.currency && r.amount.currency.toLowerCase() !== "usd") throw new Error(`Unexpected currency ${r.amount.currency}`);
          spendUsd += Number(r.amount?.value ?? 0);
        }
      }
    }
    return { spendUsd, from: monthStart.toISOString(), to: now.toISOString() };
  },
  async planStop(target, _token, budgetUsd) {
    const url = `https://api.openai.com/v1/organization/projects/${enc(target.projectId)}/spend_limit`;
    return {
      summary: `Set a hard monthly spend limit of $${budgetUsd.toFixed(2)} on OpenAI project ${target.projectId}; requests beyond it get 429.`,
      requests: [{ method: "POST", url, body: { threshold_amount: Math.max(1, Math.round(budgetUsd * 100)), currency: "USD", interval: "month" } }],
      undo: `DELETE ${url} (removes the limit).`,
    };
  },
};

export const anthropic: Adapter<AnthropicTarget> = {
  authHeaders: (token) => ({ "x-api-key": token, "anthropic-version": "2023-06-01" }),
  async fetchSpend(target, token, monthStart, now, fetchImpl) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const url =
      `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${enc(monthStart.toISOString())}` +
      `&ending_at=${enc(end.toISOString())}&bucket_width=1d&limit=31&group_by[]=workspace_id`;
    let cents = 0;
    for (const page of await paged(fetchImpl, url, this.authHeaders(token))) {
      for (const bucket of page.data ?? []) {
        for (const r of bucket.results ?? []) {
          if (r.workspace_id !== target.workspaceId) continue;
          if (r.currency && r.currency !== "USD") throw new Error(`Unexpected currency ${r.currency}`);
          cents += Number(r.amount ?? 0); // decimal string, in cents
        }
      }
    }
    return { spendUsd: cents / 100, from: monthStart.toISOString(), to: end.toISOString() };
  },
  async planStop(target, token, _budgetUsd, fetchImpl) {
    const ids: string[] = [];
    let after: string | undefined;
    for (let i = 0; i < 10; i++) {
      const url =
        `https://api.anthropic.com/v1/organizations/api_keys?status=active&workspace_id=${enc(target.workspaceId)}&limit=1000` +
        (after ? `&after_id=${enc(after)}` : "");
      const body = await getJson(fetchImpl, url, this.authHeaders(token));
      for (const k of body.data ?? []) if (!target.keepKeyIds.includes(k.id)) ids.push(k.id);
      if (!body.has_more) break;
      after = body.last_id;
    }
    return {
      summary: `Set ${ids.length} active API key(s) in Anthropic workspace ${target.workspaceId} to inactive.`,
      requests: ids.map((id) => ({ method: "POST" as const, url: `https://api.anthropic.com/v1/organizations/api_keys/${enc(id)}`, body: { status: "inactive" } })),
      undo: `POST the same URLs with {"status":"active"}. Key IDs: ${ids.join(", ") || "(none)"}`,
    };
  },
};

export const adapters = { vercel, openai, anthropic } as const;

export function adapterFor<T extends Target>(target: T): Adapter<T> {
  return adapters[target.provider] as unknown as Adapter<T>;
}
