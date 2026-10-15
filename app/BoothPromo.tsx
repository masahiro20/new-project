import BoothLink from "@/app/BoothLink";
import { BOOTH_PACK, boothReady, boothUrl } from "@/lib/booth";

/**
 * BOOTH のパックへの小さな案内（サーバー側で描画）。商品ページの URL が決まる（lib/booth.ts）まで、何も出さない。
 * 仮置きの文字列がクライアントの JS に入らないよう、URL を読むのはこのコンポーネントだけにして、リンクには値だけを渡す。
 */
export default function BoothPromo() {
  const url = boothUrl();
  if (!boothReady(url)) return null;
  return (
    <aside className="card" style={{ marginTop: 32 }} aria-labelledby="booth-promo-title">
      <h3 id="booth-promo-title">{BOOTH_PACK.title}</h3>
      <ul>
        {BOOTH_PACK.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="hint">
        {BOOTH_PACK.note}（BOOTH で販売・{BOOTH_PACK.priceText}・販売者：{BOOTH_PACK.seller}）
      </p>
      <div className="actions">
        <BoothLink href={url} />
      </div>
    </aside>
  );
}
