"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoCardForm } from "@/components/DemoCardForm";
import { api, useQueryParam } from "./http";

type Info = { state: "pending" | "done" | "not-found" | "disabled"; id?: string; planLabel?: string; amountLabel?: string };

/** /checkout/demo?id=demo_… (static shell). Data: GET /api/checkout/demo. */
export function DemoCheckoutView({ productName, pricingLabel, openLabel, banner }: { productName: string; pricingLabel: string; openLabel: string; banner: React.ReactNode }) {
  const id = useQueryParam("id");
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    if (id === undefined) return;
    if (!id) return setInfo({ state: "not-found" });
    void api<Info>(`/api/checkout/demo?id=${encodeURIComponent(id)}`).then((r) => setInfo(r.data.state ? r.data : { state: "not-found" }));
  }, [id]);

  if (!info) return <p className="lead" data-testid="loading">読み込み中… / Loading…</p>;
  if (info.state === "disabled" || info.state === "not-found") {
    return (
      <p className="notice">
        {info.state === "disabled" ? "デモ決済は無効です。" : "このデモ決済は見つからないか、有効期限（1時間）が切れました。"} <Link href="/pricing">{pricingLabel}</Link>
      </p>
    );
  }
  if (info.state === "done") {
    return <p className="notice">この決済は完了しています。 <Link href={`/success?session_id=${info.id}`}>{openLabel}</Link></p>;
  }
  return (
    <>
      {banner}
      <h1>デモ決済 / Demo checkout</h1>
      <p className="lead">{productName} — {info.planLabel}: <strong>{info.amountLabel}</strong></p>
      <p className="hint">これはデモです。カード情報は保存・送信されず、請求も発生しません（保存するのは末尾4桁のみ）。</p>
      <DemoCardForm checkoutId={info.id!} amountLabel={info.amountLabel!} />
      <p className="hint" style={{ marginTop: 16 }}><Link href="/pricing?canceled=1">キャンセルして料金ページに戻る / Cancel</Link></p>
    </>
  );
}
