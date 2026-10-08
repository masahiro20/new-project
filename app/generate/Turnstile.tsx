"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare Turnstile widget. Changing `resetKey` asks for a fresh token, since each token is single-use. */
export default function Turnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string | null) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !api || !container.current) return;
    const id = api.render(container.current, {
      sitekey: siteKey,
      language: "ja",
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });
    widgetId.current = id;
    return () => {
      api.remove(id);
      widgetId.current = null;
    };
  }, [ready, siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) {
      onTokenRef.current(null);
      window.turnstile?.reset(widgetId.current);
    }
  }, [resetKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={container} className="turnstile" />
    </>
  );
}
