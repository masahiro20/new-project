import type { Metadata } from "next";
import { Pricing } from "@/components/landing/Pricing";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.sections.pricing };

export default async function PricingPage(props: PageProps<"/pricing">) {
  const { canceled } = await props.searchParams;
  return (
    <>
      <section style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <h1>{t.sections.pricing}</h1>
          <p className="lead">{config.tagline}</p>
          {canceled && <p className="notice">{t.buy.canceled}</p>}
        </div>
      </section>
      <Pricing heading={false} />
    </>
  );
}
