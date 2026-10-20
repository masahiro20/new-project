import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives in a subdirectory of a repository that has its own lockfile,
  // so pin the Turbopack root to this directory.
  turbopack: { root: path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd()) },
  // OAuth discovery documents for Claude's MCP connector live at well-known paths.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/authorization-server" },
    ];
  },
};

export default nextConfig;
