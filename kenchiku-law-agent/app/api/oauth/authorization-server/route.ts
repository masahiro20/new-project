import { authServerMetadata, origin } from "@/lib/oauth";

// Served at /.well-known/oauth-authorization-server (see next.config.ts rewrites).
export function GET(request: Request) {
  return Response.json(authServerMetadata(origin(request)), { headers: { "Access-Control-Allow-Origin": "*" } });
}
