import { issueTokens, pkceOk, verify } from "@/lib/oauth";
import { allow, clientIp } from "@/lib/ratelimit";

const err = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!allow(`oauth-token:${clientIp(request)}`, 120, 60 * 60 * 1000)) return err("slow_down", "too many requests", 429);
  const type = request.headers.get("content-type") ?? "";
  const form: Record<string, string> = type.includes("application/json")
    ? ((await request.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries(new URLSearchParams(await request.text()));

  if (form.grant_type === "authorization_code") {
    const code = verify(form.code ?? "", "code");
    if (!code) return err("invalid_grant", "code is invalid or expired");
    if (form.redirect_uri && form.redirect_uri !== code.ru) return err("invalid_grant", "redirect_uri mismatch");
    if (form.client_id && code.cid && form.client_id !== code.cid) return err("invalid_grant", "client_id mismatch");
    if (!pkceOk(form.code_verifier ?? "", code.cc ?? "")) return err("invalid_grant", "PKCE verification failed");
    return Response.json(issueTokens(code.cid ?? ""), { headers: { "Cache-Control": "no-store" } });
  }
  if (form.grant_type === "refresh_token") {
    const rt = verify(form.refresh_token ?? "", "rt");
    if (!rt) return err("invalid_grant", "refresh_token is invalid or expired");
    return Response.json(issueTokens(rt.cid ?? ""), { headers: { "Cache-Control": "no-store" } });
  }
  return err("unsupported_grant_type", "use authorization_code or refresh_token");
}
