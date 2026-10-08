import { connection } from "next/server";
import { DEMO_BANNER, showDemoBanner } from "@/lib/payments/mode";

/**
 * 「デモ：実際の請求はありません」. Rendered only while PAYMENTS_MODE resolves to
 * demo. `connection()` makes the check run per request (not frozen at build), so
 * switching to Stripe can never leave a stale "no charges" banner on a page.
 */
export async function DemoBanner({ inline = false }: { inline?: boolean }) {
  await connection();
  if (!showDemoBanner()) return null;
  return (
    <div className={inline ? "demo-banner inline" : "demo-banner"} role="status" data-testid="demo-banner">
      <strong>{DEMO_BANNER.ja}</strong> <span lang="en">{DEMO_BANNER.en}</span>
    </div>
  );
}
