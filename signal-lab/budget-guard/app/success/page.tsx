import type { Metadata } from "next";
import { SuccessView } from "@/components/client/SuccessView";
import { DemoBanner } from "@/components/DemoBanner";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.success.title, robots: { index: false } };

// Static shell (○). Fulfilment happens in POST /api/checkout/complete.
export default function SuccessPage() {
  const s = t.success;
  return (
    <section>
      <div className="wrap narrow">
        <SuccessView
          labels={{ title: s.title, notPaid: s.notPaid, key: s.key, keep: s.keep, open: s.open, loading: "確認中… / Confirming…" }}
          banner={<DemoBanner inline />}
        />
      </div>
    </section>
  );
}
