"use client";

import { useActionState } from "react";
import { redeemLicense, requestLogin, type FormState } from "@/app/actions/access";

const initial: FormState = { status: "idle", message: "" };

type Labels = { licenseLabel: string; redeem: string; magicTitle: string; magicSend: string; email: string };

export function AccessForms({ labels, magicLink }: { labels: Labels; magicLink: boolean }) {
  const [licenseState, licenseAction, licensePending] = useActionState(redeemLicense, initial);
  const [magicState, magicAction, magicPending] = useActionState(requestLogin, initial);
  return (
    <>
      <form action={licenseAction} className="field">
        <label htmlFor="license">{labels.licenseLabel}</label>
        <div className="inline-form">
          <input id="license" name="license" type="text" required placeholder="SLAB-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
          <button className="btn" disabled={licensePending}>{labels.redeem}</button>
        </div>
        {licenseState.status === "error" && <p className="msg err" role="alert">{licenseState.message}</p>}
      </form>
      {magicLink && (
        <form action={magicAction} className="field" style={{ marginTop: 32 }}>
          <label htmlFor="email">{labels.magicTitle}</label>
          {magicState.status === "ok" ? (
            <p className="ok">{magicState.message}</p>
          ) : (
            <div className="inline-form">
              <input id="email" name="email" type="email" required placeholder={labels.email} autoComplete="email" />
              <button className="btn secondary" disabled={magicPending}>{labels.magicSend}</button>
            </div>
          )}
          {magicState.status === "error" && <p className="msg err" role="alert">{magicState.message}</p>}
        </form>
      )}
    </>
  );
}
