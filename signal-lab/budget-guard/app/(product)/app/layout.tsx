import type { Metadata } from "next";
import { signOut } from "@/app/actions/access";
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
          {access.entitlement.source === "stripe" && access.entitlement.subscriptionId && (
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
