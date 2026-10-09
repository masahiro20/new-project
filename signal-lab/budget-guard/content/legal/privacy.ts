import { hostingProvider } from "@/lib/site";
import { REVIEW_MARK as R, type LegalDoc } from "./types";

// 雛形（弁護士レビュー前）。取得情報や外部送信先が変わる製品では必ず書き換えてください。
// 【要専門家確認】の付いた段落は 2026-10-09 の修正案。根拠と専門家への問いは docs/legal-changes.md。
// 公開前に【要専門家確認】をすべて外す（docs/legal-changes.md の「公開前のチェックリスト」）。

/** Hosting company named in the cross-border section (same build-time switch as the processors line). */
const hostingEntity = () => (hostingProvider() === "Cloudflare" ? "Cloudflare, Inc." : "Vercel Inc.");

/** 個人情報保護委員会「外国における個人情報の保護に関する制度等の調査」 */
const PPC_FOREIGN = "https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/";

export const privacy: Record<"ja" | "en", LegalDoc> = {
  ja: (c) => ({
    title: "プライバシーポリシー",
    sections: [
      {
        heading: "取得する情報",
        body: [
          `${c.name}（以下「本サービス」）は、待機リストへの登録時のメールアドレス、購入時に決済代行事業者から提供されるメールアドレスと購入情報、ライセンスキーを取り扱います。`,
          `${R}監視の機能を使う場合、次の情報も取り扱います。①利用者が接続した各社（Vercel、OpenAI、Anthropic）の API トークン（暗号化して保存し、画面には、各社が公開している接頭辞（例：sk-ant-admin）と末尾4文字だけの伏せ字を表示します。短いトークンは伏せ字だけです）、②利用者が登録した Slack の incoming webhook の URL、③利用者が登録した Vercel の Spend Management webhook の秘密（シークレット）、④利用額のデータ（接続ごとの最新の利用額のスナップショットと、通知・停止などの記録であるアクティビティログ）。あわせて、接続ごとのラベル、対象のチーム・プロジェクト・ワークスペースの ID、予算額、停止の設定を保存します。`,
        ],
      },
      {
        heading: "利用目的",
        body: [
          "本サービスの提供、ライセンスキーやログインリンクの送付、お問い合わせへの対応、公開のお知らせのために利用します。",
          `${R}API トークンは、各社から利用額を読み取ること、および利用者が設定した停止アクション（テストモードでは記録のみ）を実行することにだけ使います。Slack の webhook URL は通知の送信に、Vercel webhook の秘密は Vercel から届く通知が本物であることの確認に、利用額のデータは予算に対する割合の判定、ダッシュボードの表示、通知と停止の判断に使います。`,
        ],
      },
      {
        heading: "保存期間と削除",
        body: [
          `${R}API トークン：接続を削除するまで保存します。接続を削除すると、トークン（暗号文と伏せ字）も同時に削除します。本サービスで削除しても各社のキーは失効しないため、各社の管理画面でキーを失効させてください。`,
          `${R}Vercel webhook の秘密：利用者が登録を解除するか、その接続を削除するまで保存します。`,
          `${R}Slack の webhook URL：利用者が登録を解除するまで保存します。接続を削除しても、この URL は削除されません。`,
          `${R}利用額のスナップショット：接続ごとに最新の1件だけを保存し、確認のたびに上書きします。接続を削除すると削除します。`,
          `${R}アクティビティログ：アカウントごとに最新の50件だけを保存し、古いものから順に消えます。接続を削除すると、その接続についての記録も一緒に削除します。`,
          `${R}サブスクリプションまたは試用（30日間）が終了すると、監視を止めます。当方が保存している上記の情報は、終了から30日間保存し、その後に削除します。`,
          `${R}アカウント全体の削除は、下記の窓口からいつでもご依頼いただけます。ご依頼から7日以内に削除し、完了をお知らせします。`,
          `${R}購入記録：税法上の帳簿書類の保存に合わせて、本物の課金による購入の記録は、上記の削除（終了後30日の削除、ご依頼による削除）の後も7年間保存します（期間の起算日は税法の定めによります）。保存するのは購入の日時、金額、プラン、請求書番号だけで、個人を識別する情報は最小限にとどめます。期間を過ぎたら削除します。デモの購入（請求のないもの）は対象外です。`,
          `${R}最小限の権利の記録：終了後30日の削除（ご依頼による削除を含みます）の後も、購入ごとの権利について、ID、状態、プラン、日付（作成・更新・終了・削除の日時）、同意の記録だけを残します。目的は、同じ購入から権利が作り直されるのを防ぐことと、同意の記録を残すことです。メールアドレスとライセンスキーは、本サービスのサーバーには残しません。ただし、本物の課金による購入では、決済の記録として、決済代行事業者（Stripe）の顧客情報に、ライセンスキーと権利の ID が残ります。これは本サービスでの削除（終了後30日の削除、ご依頼による削除）では削除されず、Stripe での保存期間は同社の定めによります。保存期間は、本物の課金による購入では、その購入の年度の購入記録と同じ期限（上記の7年間）、デモの購入では90日間で、過ぎたら自動的に削除します。`,
          `${R}不正利用を防ぐため、IP アドレスと、ログインリンクの送り先のメールアドレスのハッシュ値（メールアドレスそのものは保存しません）を、回数制限の目的でのみ一時的に保存し、最長10分で自動的に削除します。デモの購入記録（メールアドレスとカード番号の末尾4桁）は、支払い前のものは1時間、支払い済みのものは90日で自動的に削除します。`,
        ],
      },
      {
        heading: "暗号化と安全管理",
        body: [
          `${R}API トークン、Slack の webhook URL、Vercel webhook の秘密は、AES-256-GCM で暗号化して保存します。暗号文は接続（Slack はアカウント）に結び付けており、別の接続に写しても復号できません。暗号鍵は保存先のデータベースとは別に、ホスティング事業者の秘密情報の管理機能で保管します。これらの値を画面や API の応答で再表示することはありません。`,
          `${R}利用額のデータ、アクティビティログ、メールアドレスなどはアプリケーションでは暗号化せずに保存します。保存先の事業者での保存時の暗号化の有無は（要確認）です。通信は HTTPS で暗号化します。`,
        ],
      },
      {
        heading: "決済情報",
        body: [
          "クレジットカード情報は決済代行事業者（Stripe）が管理し、本サービスでは保持しません。",
          `${R}デモモード（実際の請求がない状態）では、入力されたカード番号を外部に送らず、末尾4桁だけを保存します。`,
        ],
      },
      {
        heading: "外部サービス",
        body: [
          `データの保存に Upstash、メール送信に Resend、ホスティングに ${hostingProvider()} を利用します。これらの事業者は国外に所在する場合があります。`,
          `${R}このほか、利用者の指示により、利用者が接続した各社（Vercel、OpenAI、Anthropic）の API に API トークンと対象の ID を送り、利用者が登録した Slack の webhook に通知の内容（接続のラベル、利用額、停止の結果など）を送ります。本物の課金を始めた後は、決済に Stripe を利用します。`,
        ],
      },
      {
        heading: "外国にある第三者への提供",
        body: [
          `${R}本サービスは、下記の外国にある事業者に個人データの取扱いを委託し、または利用者の指示により送信します。これらの提供は、あらかじめ本人の同意を得たうえで行います（同意は、購入時と接続の追加時にいただきます）。以下は、同意をいただく際にお示しする情報です。各国の個人情報の保護に関する制度は、個人情報保護委員会が公表している「外国における個人情報の保護に関する制度等の調査」（${PPC_FOREIGN}）でご確認いただけます（米国は「アメリカ合衆国（連邦）」と各州の項目）。各事業者が講じる措置は、各社のプライバシーポリシーなどの公表情報によるもので、当方が個別に確認したものではありません。`,
          `${R}Upstash, Inc.（データの保存）：所在国は米国です。データの保存先は、当方が本サービスのデプロイ時に選んだリージョン（国名は（要確認））です。同社は EU-米国データプライバシーフレームワーク（DPF）の認証を受け、委託先と標準契約条項などのデータ移転契約を結ぶとしています。`,
          `${R}${hostingEntity()}（ホスティング）：所在国は米国です。${
            hostingProvider() === "Cloudflare"
              ? "同社は APEC の越境プライバシールール（CBPR）とプロセッサーのためのプライバシー認証（PRP）、および DPF の認証を受け、標準契約条項を用いるとしています。処理を行う国は同社のネットワーク上で複数にわたる場合があります（要確認）。"
              : "同社は DPF の認証を受け、必要に応じて標準契約条項などを用いるとしています。"
          }`,
          `${R}Plus Five Five, Inc.（Resend の運営会社。メールの送信）：データを米国に移転して処理するとしています。所在国は米国（要確認）です。同社が講じる移転の措置の具体的な内容は、公表情報では確認できませんでした（要確認）。`,
          `${R}Stripe（決済。本物の課金を始めた後のみ）：日本の利用者に対する契約の相手方となる法人は（要確認）です。Stripe, Inc. の所在国は米国です。同社は APEC の CBPR と PRP に準拠し、DPF の認証を受け、個人情報保護委員会が日本と同等の水準と認めていない国に移転する場合には、移転先と書面で契約を結ぶとしています。Stripe には、決済の情報のほか、ライセンスキーと権利の ID を、顧客情報に付ける記録（メタデータ）として送ります。`,
          `${R}Slack Technologies Limited（Slack の通知。利用者が登録した場合のみ）：米国・カナダ以外のワークスペースについての事業者で、所在国はアイルランド（EU）です。EU は個人情報保護委員会が日本と同等の水準にあると認めた国・地域です。同社は標準契約条項を用い、APEC の CBPR と PRP に準拠するとしています。`,
          `${R}Vercel Inc.、OpenAI（OpenAI OpCo, LLC。日本の利用者に対する法人は（要確認））、Anthropic PBC（利用額の読み取りと停止。利用者が接続した会社のみ）：いずれも所在国は米国です。送るのは利用者ご自身のアカウントに対する API トークンと対象の ID です。各社が講じる措置は各社のプライバシーポリシーをご確認ください（要確認）。`,
        ],
      },
      {
        heading: "アクセス解析",
        body: ["ページの閲覧数などを日ごとに集計しますが、個人を識別する情報は記録しません。ログイン状態の保持にのみ Cookie を使用します。"],
      },
      { heading: "開示・削除の請求", body: [`ご本人からの開示・訂正・削除のご請求には、${c.links.supportEmail} にて対応します。`] },
      { heading: "制定日", body: [c.legal.effectiveDate] },
    ],
  }),
  en: (c) => ({
    title: "Privacy Policy",
    sections: [
      {
        heading: "What we collect",
        body: [
          `${c.name} ("the Service") handles the email you give when joining the waitlist, the email and purchase details provided by our payment processor, and your license key.`,
          `${R}If you use monitoring, we also handle: (1) API tokens for the providers you connect (Vercel, OpenAI, Anthropic), stored encrypted and shown only as a masked hint made of the provider's public prefix (for example, sk-ant-admin) and the last 4 characters; short tokens are fully masked; (2) the Slack incoming webhook URL you register; (3) the Vercel Spend Management webhook secret you register; (4) spend data: the latest spend snapshot for each connection and an activity log of alerts, stops and other events. We also store each connection's label, the team, project or workspace IDs it targets, its budget and its stop settings.`,
        ],
      },
      {
        heading: "Why",
        body: [
          "To provide the Service, send license keys and sign-in links, answer support requests, and announce the launch.",
          `${R}API tokens are used only to read your spend from the provider and to run the stop action you set up (in test mode, only to record it). The Slack webhook URL is used to send alerts, the Vercel webhook secret to verify that notifications really come from Vercel, and spend data to compare spend with your budget, show the dashboard, and decide on alerts and stops.`,
        ],
      },
      {
        heading: "Retention and deletion",
        body: [
          `${R}API tokens: kept until you delete the connection. Deleting a connection deletes its token (the encrypted value and the hint) at the same time. Deleting it here does not revoke the key, so revoke it in the provider's dashboard as well.`,
          `${R}Vercel webhook secret: kept until you remove it or delete the connection.`,
          `${R}Slack webhook URL: kept until you remove it. Deleting a connection does not delete it.`,
          `${R}Spend snapshots: only the latest one per connection, overwritten at every check and deleted with the connection.`,
          `${R}Activity log: only the latest 50 entries per account; older ones drop off. Deleting a connection also deletes its entries.`,
          `${R}When a subscription or trial (30 days) ends, monitoring stops. We keep the data above for 30 days after the end and then delete it.`,
          `${R}You can ask us to delete your whole account at any time at the contact below. We delete it within 7 days of your request and let you know when it is done.`,
          `${R}Purchase records: to meet the bookkeeping retention rules of Japanese tax law, records of real (paid) purchases are kept for 7 years, even after the deletions above (30 days after the end, or on your request); the period starts as tax law provides. We keep only the date and time, amount, plan and invoice number of each purchase, with as little information identifying you as possible, and delete them when the period is over. Demo purchases (with no charge) are not included.`,
          `${R}Minimal entitlement record: even after the deletion 30 days after the end (or on your request), we keep, for each purchase's entitlement, only its ID, status, plan, dates (created, updated, ended, deleted) and consent record. This is to prevent an entitlement from being created again from the same purchase, and to keep the record of your consent. Your email address and license key are not kept on the Service's servers. However, for real (paid) purchases, your license key and the entitlement ID remain in your customer record at our payment processor (Stripe) as part of the payment records. They are not removed by the Service's deletion (the deletion 30 days after the end, or on your request); how long Stripe keeps them is governed by Stripe's own terms. For real (paid) purchases it is kept until the purchase records of the same fiscal year are deleted (the 7 years above); for demo purchases, for 90 days. It is then deleted automatically.`,
          `${R}To prevent abuse, we keep IP addresses, and a hash of the email address a sign-in link is sent to (not the address itself), briefly for rate limiting only; they are deleted automatically within 10 minutes. Demo purchase records (email and the last 4 digits of the card) are deleted automatically after 1 hour if unpaid, or after 90 days if paid.`,
        ],
      },
      {
        heading: "Encryption and security",
        body: [
          `${R}API tokens, the Slack webhook URL and the Vercel webhook secret are encrypted with AES-256-GCM. Each ciphertext is bound to its connection (Slack: to the account), so it cannot be decrypted if copied elsewhere. The key is kept apart from the database, in the hosting provider's secret storage. These values are never shown again on screen or returned by the API.`,
          `${R}Spend data, the activity log, email addresses and similar data are stored without application-level encryption. Whether the storage provider encrypts them at rest is to be confirmed. Traffic is encrypted with HTTPS.`,
        ],
      },
      {
        heading: "Payments",
        body: [
          "Card details are handled by Stripe and never stored by the Service.",
          `${R}In demo mode (no real charges), the card number you enter is not sent anywhere; we keep only its last 4 digits.`,
        ],
      },
      {
        heading: "Processors",
        body: [
          `We use Upstash (storage), Resend (email) and ${hostingProvider()} (hosting), which may be located outside your country.`,
          `${R}On your instructions, we also send your API token and target IDs to the providers you connect (Vercel, OpenAI, Anthropic), and send alert content (connection label, spend, stop results and similar) to the Slack webhook you register. Once real billing starts, we use Stripe for payments.`,
        ],
      },
      {
        heading: "International transfers",
        body: [
          `${R}We entrust personal data to, or send it on your instructions to, the companies abroad listed below. We do so only with your prior consent, which we ask for at purchase and when you add a connection. The information below is what we give you when asking for that consent. Information on each country's personal data protection system is available in the Personal Information Protection Commission of Japan's survey of foreign systems (${PPC_FOREIGN}); for the US, see "United States (federal)" and the state entries. The measures listed for each company are taken from its published information, such as its privacy policy; we have not verified them individually.`,
          `${R}Upstash, Inc. (storage): located in the United States. Data is stored in the region we chose when deploying the Service (country to be confirmed). Upstash states that it is certified under the EU-U.S. Data Privacy Framework (DPF) and signs data transfer agreements such as Standard Contractual Clauses with its vendors.`,
          `${R}${hostingEntity()} (hosting): located in the United States. ${
            hostingProvider() === "Cloudflare"
              ? "Cloudflare states that it is certified under the APEC Cross-Border Privacy Rules (CBPR) and Privacy Recognition for Processors (PRP) systems and the DPF, and uses Standard Contractual Clauses. Processing may take place in several countries on its network (to be confirmed)."
              : "Vercel states that it is certified under the DPF and uses Standard Contractual Clauses or other mechanisms where required."
          }`,
          `${R}Plus Five Five, Inc. (operator of Resend; email delivery): states that it transfers data to and processes it in the United States. Location: United States (to be confirmed). The specific transfer safeguards it uses could not be confirmed from its published information (to be confirmed).`,
          `${R}Stripe (payments, only once real billing starts): the Stripe entity that contracts with users in Japan is to be confirmed. Stripe, Inc. is located in the United States. Stripe states that it complies with the APEC CBPR and PRP systems, is certified under the DPF, and signs written agreements with recipients when transferring data to countries the Personal Information Protection Commission has not recognised as equivalent. Besides the payment details, we send Stripe your license key and the entitlement ID, stored as metadata on your customer record.`,
          `${R}Slack Technologies Limited (Slack alerts, only if you register a webhook): the Slack entity for workspaces outside the US and Canada, located in Ireland (EU). The Personal Information Protection Commission recognises the EU as having a level of protection equivalent to Japan's. Slack states that it uses Standard Contractual Clauses and complies with the APEC CBPR and PRP systems.`,
          `${R}Vercel Inc., OpenAI (OpenAI OpCo, LLC; the entity for users in Japan is to be confirmed) and Anthropic PBC (reading spend and running stops, only for the providers you connect): all located in the United States. What we send is the API token and target IDs for your own account. See each provider's privacy policy for its measures (to be confirmed).`,
        ],
      },
      { heading: "Analytics", body: ["We count page views per day without identifying individuals. Cookies are used only to keep you signed in."] },
      { heading: "Your rights", body: [`To access or delete your data, contact ${c.links.supportEmail}.`] },
      { heading: "Effective date", body: [c.legal.effectiveDate] },
    ],
  }),
};
