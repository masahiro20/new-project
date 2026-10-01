import type { Metadata } from "next";
import { priceJpy } from "@/lib/stripe";

export const metadata: Metadata = { title: "特定商取引法に基づく表記", robots: { index: false } };

// 【要記入】の項目は公開前に必ず埋めてください（特定商取引法第11条）。
const ROWS: [string, string][] = [
  ["販売事業者", "【要記入：氏名または法人名】"],
  ["運営責任者", "【要記入】"],
  ["所在地", "【要記入：請求があった場合に遅滞なく開示する旨の記載も可】"],
  ["連絡先", "【要記入：メールアドレス。電話番号は請求があった場合に遅滞なく開示】"],
  ["販売価格", `${priceJpy().toLocaleString()}円（税込）`],
  ["商品代金以外の必要料金", "インターネット接続にかかる通信料"],
  ["支払方法", "クレジットカード（Stripe）"],
  ["支払時期", "ご注文時にお支払いが確定します"],
  ["提供時期", "お支払い完了後、直ちに画面上で書類を作成します"],
  ["返品・キャンセル", "デジタルコンテンツの性質上、提供開始後の返金はお受けしておりません。生成に失敗した場合は、同じ入力内容で7日間再生成できます。"],
];

export default function LegalPage() {
  return (
    <section>
      <div className="wrap narrow prose">
        <h1>特定商取引法に基づく表記</h1>
        <table>
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
