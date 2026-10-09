import type { Metadata } from "next";
import { DemoPortalView } from "@/components/client/DemoPortalView";
import { DemoBanner } from "@/components/DemoBanner";

export const metadata: Metadata = { title: "デモ請求管理 / Demo billing", robots: { index: false } };

// Static shell (○). Data and actions: /api/checkout/demo/portal (signed cookie, demo mode only).
export default function DemoPortalPage() {
  return (
    <section>
      <div className="wrap narrow">
        <DemoPortalView banner={<DemoBanner inline />} />
      </div>
    </section>
  );
}
