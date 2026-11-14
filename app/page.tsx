import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { siteUrl, SITE_NAME } from "@/lib/site";
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

export default function Home() {
  const price = priceJpy();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl(),
      description: "障害福祉サービス事業所向けに、虐待防止・身体拘束等適正化の年間書類をAIで作成するWebサービス。",
      offers: { "@type": "Offer", price, priceCurrency: "JPY" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  const ticker = ["年間実施計画", "虐待防止委員会 議事録", "議事次第", "研修資料", "理解度テスト", "研修実施記録", "身体拘束等適正化の指針", "委員会チェックリスト", "記録様式", "家族への説明書"];
  const penalties = [
    { prefix: "", value: 1, name: "虐待防止措置未実施減算", text: "委員会・研修・担当者のどれか一つでも欠けると対象です。" },
    { prefix: "最大", value: 10, name: "身体拘束廃止未実施減算", text: "施設・居住系は10%、訪問・通所系は1%。拘束をしていなくても体制が必要です。" },
    { prefix: "最大", value: 3, name: "業務継続計画未策定減算", text: "感染症・災害のBCPが未策定の場合に対象になります。" },
  ];
  const sets = [
    { name: "虐待防止委員会セット", items: ["年間実施計画表", "議事次第", "会議メモから清書した議事録"] },
    { name: "虐待防止研修セット", items: ["研修資料（スライド原稿）", "理解度テスト10問と解説", "研修実施記録の様式"] },
    { name: "身体拘束等適正化セット", items: ["適正化のための指針", "委員会のチェックリスト", "記録様式と家族への説明書"] },
  ];
  const steps = [
    { title: "入力する", text: "サービス種別、職員数、利用者の特性、委員会のメモなど（約3分）" },
    { title: "無料で確かめる", text: "年間実施計画を無料で作成して、内容を確認" },
    { title: "まとめて作成", text: "お支払い後、3つの書類セットを同時に作成（数分）" },
    { title: "Wordで仕上げる", text: "保存して、事業所の実情に合わせて調整・印刷" },
  ];
  const fx = (i: number) => ({ "--i": i }) as React.CSSProperties;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">障害福祉サービス事業所向け</p>
            <h1>
              <span className="line" style={fx(0)}><span>虐待防止・身体拘束</span></span>
              <span className="line" style={fx(1)}><span>適正化の書類を、</span></span>
              <span className="line" style={fx(2)}><span>AIで<em>年間分まとめて</em>。</span></span>
            </h1>
            <p className="lead">
              委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針まで。事業所の情報を入力するだけで、運営指導で確認される書類一式がそろいます。
            </p>
            <div className="actions">
              <Link href="/generate" className="btn">無料で年間計画を作る</Link>
              <Link href="/check" className="btn secondary">減算リスクを1分で診断</Link>
            </div>
          </div>
          <div className="stack" aria-hidden="true">
            <div className="paper">
              <span className="paper-no">様式 03</span>
              <div className="paper-title">身体拘束等適正化の指針</div>
            </div>
            <div className="paper">
              <span className="paper-no">様式 02</span>
              <div className="paper-title">虐待防止研修 資料</div>
            </div>
            <div className="paper">
              <span className="paper-no">様式 01</span>
              <div className="paper-title">虐待防止委員会 議事録</div>
              {[["開催日", "46%"], ["出席者", "78%"], ["検討内容", "92%"], ["", "64%"], ["決定事項", "84%"], ["周知方法", "52%"]].map(([label, w], i) => (
                <div className="paper-row" key={i}>
                  <span>{label}</span>
                  <i style={{ "--w": w, "--i": i } as React.CSSProperties} />
                </div>
              ))}
              <div className="stamp">整備<br />済</div>
            </div>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...ticker, ...ticker].map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      <section>
        <div className="wrap">
          <p className="sec-label" data-fx><b>01</b>減算の現状</p>
          <h2 data-fx>書類がないだけで、毎月の報酬が減ります</h2>
          <p className="lead" data-fx>令和6年度の報酬改定で、体制が整っていない事業所への減算が強化されました。</p>
          <div className="ledger">
            {penalties.map((p, i) => (
              <div className="ledger-row" key={p.name} data-fx="left" style={fx(i)}>
                <div className="ledger-num">
                  {p.prefix && <small>{p.prefix}</small>}
                  <span data-count={p.value}>{p.value}</span>
                  <i>%</i>
                </div>
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <p className="sec-label" data-fx><b>02</b>作成できる書類</p>
          <h2 data-fx>運営指導で確認される3つのセット</h2>
          <div className="sheets">
            {sets.map((s, i) => (
              <div className="sheet" key={s.name} data-fx="tilt" style={fx(i)}>
                <div className="sheet-no">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.name}</h3>
                <ul>{s.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <p className="sec-label" data-fx><b>03</b>使い方</p>
          <h2 data-fx>入力から印刷まで、4つの手順</h2>
          <ol className="flow">
            {steps.map((s, i) => (
              <li key={s.title} data-fx style={fx(i)}>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <p className="sec-label" data-fx><b>04</b>料金</p>
          <div className="price-box" data-fx>
            <div className="stamp">月額<br />なし</div>
            <p className="price">
              {price.toLocaleString()}<small>円</small>
            </p>
            <p>税込・1事業所・年間セット。必要なときに1回払いで作成できます。</p>
            <div className="actions">
              <Link href="/generate" className="btn">書類を作る</Link>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <p className="sec-label" data-fx><b>05</b>よくある質問</p>
          {FAQ.map((f, i) => (
            <details key={f.q} data-fx style={fx(i)}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <p className="sec-label" data-fx><b>06</b>解説</p>
          <h2 data-fx>減算・書類・事業所運営の解説</h2>
          <ul className="index-list">
            {GUIDES.map((g, i) => (
              <li key={g.slug} data-fx style={fx(i % 4)}>
                <Link href={`/guide/${g.slug}`}>
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <span>{g.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
