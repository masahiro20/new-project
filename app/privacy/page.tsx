import type { Metadata } from "next";
import { aiEnabled, isFreeLaunch, liveBilling, operator } from "@/lib/launch";

export const metadata: Metadata = { title: "プライバシーポリシー" };

// 【要記入】の項目は公開前に必ず埋め、オーナーが内容を最終確認してください。
// 無料公開モードでは lib/launch.ts の運営者情報を使い、使っていない機能（決済・AI）の記載は出さない。
export default function PrivacyPage() {
  const op = operator();
  const sales = liveBilling();
  // Placeholders remain only for the owner to fill before live billing.
  const free = isFreeLaunch() || !sales;
  const ai = aiEnabled();
  const turnstile = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const upstash = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const analytics = Boolean(process.env.NEXT_PUBLIC_GOATCOUNTER_CODE);

  const abuse = free
    ? [
        turnstile && "Cloudflare, Inc.（アメリカ合衆国。ロボット判定）",
        upstash && "Upstash, Inc.（利用回数の記録。IPアドレスは復元できない形に変換して保存）",
      ].filter(Boolean)
    : ["Cloudflare, Inc.（アメリカ合衆国。ロボット判定）", "【要記入：例 Upstash, Inc.（利用回数の記録。IPアドレスは復元できない形に変換して保存）】"];

  return (
    <section>
      <div className="wrap narrow prose">
        <h1>プライバシーポリシー</h1>
        <p>{op.name}（以下「運営者」）は、「減算ゼロ」（以下「本サービス」）における情報の取扱いを次のとおり定めます。</p>

        <h2>取得する情報</h2>
        <p>
          {ai && "書類作成のために入力された事業所情報（サービス種別、事業所名、職員数、会議メモなど）、"}
          {sales && "決済に必要な情報、"}
          アクセス元のIPアドレスなどの通信記録を取り扱います。利用者（サービスの利用者）その他の個人を特定できる情報は入力しないでください。
        </p>

        <h2>利用目的</h2>
        <ul>
          {ai && <li>書類の作成と表示</li>}
          {sales && <li>決済の確認と、購入内容に応じた書類の提供</li>}
          <li>不正利用の防止（短時間の大量利用の制限、ロボットによる利用の判定）</li>
          <li>お問い合わせへの対応</li>
        </ul>

        <h2>入力内容の取扱い</h2>
        <p>
          減算リスク診断のチェック内容{ai && "、書類作成の入力内容と作成した書類"}は、当サービスのサーバーには保存しません。
          {ai && "お使いのブラウザ内に保存され、ブラウザのデータを削除すると消去されます。"}
        </p>

        {ai && (
          <>
            <h2>外国にある第三者への提供</h2>
            <p>書類を作成するため、入力内容を、AIモデルの提供事業者である Anthropic, PBC（アメリカ合衆国）へ送信します。個人情報の保護に関する法律第28条に基づき、次の情報を提供します。</p>
            <ul>
              <li>提供先の国：アメリカ合衆国</li>
              <li>
                その国の個人情報保護制度：アメリカ合衆国には、日本の個人情報保護法に相当する包括的な連邦法はなく、分野ごとの連邦法と州法（カリフォルニア州消費者プライバシー法など）で保護されています。詳しくは
                <a href="https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/#gaikoku" rel="noopener" target="_blank">個人情報保護委員会の資料</a>
                をご覧ください。
              </li>
              <li>
                提供先の措置：Anthropic は、API で受け取ったデータを自社のAIモデルの学習に使わない方針を公表しています。データの保存期間などは同社のプライバシーポリシー・利用規約に従います。
                {!free && "【要記入：契約時点の保存期間（例：30日）を確認して記載】"}
              </li>
            </ul>
          </>
        )}

        <h2>業務の委託</h2>
        <p>次の事業者に業務の一部を委託しています。</p>
        <ul>
          {sales && <li>決済：Stripe, Inc.（アメリカ合衆国）および Stripe Japan 株式会社。クレジットカード情報は Stripe が管理し、当サービスでは保持しません。</li>}
          <li>ホスティング：{process.env.HOSTING_PROVIDER || (free ? "GitHub, Inc.（アメリカ合衆国。GitHub Pages）" : "【要記入：例 Vercel Inc.（アメリカ合衆国）】")}</li>
          {abuse.length > 0 && <li>不正利用の防止：{abuse.join("、")}</li>}
          {analytics && (
            <li>
              アクセス解析：GoatCounter（閲覧されたページ、診断の開始・完了、書類サンプルの保存の回数を集計します。Cookie は使わず、IPアドレスなど個人を特定できる情報は保存されません。診断の回答内容は送信しません）
            </li>
          )}
        </ul>

        <h2>安全管理措置</h2>
        <p>通信の暗号化、アクセス権限の制限、入力内容をサーバーに保存しない設計、委託先の選定と監督など、必要かつ適切な措置を講じます。</p>

        <h2>開示等の請求・お問い合わせ</h2>
        <p>保有する個人データの開示、訂正、利用停止などのご請求と、本ポリシーに関するお問い合わせは、次の窓口で受け付けます。</p>
        <p>{op.contact}</p>

        <p>制定日：{op.established}</p>
      </div>
    </section>
  );
}
