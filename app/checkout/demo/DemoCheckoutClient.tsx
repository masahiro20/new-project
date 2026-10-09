"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { DEMO_TEST_CARD, validateCard, type CardField } from "@/lib/payments/card";

/**
 * Demo card entry. The card is validated here only (Luhn, future expiry, CVC, name)
 * and never leaves the browser: inputs are uncontrolled, autocomplete is off, and the
 * form is cleared after a successful submit.
 */
export default function DemoCheckoutClient({ amountLabel, ai, apiBase = "" }: { amountLabel: string; ai: boolean; apiBase?: string }) {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [errors, setErrors] = useState<Partial<Record<CardField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const result = validateCard({
      number: String(f.get("number") ?? ""),
      expiry: String(f.get("expiry") ?? ""),
      cvc: String(f.get("cvc") ?? ""),
      name: String(f.get("name") ?? ""),
    });
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    form.reset();

    // Static host (no AI server): the demo ends here.
    if (!ai || !token) {
      trackEvent("demo-purchase-complete");
      return setDone(true);
    }

    setPending(true);
    setMessage(null);
    const res = await fetch(`${apiBase}/api/checkout/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const data = await res.json().catch(() => ({}));
    if (data.url) router.push(data.url);
    else {
      setMessage(data.error ?? "デモ決済を完了できませんでした。");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="ok" role="status">
        <h2 style={{ marginTop: 0 }}>デモ購入が完了しました（請求はありません）</h2>
        <p>
          実際のサービスでは、ここから3つの書類セットの作成が始まります。AIによる作成は準備中のため、完成イメージは書類サンプルでご覧ください。
        </p>
        <div className="actions">
          <Link href="/samples" className="btn">書類サンプルを見る</Link>
          <Link href="/" className="btn secondary">トップページへ</Link>
        </div>
      </div>
    );
  }

  const field = (name: CardField, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="field">
      <label htmlFor={`card-${name}`}>{label}</label>
      <input id={`card-${name}`} type="text" name={name} autoComplete="off" aria-invalid={!!errors[name]} aria-describedby={`${name}-err`} {...props} />
      {errors[name] && <span id={`${name}-err`} className="field-err">{errors[name]}</span>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="card-form" noValidate>
      {field("number", "カード番号", { inputMode: "numeric", placeholder: DEMO_TEST_CARD, maxLength: 23 })}
      <div className="row">
        {field("expiry", "有効期限（MM/YY）", { inputMode: "numeric", placeholder: "12/34", maxLength: 7 })}
        {field("cvc", "セキュリティコード", { inputMode: "numeric", placeholder: "123", maxLength: 4 })}
      </div>
      {field("name", "カード名義", { placeholder: "TARO YAMADA", maxLength: 100 })}
      <p className="hint">テストカード {DEMO_TEST_CARD}、未来の有効期限、任意の3桁で通ります。実在のカード番号は入力しないでください。</p>
      <div className="actions">
        <button type="submit" className="btn" disabled={pending}>{pending ? "処理中…" : `デモで支払う（${amountLabel}）`}</button>
        <Link href="/" className="btn secondary">キャンセル</Link>
      </div>
      {message && <p className="notice" role="alert">{message}</p>}
    </form>
  );
}
