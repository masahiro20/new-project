import { DEMO_BANNER, showDemoBannerAtBuild } from "@/lib/payments/mode";

/**
 * 「デモ：実際の請求はありません」. Public pages are prerendered, so this is decided
 * at build time from PAYMENTS_MODE (lib/payments/mode.ts). A build made for demo
 * refuses to start checkouts if it is later run in stripe mode (and vice versa), so
 * a stale banner can never sit on top of real charges.
 */
export function DemoBanner({ inline = false }: { inline?: boolean }) {
  if (!showDemoBannerAtBuild()) return null;
  return (
    <div className={inline ? "demo-banner inline" : "demo-banner"} role="status" data-testid="demo-banner">
      <strong>{DEMO_BANNER.ja}</strong> <span lang="en">{DEMO_BANNER.en}</span>
    </div>
  );
}
