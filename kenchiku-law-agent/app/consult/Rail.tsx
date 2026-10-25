"use client";

import { useEffect, useState } from "react";

export type RailItem = { id: string; no: string; label: string; ready: boolean; note?: string; hidden?: boolean };

/** Index of the page's sections; follows the scroll and jumps on click. */
export default function Rail({ items: all, title }: { items: RailItem[]; title: string }) {
  const items = all.filter((i) => !i.hidden);
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const els = items.filter((i) => i.ready).map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  const index = Math.max(0, items.findIndex((i) => i.id === active));
  return (
    <nav className="ws-rail" aria-label="このページの目次">
      <p className="ws-rail-title" title={title}>
        {title}
      </p>
      <ol style={{ ["--i" as string]: index }}>
        {items.map((i) => (
          <li key={i.id} className={`${i.id === active ? "is-active" : ""} ${i.ready ? "" : "is-off"}`}>
            {i.ready ? (
              <a href={`#${i.id}`}>
                <span className="n">{i.no}</span>
                <span className="l">{i.label}</span>
                {i.note && <span className="note">{i.note}</span>}
              </a>
            ) : (
              <span>
                <span className="n">{i.no}</span>
                <span className="l">{i.label}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
