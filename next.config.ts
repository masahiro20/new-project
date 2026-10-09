import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds the free-mode site as plain files for GitHub Pages
// (scripts/export-pages.sh). Static export cannot use headers(), API routes or the image optimizer.
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.PAGES_BASE_PATH ?? "/new-project";

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      basePath,
      assetPrefix: basePath,
      // Plain <a> links to static files (e.g. /llms.txt) need the prefix too.
      env: { NEXT_PUBLIC_BASE_PATH: basePath },
      trailingSlash: true,
      images: { unoptimized: true },
      poweredByHeader: false,
    }
  : {
      poweredByHeader: false,
      async headers() {
        return [
          {
            source: "/:path*",
            headers: [
              { key: "X-Content-Type-Options", value: "nosniff" },
              { key: "X-Frame-Options", value: "DENY" },
              { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
              { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            ],
          },
        ];
      },
    };

export default nextConfig;

// Makes Cloudflare bindings available to `next dev` (no-op for `next build` on Vercel).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (!staticExport) initOpenNextCloudflareForDev();
