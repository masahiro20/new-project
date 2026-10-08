import type { ProviderId } from "./providers";

// Shown next to the token field and on the stop page. Sources: docs/provider-apis.md.
export const PROVIDER_INFO: Record<ProviderId, { name: string; tokenName: string; leastPrivilege: string; stop: string }> = {
  vercel: {
    name: "Vercel",
    tokenName: "Vercel access token",
    leastPrivilege:
      "Create a token scoped to this one team only (not your whole account), ideally from a Member-role user, with an expiry. Vercel tokens have no read-only option; the same token reads billing charges and pauses projects.",
    stop: "Pauses the selected projects (POST /v1/projects/{id}/pause). Undo with unpause.",
  },
  openai: {
    name: "OpenAI",
    tokenName: "OpenAI Admin key",
    leastPrivilege:
      "Admin keys have no scopes and are org-wide, so create a dedicated one for Budget Guard and revoke it if you stop using us. A normal project API key cannot read costs.",
    stop: "Sets a hard monthly spend limit on the project equal to your budget. Undo by deleting the limit.",
  },
  anthropic: {
    name: "Anthropic",
    tokenName: "Anthropic Admin API key (sk-ant-admin…)",
    leastPrivilege:
      "Admin keys have no scopes. Create a dedicated one; only org admins can. Budget Guard only touches API keys in the workspace you name here.",
    stop: "Sets the workspace's active API keys to inactive. Undo by setting them back to active.",
  },
};
