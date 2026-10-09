"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackPageview } from "@/lib/analytics";

/**
 * Loads GoatCounter with no_onload, and counts every App Router navigation itself
 * (count.js alone would only see the first page of a client-side session).
 */
export default function Analytics({ code }: { code: string }) {
  const pathname = usePathname();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return (
    <Script
      src="https://gc.zgo.at/count.js"
      strategy="afterInteractive"
      data-goatcounter={`https://${code}.goatcounter.com/count`}
      data-goatcounter-settings='{"no_onload": true}'
    />
  );
}
