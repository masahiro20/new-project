import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { PlanCard } from "../PlanCard";

export function Pricing({ heading = true }: { heading?: boolean }) {
  return (
    <section id="pricing">
      <div className="wrap">
        {heading && <h2>{t.sections.pricing}</h2>}
        <div className="grid">
          {config.pricing.plans.map((p) => <PlanCard key={p.id} plan={p} />)}
        </div>
      </div>
    </section>
  );
}
