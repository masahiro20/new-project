"use client";

import { useState } from "react";
import { trackEvent } from "./Track";

type Props = { planId: string; label: string; pendingLabel: string; errorLabel: string; devNote?: string };

export function BuyButton({ planId, label, pendingLabel, errorLabel, devNote }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function buy() {
    setPending(true);
    setError(false);
    trackEvent("cta_click");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
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
      <button type="button" className="btn" onClick={buy} disabled={pending}>{pending ? pendingLabel : label}</button>
      {devNote && <p className="hint">{devNote}</p>}
      {error && <p className="msg err" role="alert">{errorLabel}</p>}
    </div>
  );
}
