import type { Metadata } from "next";
import { DemoCheckoutView } from "@/components/client/DemoCheckoutView";
import { DemoBanner } from "@/components/DemoBanner";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "デモ決済 / Demo checkout", robots: { index: false } };

// In-app stand-in for Stripe Checkout while PAYMENTS_MODE=demo. Static shell (○);
// GET/POST /api/checkout/demo refuse everything outside demo mode.
export default function DemoCheckoutPage() {
  return (
    <section>
      <div className="wrap narrow">
        <DemoCheckoutView productName={config.name} pricingLabel={t.sections.pricing} openLabel={t.success.open} banner={<DemoBanner inline />} />
      </div>
    </section>
  );
}
