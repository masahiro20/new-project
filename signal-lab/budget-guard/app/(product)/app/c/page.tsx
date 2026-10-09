import { ConnectionPage } from "@/components/client/ConnectionPage";
import { t } from "@/lib/i18n";

// Static shell (○) for /app/c?id=conn_…. Data and actions: /api/app/connections/{id}.
export default function StopSettingsPage() {
  return <ConnectionPage labels={{ billing: t.access.billing, signOut: t.access.signOut }} />;
}
