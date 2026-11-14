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
        {GUIDES.map((g) => (
          <div key={g.slug} className="card" style={{ marginBottom: 12 }}>
            <h3><Link href={`/guide/${g.slug}`}>{g.title}</Link></h3>
            <p>{g.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
