// OpenNext (Cloudflare Workers) config. Used only by `npm run build:cf` / preview / deploy;
// plain `next build` (Vercel) ignores this file.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// No ISR in this app (every page is per-request because the layout calls connection()),
// so a read-only cache served from Workers Static Assets is enough. No R2/KV bucket needed
// on the free plan. See docs/deploy-cloudflare.md.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
