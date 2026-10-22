import type { ReactNode } from "react";

/** Numbered section of a working page: number, Mincho title, one-line lead, then content on the page itself. */
export default function Section({ id, no, title, lead, aside, children, className = "" }: { id: string; no: string; title: string; lead?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`ws-sec ${className}`} aria-labelledby={`${id}-title`}>
      <header className="ws-sec-head">
        <span className="ws-no" aria-hidden>
          {no}
        </span>
        <div className="ws-sec-titles">
          <h2 id={`${id}-title`}>{title}</h2>
          {lead && <p className="ws-lead">{lead}</p>}
        </div>
        {aside && <div className="ws-sec-aside">{aside}</div>}
      </header>
      <div className="ws-sec-body">{children}</div>
    </section>
  );
}
