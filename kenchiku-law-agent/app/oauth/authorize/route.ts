import { hasAccess } from "@/lib/access";
import { newCode, redirectAllowed } from "@/lib/oauth";
import { allow, clientIp } from "@/lib/ratelimit";
import { SITE_NAME } from "@/lib/config";

// Sign-in page for Claude's connector: the user types the shared access key once.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(params: URLSearchParams, error?: string) {
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(params.get(k) ?? "")}">`)
    .join("");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SITE_NAME}｜Claude と接続</title>
<style>body{margin:0;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",system-ui,sans-serif;background:#f7f8f6;color:#1d262b;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:#fff;border:1px solid #dfe3df;border-radius:14px;padding:28px;max-width:420px;width:100%;box-sizing:border-box}
h1{font-size:1.2rem;margin:0 0 6px}p{color:#5d6a70;font-size:.92rem;line-height:1.7;margin:0 0 16px}
label{font-weight:700;display:block;margin-bottom:6px}input[type=password]{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1px solid #dfe3df;border-radius:8px}
button{margin-top:16px;width:100%;font:inherit;font-weight:700;padding:12px;border:0;border-radius:10px;background:#1f4e79;color:#fff;cursor:pointer}
.err{background:#fbe7e8;color:#a8232b;border-radius:8px;padding:10px 12px;font-size:.9rem;margin-bottom:12px}</style></head>
<body><form class="card" method="post" action="/oauth/authorize"><h1>${SITE_NAME} を Claude と接続</h1>
<p>Claude からこのツール（土地の法令チェック）を使えるようにします。社内で共有しているアクセスキーを入れてください。接続は約30日ごとに自動で更新されます。</p>
${error ? `<div class="err">${esc(error)}</div>` : ""}
<label for="key">アクセスキー</label><input id="key" name="key" type="password" autocomplete="current-password" required autofocus>${hidden}
<button type="submit">接続する</button></form></body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}

function check(params: URLSearchParams): string | null {
  if (params.get("response_type") && params.get("response_type") !== "code") return "response_type は code のみです。";
  if (!redirectAllowed(params.get("redirect_uri") ?? "")) return "接続元（redirect_uri）が許可されていません。";
  if (!params.get("code_challenge") || (params.get("code_challenge_method") ?? "S256") !== "S256") return "PKCE（S256）が必要です。";
  return null;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const bad = check(params);
  if (bad) return new Response(bad, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return page(params);
}

export async function POST(request: Request) {
  if (!allow(`oauth-login:${clientIp(request)}`, 20, 15 * 60 * 1000)) return new Response("試行回数が多すぎます。しばらくしてからお試しください。", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const params = new URLSearchParams(await request.text());
  const bad = check(params);
  if (bad) return new Response(bad, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const probe = new Request(request.url, { headers: { "x-access-key": params.get("key") ?? "" } });
  if (!hasAccess(probe)) return page(params, "アクセスキーが違います。");
  const code = newCode(params.get("client_id") ?? "", params.get("redirect_uri")!, params.get("code_challenge")!);
  const to = new URL(params.get("redirect_uri")!);
  to.searchParams.set("code", code);
  if (params.get("state")) to.searchParams.set("state", params.get("state")!);
  return Response.redirect(to.toString(), 302);
}
