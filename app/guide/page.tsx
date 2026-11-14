import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "減算・書類・事業所運営の解説",
  description: "障害福祉サービスの虐待防止・身体拘束等適正化・運営指導に関する減算と必要書類、請求ソフト・採用・資金繰りなど事業所運営の解説一覧です。",
};

export default function GuideIndex() {
  return (
    <section>
      <div className="wrap narrow">
        <p className="eyebrow">解説</p>
        <h1>減算・書類・事業所運営の解説</h1>
        <ul className="index-list">
          {GUIDES.map((g, i) => (
            <li key={g.slug} data-fx style={{ "--i": i % 4 } as React.CSSProperties}>
              <Link href={`/guide/${g.slug}`}>
                <span className="no">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  {g.title}
                  <small>{g.description}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
