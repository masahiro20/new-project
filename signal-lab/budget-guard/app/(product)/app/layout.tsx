import type { Metadata } from "next";
import { signOut } from "@/app/actions/access";
import { getPlan } from "@/lib/config";
import { t } from "@/lib/i18n";
import { requireAccess } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false } };

// The real check (proxy.ts only looks for the cookie). Server Actions and Route
// Handlers under the product must call requireAccess() themselves too.
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAccess();
  return (
    <div className="wrap">
      {access.gated && (
        <div className="app-bar">
          <span className="hint" data-testid="plan-status">
            Plan: {getPlan(access.plan)?.label ?? access.plan} · {access.entitlement.status}
            {access.entitlement.source === "demo" && "（デモ / demo）"}
          </span>
          {((access.entitlement.source === "stripe" && access.entitlement.subscriptionId) || access.entitlement.source === "demo") && (
            <form action="/api/portal" method="post">
              <button className="linkish">{t.access.billing}</button>
            </form>
          )}
          <form action={signOut}>
            <button className="linkish">{t.access.signOut}</button>
          </form>
        </div>
      )}
      {children}
    </div>
  );
}
