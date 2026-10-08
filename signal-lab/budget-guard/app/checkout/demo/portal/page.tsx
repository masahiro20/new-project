import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { getPlan } from "@/lib/config";
import { getEntitlement, isActive } from "@/lib/entitlements";
import { getDemoCheckout, isDemoCheckoutId } from "@/lib/payments/demo";
import { isDemoMode } from "@/lib/payments/mode";
import { getKV } from "@/lib/redis";
import { demoPortalAction } from "../actions";

export const metadata: Metadata = { title: "デモ請求管理 / Demo billing", robots: { index: false } };

// Stand-in for the Stripe billing portal. Reads the access cookie directly (not
// requireAccess) so a canceled demo plan can still be reactivated here.
export default async function DemoPortalPage(props: PageProps<"/checkout/demo/portal">) {
  if (!isDemoMode()) redirect("/app");
  const claims = await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!claims || !isDemoCheckoutId(claims.sub)) redirect("/access");
  const kv = getKV();
  const entitlement = await getEntitlement(kv, claims.sub);
  if (!entitlement) redirect("/access");
  const checkout = await getDemoCheckout(kv, claims.sub);
  const { done } = await props.searchParams;
  const active = isActive(entitlement);

  return (
    <section>
      <div className="wrap narrow">
        <DemoBanner inline />
        <h1>デモ請求管理 / Demo billing</h1>
        {done && <p className="msg ok">{done === "cancel" ? "デモプランを解約しました。" : "デモプランを再開しました。"}</p>}
        <div className="card stack">
          <p>プラン / Plan: <strong>{getPlan(entitlement.plan)?.label ?? entitlement.plan}</strong></p>
          <p>状態 / Status: <strong data-testid="demo-plan-status">{entitlement.status}</strong></p>
          {checkout?.last4 && <p>カード / Card: •••• {checkout.last4}（デモ）</p>}
          <form action={demoPortalAction}>
            <input type="hidden" name="action" value={active ? "cancel" : "reactivate"} />
            <button className={active ? "btn secondary" : "btn"}>{active ? "解約する（デモ） / Cancel plan" : "再開する（デモ） / Reactivate"}</button>
          </form>
        </div>
        <p style={{ marginTop: 16 }}><Link href="/app">アプリに戻る / Back to app</Link></p>
      </div>
    </section>
  );
}
