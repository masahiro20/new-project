import Image from "next/image";
import Link from "next/link";
import heroArt from "./hero.svg";
import { SERVICE_GUIDES, TOPIC_GUIDES } from "@/lib/guides";
import { siteUrl, SITE_NAME } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonld";
import { aiEnabled, COMING_SOON, demoPurchase, salesEnabled } from "@/lib/launch";
import { DEMO_BANNER } from "@/lib/payments/mode";
import { priceJpy } from "@/lib/stripe";

const FAQ = [
  {
    q: "実際に委員会を開いていなくても議事録を作れますか？",
    a: "できません。議事録は、実際に開催した委員会のメモをもとに清書する機能です。開催していない会議の記録を作ることは不正にあたります。メモがない場合は、記入欄付きの様式を作成します。",
  },
  {
    q: "どのサービス種別に対応していますか？",
    a: "放課後等デイサービス、児童発達支援、就労継続支援A型・B型、就労移行支援、生活介護、共同生活援助、居宅介護など、障害福祉サービス全般に対応しています。サービス種別に合わせて、研修の事例や指針の表現を調整します。",
  },
  {
    q: "利用者の個人情報を入力する必要はありますか？",
    a: "必要ありません。事業所の情報と、個人が特定されない形の課題メモだけで作成できます。入力内容はサーバーに保存しません。",
  },
  {
    q: "作成した書類はWordで編集できますか？",
    a: "はい。Word形式（.docx）で保存でき、事業所の様式に合わせて自由に編集できます。印刷やコピーにも対応しています。",
  },
  {
    q: "支払い方法は？",
    a: "クレジットカード決済（Stripe）に対応しています。1回のお支払いで、1事業所分の年間書類セットを作成できます。",
  },
];

const FREE_FAQ = {
  q: "料金はかかりますか？",
  a: "減算リスク診断、サービス種別ごとの解説、書類サンプル（Word保存を含む）は無料でお使いいただけます。3つの書類セットをまとめて作る有料版は準備中です。",
};

export default function Home() {
  const price = priceJpy();
  const sales = salesEnabled();
  const ai = aiEnabled();
  const demo = demoPurchase();
  const faq = sales ? FAQ : FAQ.map((f) => (f.q === "支払い方法は？" ? FREE_FAQ : f));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl(),
      description: "障害福祉サービス事業所向けに、虐待防止・身体拘束等適正化の年間書類をAIで作成するWebサービス。",
      offers: { "@type": "Offer", price: sales ? price : 0, priceCurrency: "JPY" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">障害福祉サービス事業所向け</p>
            <h1>
              虐待防止・身体拘束適正化の書類、
              <br />
              AIで年間分まとめて作成。
            </h1>
            <p className="lead">
              委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針まで。事業所の情報を入力するだけで、運営指導で確認される書類一式がそろいます。
            </p>
            <div className="actions">
              {ai ? (
                <>
                  <Link href="/generate" className="btn">無料で年間計画を作る</Link>
                  <Link href="/check" className="btn secondary">減算リスクを1分で診断</Link>
                </>
              ) : (
                <>
                  <Link href="/check" className="btn">減算リスクを1分で診断</Link>
                  <Link href="/samples" className="btn secondary">書類サンプルを見る（無料）</Link>
                </>
              )}
            </div>
          </div>
          {/* Decorative: the headline already says what the picture shows. */}
          <Image src={heroArt} alt="" priority className="hero-art" sizes="(max-width: 860px) 100vw, 460px" />
        </div>
      </section>

      <section style={{ background: "var(--surface)" }}>
        <div className="wrap">
          <h2>書類がないだけで、毎月の報酬が減ります</h2>
          <p className="lead">令和6年度の報酬改定で、体制が整っていない事業所への減算が強化されました。</p>
          <div className="grid" style={{ marginTop: 24 }}>
            <div className="card">
              <div className="stat">1%</div>
              <h3>虐待防止措置未実施減算</h3>
              <p>委員会・研修・担当者のどれか一つでも欠けると対象です。</p>
            </div>
            <div className="card">
              <div className="stat">最大10%</div>
              <h3>身体拘束廃止未実施減算</h3>
              <p>施設・居住系は10%、訪問・通所系は1%。拘束をしていなくても体制が必要です。</p>
            </div>
            <div className="card">
              <div className="stat">最大3%</div>
              <h3>業務継続計画未策定減算</h3>
              <p>感染症・災害のBCPが未策定の場合に対象になります。</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>作成できる書類</h2>
          <div className="grid">
            <div className="card">
              <h3>虐待防止委員会セット</h3>
              <p>年間実施計画表、議事次第、会議メモから清書した議事録</p>
            </div>
            <div className="card">
              <h3>虐待防止研修セット</h3>
              <p>研修資料（スライド原稿）、理解度テスト10問と解説、研修実施記録の様式</p>
            </div>
            <div className="card">
              <h3>身体拘束等適正化セット</h3>
              <p>適正化のための指針、委員会のチェックリスト、記録様式と家族への説明書</p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--surface)" }}>
        <div className="wrap">
          <h2>使い方</h2>
          {!ai && <p className="notice">{COMING_SOON.ai}</p>}
          <ol className="steps">
            <li>サービス種別、職員数、利用者の特性、委員会のメモなどを入力（約3分）</li>
            <li>年間実施計画を無料で作成して、内容を確認</li>
            <li>{sales ? "お支払い後、3つの書類セットを同時に作成（数分）" : "3つの書類セットの一括作成（有料版・準備中）"}</li>
            <li>Wordで保存して、事業所の実情に合わせて調整・印刷</li>
          </ol>
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <h2>料金</h2>
          {sales ? (
            <div className="card">
              <p className="price">
                {price.toLocaleString()}円 <small>（税込・1事業所・年間セット）</small>
              </p>
              <p>月額契約はありません。必要なときに1回払いで作成できます。</p>
              {demo && <p className="notice" style={{ marginTop: 12 }}>{DEMO_BANNER}。テストカードで購入の流れを体験できます。</p>}
              <div className="actions">
                {ai ? (
                  <Link href="/generate" className="btn">{demo ? "デモで書類を作る" : "書類を作る"}</Link>
                ) : (
                  demo && <Link href="/checkout/demo" className="btn">デモで購入を体験する</Link>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <p className="price">無料</p>
              <p>減算リスク診断、解説、書類サンプル（Word保存）は無料です。{COMING_SOON.paid}</p>
              <div className="actions">
                <Link href="/samples" className="btn">書類サンプルを見る</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <h2>よくある質問</h2>
          {faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <h2>減算と書類の解説</h2>
          <ul>
            {TOPIC_GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`}>{g.title}</Link>
              </li>
            ))}
          </ul>
          <h3>サービス種別ごとの解説</h3>
          <p>
            {SERVICE_GUIDES.map((g, i) => (
              <span key={g.slug}>
                {i > 0 && "／"}
                <Link href={`/guide/${g.slug}`}>{g.serviceType}</Link>
              </span>
            ))}
          </p>
          <p>
            書類の完成イメージは<Link href="/samples">無料の書類サンプル</Link>で確認できます。
          </p>
        </div>
      </section>
    </>
  );
}
