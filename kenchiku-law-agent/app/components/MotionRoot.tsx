"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Scroll motion for the whole site: any element with `data-reveal` fades/slides in
 * the first time it enters the viewport (stagger with `--d`). Elements added later
 * (results streaming in) are picked up by the mutation observer.
 */
export default function MotionRoot() {
  const path = usePathname();
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const scan = () => {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (reduce) el.classList.add("is-in");
        else io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);
  return null;
}
