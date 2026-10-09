// OpenNext (Cloudflare Workers) config. Used only by `npm run build:cf` / preview / deploy;
// plain `next build` (Vercel) ignores this file.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is prerendered (○) and nothing uses ISR/revalidation, so the read-only
// cache served from Workers Static Assets is enough: no R2 / KV / D1 needed on the
// free plan. Cache interception answers prerendered pages (HTML, RSC and segment
// prefetches) in OpenNext's routing layer straight from that cache, without booting
// the Next.js server — ~1 ms CPU instead of a render. See docs/deploy-cloudflare.md.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
