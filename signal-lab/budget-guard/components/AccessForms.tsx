"use client";

import { useState } from "react";
import { api, useQueryParam } from "@/components/client/http";

type Labels = {
  title: string; licenseLabel: string; redeem: string; magicTitle: string; magicSend: string; email: string;
  tokenTitle: string; tokenContinue: string; errors: Record<string, string>;
};
type Msg = { status: "idle" | "ok" | "error"; message: string };
const idle: Msg = { status: "idle", message: "" };

/**
 * /access (static shell). Magic links land on /access?token=… and require a click,
 * so mail scanners that prefetch links can't burn the single-use token.
 */
export function AccessForms({ labels, magicLink }: { labels: Labels; magicLink: boolean }) {
  const token = useQueryParam("token");
  const error = useQueryParam("error");
  const [license, setLicense] = useState<Msg>(idle);
  const [magic, setMagic] = useState<Msg>(idle);
  const [pending, setPending] = useState<"license" | "magic" | null>(null);

  if (token) {
    return (
      <>
        <h1>{labels.tokenTitle}</h1>
        <form action="/api/access/verify" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="btn">{labels.tokenContinue}</button>
        </form>
      </>
    );
  }

  async function redeem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending("license");
    const r = await api<{ redirect?: string; error?: string }>("/api/access/license", { body: { license: new FormData(e.currentTarget).get("license") } });
    if (r.status === 200 && r.data.redirect) return window.location.assign(r.data.redirect);
    setPending(null);
    setLicense({ status: "error", message: r.data.error ?? labels.errors.license });
  }

  async function sendMagic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending("magic");
    const r = await api<{ message?: string; error?: string }>("/api/access/magic", { body: { email: new FormData(e.currentTarget).get("email") } });
    setPending(null);
    setMagic(r.status === 200 ? { status: "ok", message: r.data.message ?? "" } : { status: "error", message: r.data.error ?? labels.errors.limited });
  }

  const errorMessage = error ? labels.errors[error] : undefined;
  return (
    <>
      <h1>{labels.title}</h1>
      {errorMessage && <p className="notice">{errorMessage}</p>}
      <form onSubmit={redeem} className="field">
        <label htmlFor="license">{labels.licenseLabel}</label>
        <div className="inline-form">
          <input id="license" name="license" type="text" required placeholder="SLAB-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
          <button className="btn" disabled={pending === "license"}>{labels.redeem}</button>
        </div>
        {license.status === "error" && <p className="msg err" role="alert">{license.message}</p>}
      </form>
      {magicLink && (
        <form onSubmit={sendMagic} className="field" style={{ marginTop: 32 }}>
          <label htmlFor="email">{labels.magicTitle}</label>
          {magic.status === "ok" ? (
            <p className="ok">{magic.message}</p>
          ) : (
            <div className="inline-form">
              <input id="email" name="email" type="email" required placeholder={labels.email} autoComplete="email" />
              <button className="btn secondary" disabled={pending === "magic"}>{labels.magicSend}</button>
            </div>
          )}
          {magic.status === "error" && <p className="msg err" role="alert">{magic.message}</p>}
        </form>
      )}
    </>
  );
}
