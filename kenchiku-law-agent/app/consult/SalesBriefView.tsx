"use client";

import type { SalesQA } from "@/lib/salesbrief";

/** お客様対応メモ：よく聞かれる質問に、そのまま話せる言葉で。 */
export default function SalesBriefView({ items }: { items: SalesQA[] }) {
  return (
    <section className="salesbrief" aria-label="お客様対応メモ">
      <header className="glance-head">
        <span className="glance-en">For customers</span>
        <h3>お客様対応メモ</h3>
        <span className="hint">お客様によく聞かれる順。国のデータと自動判定から作った下書きなので、確定前の項目は「確認中」と伝えてください</span>
      </header>
      <ol>
        {items.map((it, i) => (
          <li key={i} className={`sb-${it.tone}`}>
            <p className="sb-q">
              <span aria-hidden>Q</span>
              {it.q}
            </p>
            <ul className="sb-a">
              {it.a.map((x, k) => (
                <li key={k}>{x}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
