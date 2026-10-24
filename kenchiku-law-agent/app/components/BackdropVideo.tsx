"use client";

import { useEffect, useRef } from "react";

/** The office's film behind every page, like the company site. Still image when motion is reduced. */
export default function BackdropVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.play().catch(() => {});
  }, []);
  return (
    <div className="backdrop" aria-hidden>
      <video ref={ref} muted loop playsInline preload="auto" poster="/media/poster.jpg">
        <source src="/media/hero.webm" type="video/webm" />
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>
      <span className="backdrop-shade" />
    </div>
  );
}
