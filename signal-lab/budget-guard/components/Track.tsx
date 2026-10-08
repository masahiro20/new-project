"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

type ClientEvent = "pageview" | "cta_click";

/** Fire-and-forget counter ping; never blocks navigation. */
export function trackEvent(event: ClientEvent): void {
  const body = JSON.stringify({ event });
  if (!navigator.sendBeacon?.("/api/track", body)) {
    void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  }
}

/** Counts one pageview per client-side navigation. Mounted once in the root layout. */
export function Track() {
  const pathname = usePathname();
  useEffect(() => {
    trackEvent("pageview");
  }, [pathname]);
  return null;
}

/** A link that counts a cta_click. */
export function TrackLink(props: React.ComponentProps<typeof Link>) {
  return <Link {...props} onClick={(e) => { trackEvent("cta_click"); props.onClick?.(e); }} />;
}
