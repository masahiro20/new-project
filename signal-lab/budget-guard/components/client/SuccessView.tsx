"use client";

import { useEffect, useState } from "react";
import { api, useQueryParam } from "./http";

type Labels = { title: string; notPaid: string; key: string; keep: string; open: string; loading: string };
type Result = { paid: boolean; id?: string; demo?: boolean; planLabel?: string; active?: boolean; licenseKey?: string | null };

/**
 * /success?session_id=… (static shell). Confirms payment via POST /api/checkout/complete
 * (no need to wait for the webhook). "Open the app" POSTs a form to /api/access/verify,
 * which sets the access cookie.
 */
export function SuccessView({ labels, banner }: { labels: Labels; banner: React.ReactNode }) {
  const sessionId = useQueryParam("session_id");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (sessionId === undefined) return;
    if (!sessionId) return setResult({ paid: false });
    void api<Result>("/api/checkout/complete", { body: { session_id: sessionId } }).then((r) => setResult(r.status === 200 ? r.data : { paid: false }));
  }, [sessionId]);

  if (!result) return <p className="lead" data-testid="loading">{labels.loading}</p>;
  if (!result.paid) return <p className="notice">{labels.notPaid}</p>;
  return (
    <>
      {result.demo && banner}
      <h1>{labels.title}</h1>
      {result.demo && <p className="hint">Plan: {result.planLabel}（デモ購入 / demo purchase）</p>}
      {result.active ? (
        <>
          <p>{labels.key}</p>
          <p><span className="license" data-testid="license-key">{result.licenseKey}</span></p>
          <p className="hint">{labels.keep}</p>
          <form action="/api/access/verify" method="post">
            <input type="hidden" name="session_id" value={result.id} />
            <button className="btn">{labels.open}</button>
          </form>
        </>
      ) : (
        <p className="notice">{labels.notPaid}</p>
      )}
    </>
  );
}
