import { Dashboard } from "@/components/client/Dashboard";
import { t } from "@/lib/i18n";
import { demoTokensAllowed } from "@/lib/guard/demo";
import { showDemoBannerAtBuild } from "@/lib/payments/mode";

// Static shell (○). Data: GET /api/app/state; actions: /api/app/*.
export default function DashboardPage() {
  return <Dashboard labels={{ billing: t.access.billing, signOut: t.access.signOut, consent: t.consent }} allowDemo={showDemoBannerAtBuild() && demoTokensAllowed()} />; // auto-demo production refuses the demo token (Ren QA)
}
