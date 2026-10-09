import type { ProviderId } from "./providers";

// Shown next to the token field and on the stop page. Sources: docs/provider-apis.md.
export const PROVIDER_INFO: Record<ProviderId, { name: string; tokenName: string; leastPrivilege: string; stop: string; spendScope: string; stopNote?: string }> = {
  vercel: {
    name: "Vercel",
    tokenName: "Vercel access token",
    leastPrivilege:
      "Create a token scoped to this one team only (not your whole account), ideally from a Member-role user, with an expiry. Vercel tokens have no read-only option; the same token reads billing charges and pauses projects.",
    stop: "Pauses the selected projects (POST /v1/projects/{id}/pause). Undo with unpause.",
    // Atlas R3-06: we sum the whole team's billed charges (all projects, all categories) — say so.
    spendScope:
      "Spend counted: every billed charge of the whole Vercel team this month (all projects and all charge categories), not only the projects this stop pauses. It can be higher than the usage of those projects.",
  },
  openai: {
    name: "OpenAI",
    tokenName: "OpenAI Admin key",
    leastPrivilege:
      "Admin keys have no scopes and are org-wide, so create a dedicated one for Budget Guard and revoke it if you stop using us. A normal project API key cannot read costs.",
    stop: "Sets a hard monthly spend limit on the project equal to your budget. Undo by deleting the limit.",
    spendScope: "Spend counted: the organization's costs for this project this month.",
    // Atlas R3-10: not verified against the live API whether an existing limit is overwritten.
    stopNote:
      "If this project already has a spend limit, the stop may replace it with your budget, and undo deletes the limit instead of restoring the old value. Write down your current limit before you arm the stop.",
  },
  anthropic: {
    name: "Anthropic",
    tokenName: "Anthropic Admin API key (sk-ant-admin…)",
    leastPrivilege:
      "Admin keys have no scopes. Create a dedicated one; only org admins can. Budget Guard only touches API keys in the workspace you name here.",
    stop: "Sets the workspace's active API keys to inactive. Undo by setting them back to active.",
    spendScope: "Spend counted: the organization's costs for this workspace this month.",
  },
};
