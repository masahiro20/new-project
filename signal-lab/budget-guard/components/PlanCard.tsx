import { config, formatAmount, type Plan } from "@/lib/config";
import { t } from "@/lib/i18n";
import { devCheckoutEnabled } from "@/lib/payments";
import { BuyButton } from "./BuyButton";
import { PurchaseConfirm } from "./PurchaseConfirm";
import { WaitlistForm } from "./WaitlistForm";

/** One pricing plan. In waitlist mode the buy button becomes a waitlist form. */
export function PlanCard({ plan }: { plan: Plan }) {
  const sub = plan.mode === "subscription" && plan.interval;
  return (
    <div className={`card plan${plan.highlight ? " highlight" : ""}`}>
      {plan.highlight && <span className="badge">{t.price.popular}</span>}
      <h3>{plan.label}</h3>
      <div className="price">
        {formatAmount(plan.amount)}
        <small>{sub ? t.price[plan.interval!] : ` ${t.price.oneTime}`}{t.price.taxIncl}</small>
      </div>
      {plan.features.length > 0 && <ul>{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>}
      {config.launch.mode === "waitlist" ? (
        <WaitlistForm labels={t.waitlist} />
      ) : (
        <>
          <PurchaseConfirm plan={plan} />
          <BuyButton
            planId={plan.id}
            label={config.launch.mode === "presale" ? t.cta.preorder : t.cta.buy}
            pendingLabel={t.buy.pending}
            errorLabel={t.buy.error}
            devNote={devCheckoutEnabled() ? t.buy.dev : undefined}
          />
        </>
      )}
    </div>
  );
}
