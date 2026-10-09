import type { Metadata } from "next";
import { Pricing } from "@/components/landing/Pricing";
import { QueryNotice } from "@/components/client/QueryNotice";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.sections.pricing };

// Static (○): ?canceled=1 is read in the browser.
export default function PricingPage() {
  return (
    <>
      <section style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <h1>{t.sections.pricing}</h1>
          <p className="lead">{config.tagline}</p>
          <QueryNotice param="canceled" text={t.buy.canceled} />
        </div>
      </section>
      <Pricing heading={false} />
    </>
  );
}
