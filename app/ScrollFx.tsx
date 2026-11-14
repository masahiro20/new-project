"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const start = performance.now();
  const duration = 1200;
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Reveals [data-fx] elements as they scroll into view and counts up [data-count] numbers. */
export default function ScrollFx() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const els = [...document.querySelectorAll<HTMLElement>("[data-fx]")];

    // On first load, whatever is already on screen stays put instead of flashing out and back in.
    if (!root.classList.contains("fx")) {
      for (const el of els) {
        if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-in", "no-anim");
      }
      root.classList.add("fx");
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          if (el.classList.contains("is-in")) continue;
          el.classList.add("is-in");
          el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
