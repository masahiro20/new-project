import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives in a subdirectory of a repository that has its own lockfile,
  // so pin the Turbopack root to this directory.
  turbopack: { root: path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd()) },
};

export default nextConfig;
