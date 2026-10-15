// BOOTH で販売する「虐待防止・身体拘束適正化 書類パック」への案内（docs/booth-pack/）。
// 商品ページの URL は、この1か所だけで決める。決まるまでは {{BOOTH_URL}} の仮置きのままにし、そのあいだ案内はサイトに出ない。
// ビルド後に scripts/check-booth-placeholder.mjs が、出力に {{BOOTH_URL}} が残っていたら失敗にする。

export const BOOTH_URL_PLACEHOLDER = "{{BOOTH_URL}}";

/** ★ここに BOOTH の商品ページの URL（https://…booth.pm/items/…）を入れる。ビルド時に NEXT_PUBLIC_BOOTH_URL で上書きもできる。 */
export const BOOTH_URL_SETTING: string = "{{BOOTH_URL}}";

export function boothUrl(env: string | undefined = process.env.NEXT_PUBLIC_BOOTH_URL): string {
  return env?.trim() || BOOTH_URL_SETTING;
}

/** 本物の BOOTH の URL（https の booth.pm のページ）が入っているときだけ true。仮置きや、ほかのホストの URL では false。 */
export function boothReady(url: string = boothUrl()): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "booth.pm" || u.hostname.endsWith(".booth.pm"));
  } catch {
    return false;
  }
}

export const BOOTH_PACK = {
  title: "サービス種別ごとの記入例つき書類パックはこちら",
  seller: "ヒルフェクリエイト",
  priceText: "1,980円",
  points: [
    "虐待防止委員会・研修・身体拘束等の適正化の書類（13のサービス種別ごと）",
    "記入例（架空の事業所）と、記入用の白紙様式を1冊のPDFに。編集用のWord付き",
    "運営指導の前に見直すチェックリスト（人員・個別支援会議・加算の記録の追加編つき）",
  ],
  note: "運営指導で確認される書類のすべてが入っているわけではありません。無料のテンプレートと解説を元にした、有料のまとめ版です。",
} as const;
