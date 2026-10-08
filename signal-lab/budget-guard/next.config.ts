import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This template lives inside a larger repo; pin the root so Turbopack doesn't pick the parent lockfile.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
