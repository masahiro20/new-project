"use client";

import { useState } from "react";
import { DEMO_TEST_CARD, validateCard, type CardField } from "@/lib/payments/card";
import { api } from "./client/http";

type PayResponse = { ok?: boolean; redirect?: string; error?: string; errors?: Partial<Record<CardField, string>> };

/**
 * Demo card entry. Validates in the browser first (same rules as the server), then
 * POSTs to /api/checkout/demo. Inputs are uncontrolled and autocomplete is off so the
 * browser doesn't save anything; the server keeps last4 only.
 */
export function DemoCardForm({ checkoutId, amountLabel }: { checkoutId: string; amountLabel: string }) {
  const [errors, setErrors] = useState<Partial<Record<CardField, string>>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const card = { number: String(f.get("number") ?? ""), expiry: String(f.get("expiry") ?? ""), cvc: String(f.get("cvc") ?? ""), name: String(f.get("name") ?? "") };
    const result = validateCard(card);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setPending(true);
    const r = await api<PayResponse>("/api/checkout/demo", { body: { id: checkoutId, ...card, email: String(f.get("email") ?? "") } });
    if (r.status === 200 && r.data.redirect) return window.location.assign(r.data.redirect);
    setPending(false);
    setErrors(r.data.errors ?? {});
    setMessage(r.data.error ?? "エラーが発生しました / Something went wrong.");
  }

  const field = (name: CardField, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label}
      <input type="text" name={name} autoComplete="off" aria-invalid={!!errors[name]} aria-describedby={`${name}-err`} {...props} />
      {errors[name] && <span id={`${name}-err`} className="field-err">{errors[name]}</span>}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="stack card-form" noValidate>
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
      {message && <p className="msg err" role="alert">{message}</p>}
    </form>
  );
}
