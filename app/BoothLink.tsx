"use client";

import { trackEvent } from "@/lib/analytics";

/** BOOTH への1ボタン。クリックを数える（分析が有効なときだけ）。URL は呼び出し側（BoothPromo）が渡す。 */
export default function BoothLink({ href }: { href: string }) {
  return (
    <a href={href} className="btn secondary" rel="noopener noreferrer" target="_blank" onClick={() => trackEvent("cta-booth")}>
      BOOTH で見る<span className="visually-hidden">（新しいタブで開きます）</span>
    </a>
  );
}
