import { newClientId, now, redirectAllowed } from "@/lib/oauth";
import { allow, clientIp } from "@/lib/ratelimit";

// Dynamic client registration (RFC 7591). Public clients only; nothing is stored —
// redirect URIs are checked against the allowlist again at /oauth/authorize.
export async function POST(request: Request) {
  if (!allow(`oauth-register:${clientIp(request)}`, 30, 60 * 60 * 1000)) return Response.json({ error: "slow_down" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (uris.length === 0 || !uris.every(redirectAllowed)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uri must be a Claude callback or localhost" }, { status: 400 });
  }
  return Response.json(
    {
      client_id: newClientId(),
      client_id_issued_at: now(),
      client_name: typeof body.client_name === "string" ? body.client_name : "Claude",
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
