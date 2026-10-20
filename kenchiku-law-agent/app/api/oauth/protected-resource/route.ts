import { origin, protectedResourceMetadata } from "@/lib/oauth";

// Served at /.well-known/oauth-protected-resource (see next.config.ts rewrites).
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(origin(request)), { headers: { "Access-Control-Allow-Origin": "*" } });
}
