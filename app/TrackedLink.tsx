"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";

/** A next/link that also counts the click (for CTAs on server-rendered pages). */
export default function TrackedLink({ event, onClick, ...props }: ComponentProps<typeof Link> & { event: AnalyticsEvent }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        trackEvent(event);
        onClick?.(e);
      }}
    />
  );
}
