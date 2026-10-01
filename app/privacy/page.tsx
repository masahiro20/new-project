import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー" };

export default function PrivacyPage() {
  return (
    <section>
      <div className="wrap narrow prose">
        <h1>プライバシーポリシー</h1>
        <h2>取得する情報</h2>
        <p>書類作成のために入力された事業所情報（サービス種別、事業所名、職員数、会議メモなど）と、決済に必要な情報を取り扱います。利用者個人を特定できる情報は入力しないでください。</p>
        <h2>入力内容の取扱い</h2>
        <p>入力内容は書類の生成にのみ使用し、当サービスのサーバーには保存しません。生成のために、AIモデルの提供事業者（Anthropic）へ送信されます。入力内容はお使いのブラウザ内に保存され、ブラウザのデータを削除すると消去されます。</p>
        <h2>決済情報</h2>
        <p>クレジットカード情報は決済代行事業者（Stripe）が管理し、当サービスでは保持しません。</p>
        <h2>お問い合わせ</h2>
        <p>【要記入：連絡先メールアドレス】</p>
      </div>
    </section>
  );
}
