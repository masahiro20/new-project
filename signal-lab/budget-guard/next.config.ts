import path from "node:path";
import type { NextConfig } from "next";
import { resolveBuildPaymentsMode } from "./lib/payments/mode";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This template lives inside a larger repo; pin the root so Turbopack doesn't pick the parent lockfile.
  turbopack: { root: path.join(__dirname) },
  // Public pages are static, so the demo banner is decided at build time (lib/payments/mode.ts).
  env: { BUDGET_GUARD_BUILD_PAYMENTS_MODE: resolveBuildPaymentsMode(process.env) },
};

export default nextConfig;
