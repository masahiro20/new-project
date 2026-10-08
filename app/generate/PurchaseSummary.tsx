import Link from "next/link";
import { PRODUCT_NAME, REGENERATE_PER_DAY } from "@/lib/purchase";

/** Final-confirmation details required by the Act on Specified Commercial Transactions (art. 12-6), shown right before the purchase button. */
export default function PurchaseSummary({ price }: { price: number }) {
  const rows: [string, string][] = [
    ["商品", PRODUCT_NAME],
    ["内容・数量", `1事業所分。3つの書類セット（委員会・研修・身体拘束等適正化）を1回作成します。生成に失敗した場合は、同じ入力内容で7日間、各セット1日${REGENERATE_PER_DAY}回まで作り直せます。`],
    ["価格", `${price.toLocaleString()}円（税込）。月額料金や自動更新はありません。`],
    ["支払方法・時期", "クレジットカード（Stripe）。次の画面で決済を完了した時点でお支払いが確定します。"],
    ["提供時期", "お支払い完了後、ただちにこの画面で作成を始めます（数分）。"],
    ["キャンセル・返金", "決済完了前であれば、次の画面で取りやめられます。デジタルコンテンツのため、作成開始後の返金はお受けしていません。"],
  ];
  return (
    <div className="purchase-summary">
      <h3>ご購入内容の確認</h3>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        購入に進むと、<Link href="/terms" target="_blank">利用規約</Link>と<Link href="/privacy" target="_blank">プライバシーポリシー</Link>に同意したものとみなします。詳しくは<Link href="/legal" target="_blank">特定商取引法に基づく表記</Link>をご覧ください。
      </p>
    </div>
  );
}
