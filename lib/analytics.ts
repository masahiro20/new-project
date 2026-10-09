// Cookie-free page and event counts via GoatCounter (https://www.goatcounter.com).
// Off unless NEXT_PUBLIC_GOATCOUNTER_CODE is set at build time; then nothing personal is
// sent: GoatCounter stores only aggregates (no cookies, no raw IP). Client-only.

export type AnalyticsEvent =
  | "check-start"
  | "check-complete"
  | "sample-download-committee"
  | "sample-download-training"
  | "sample-download-restraint"
  | "demo-purchase-complete"
  | "checklist-download-pdf"
  | "checklist-download-docx"
  | "template-download-committee"
  | "template-download-training"
  | "template-download-restraint";

type GoatCounter = { count: (vars: { path: string; title?: string; event?: boolean }) => void };
const gc = () => (window as unknown as { goatcounter?: Partial<GoatCounter> }).goatcounter;

/** count.js loads async; wait for it briefly, then give up quietly (e.g. blocked by an ad blocker). */
function whenReady(fn: (gc: GoatCounter) => void) {
  if (!process.env.NEXT_PUBLIC_GOATCOUNTER_CODE) return;
  let tries = 0;
  const t = setInterval(() => {
    const g = gc();
    if (g?.count) {
      clearInterval(t);
      fn(g as GoatCounter);
    } else if (++tries > 50) clearInterval(t);
  }, 100);
}

export function trackPageview(path: string) {
  whenReady((g) => g.count({ path }));
}

/** Event names double as GoatCounter paths. Titles must never contain user input. */
export function trackEvent(event: AnalyticsEvent, title?: string) {
  whenReady((g) => g.count({ path: event, title: title ?? event, event: true }));
}
