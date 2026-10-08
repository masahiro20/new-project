"use client";

import { useActionState, useState } from "react";
import { payDemoAction, type PayState } from "@/app/checkout/demo/actions";
import { DEMO_TEST_CARD, validateCard, type CardField } from "@/lib/payments/card";

const initial: PayState = { status: "idle", message: "" };

/**
 * Demo card entry. Validates in the browser first (same rules as the server).
 * Inputs are uncontrolled and autocomplete is off so the browser doesn't save
 * anything; the server keeps last4 only.
 */
export function DemoCardForm({ checkoutId, amountLabel }: { checkoutId: string; amountLabel: string }) {
  const [state, action, pending] = useActionState(payDemoAction.bind(null, checkoutId), initial);
  const [clientErrors, setClientErrors] = useState<Partial<Record<CardField, string>>>({});
  const errors = { ...state.errors, ...clientErrors };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const result = validateCard({
      number: String(f.get("number") ?? ""),
      expiry: String(f.get("expiry") ?? ""),
      cvc: String(f.get("cvc") ?? ""),
      name: String(f.get("name") ?? ""),
    });
    if (!result.ok) {
      e.preventDefault();
      setClientErrors(result.errors);
    } else {
      setClientErrors({});
    }
  }

  const field = (name: CardField, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label}
      <input type="text" name={name} autoComplete="off" aria-invalid={!!errors[name]} aria-describedby={`${name}-err`} {...props} />
      {errors[name] && <span id={`${name}-err`} className="field-err">{errors[name]}</span>}
    </label>
  );

  return (
    <form action={action} onSubmit={onSubmit} className="stack card-form" noValidate>
      {field("number", "カード番号 / Card number", { inputMode: "numeric", placeholder: DEMO_TEST_CARD, maxLength: 23, required: true })}
      <div className="row">
        {field("expiry", "有効期限 / Expiry (MM/YY)", { inputMode: "numeric", placeholder: "12/34", maxLength: 7, required: true })}
        {field("cvc", "セキュリティコード / CVC", { inputMode: "numeric", placeholder: "123", maxLength: 4, required: true })}
      </div>
      {field("name", "カード名義 / Name on card", { placeholder: "TARO YAMADA", maxLength: 100, required: true })}
      <label>
        メールアドレス（任意） / Email (optional)
        <input type="email" name="email" autoComplete="email" placeholder="demo@example.com" maxLength={254} />
      </label>
      <p className="hint">テストカード {DEMO_TEST_CARD}・未来の有効期限・任意の3桁で通ります。実在のカード番号は入力しないでください。</p>
      <button className="btn" disabled={pending}>{pending ? "処理中… / Processing…" : `デモで支払う（${amountLabel}）`}</button>
      {state.message && <p className="msg err" role="alert">{state.message}</p>}
    </form>
  );
}
