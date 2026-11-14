import { OFFER_HEADINGS, type Offer } from "@/lib/offers";

/** Disclosure required wherever a page carries affiliate links (景品表示法のステマ規制). */
export function PrNotice() {
  return <p className="pr-notice">【PR】本ページはプロモーション（広告）を含みます。</p>;
}

export default function OfferBox({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  const categories = [...new Set(offers.map((o) => o.category))];
  return (
    <aside className="offers">
      {categories.map((c) => (
        <div key={c}>
          <h2>{OFFER_HEADINGS[c]}<span className="pr-tag">PR</span></h2>
          {offers.filter((o) => o.category === c).map((o) => (
            <div key={o.id} className="card offer">
              <h3>{o.name}</h3>
              <p>{o.point}</p>
              <a href={`/go/${o.id}`} className="btn" rel="sponsored nofollow noopener" target="_blank">公式サイトで詳細を見る</a>
            </div>
          ))}
        </div>
      ))}
      <p className="hint">掲載内容は記事の最終更新日時点のものです。料金や条件は必ず公式サイトでご確認ください。</p>
    </aside>
  );
}
