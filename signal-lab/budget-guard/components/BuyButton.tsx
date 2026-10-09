"use client";

import { useState } from "react";
import { ConsentCheckbox, type ConsentLabels } from "./ConsentCheckbox";
import { trackEvent } from "./Track";

type Props = { planId: string; label: string; pendingLabel: string; errorLabel: string; note?: string; consent: ConsentLabels };

export function BuyButton({ planId, label, pendingLabel, errorLabel, note, consent }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function buy() {
    setPending(true);
    setError(false);
    trackEvent("cta_click");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, consent: agreed }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error("checkout failed");
      window.location.assign(data.url);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      <ConsentCheckbox labels={consent} checked={agreed} onChange={setAgreed} />
      <button type="button" className="btn" onClick={buy} disabled={pending || !agreed} title={agreed ? undefined : consent.required}>{pending ? pendingLabel : label}</button>
      {note && <p className="hint">{note}</p>}
      {error && <p className="msg err" role="alert">{errorLabel}</p>}
    </div>
  );
}
