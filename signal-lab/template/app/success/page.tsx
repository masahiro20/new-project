import type { Metadata } from "next";
import { after } from "next/server";
import { isActive } from "@/lib/entitlements";
import { t } from "@/lib/i18n";
import { fulfillCheckout, onNewEntitlement, providerForCheckout } from "@/lib/payments";
import { getKV } from "@/lib/redis";

export const metadata: Metadata = { title: t.success.title, robots: { index: false } };

// Confirms payment by retrieving the session — no need to wait for the webhook.
// Server Components can't set cookies, so "Open the app" POSTs to /api/access/verify.
export default async function SuccessPage(props: PageProps<"/success">) {
  const { session_id } = await props.searchParams;
  const id = typeof session_id === "string" ? session_id : "";
  const provider = providerForCheckout(id);
  const checkout = provider
    ? await provider.getCompletedCheckout(id).catch((e) => {
        console.error("[success] could not retrieve checkout", e);
        return null;
      })
    : null;

  if (!provider || !checkout || checkout.status === "refunded") {
    return (
      <section>
        <div className="wrap narrow"><p className="notice">{t.success.notPaid}</p></div>
      </section>
    );
  }

  const kv = getKV();
  const { entitlement, created } = await fulfillCheckout(kv, checkout, provider.name === "dev" ? "dev" : "stripe");
  if (created) after(() => onNewEntitlement(kv, entitlement, provider));

  return (
    <section>
      <div className="wrap narrow">
        <h1>{t.success.title}</h1>
        {isActive(entitlement) ? (
          <>
            <p>{t.success.key}</p>
            <p><span className="license">{entitlement.licenseKey}</span></p>
            <p className="hint">{t.success.keep}</p>
            <form action="/api/access/verify" method="post">
              <input type="hidden" name="session_id" value={entitlement.id} />
              <button className="btn">{t.success.open}</button>
            </form>
          </>
        ) : (
          <p className="notice">{t.success.notPaid}</p>
        )}
      </div>
    </section>
  );
}
