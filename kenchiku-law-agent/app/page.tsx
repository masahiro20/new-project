import Link from "next/link";
import HomeStart from "./HomeStart";
import { RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";
import { CERTAINTY, CERTAINTY_HELP } from "@/lib/report";

const MARK = { 確定: "✓", 要確認: "!", 推測: "?" } as const;

const OUTPUTS = [
  { title: "土地のまとめ", text: "区域区分・用途地域・建蔽率／容積率・高さ・防火・農地・川・浸水・土砂・液状化を、国の公開データから。", tag: "数秒" },
  { title: "見落としチェック", text: "後から発覚すると「建てられない・数か月遅れる」12項目を、毎回すべて判定。", tag: "12項目" },
  { title: "案内図・公図", text: "地図と航空写真の案内図をピン付きで。公図は法務省の地図データを地番で照合。", tag: "PNG" },
  { title: "役所への事前協議", text: "窓口ごとに、何を決める協議か・確認項目・持参資料・いつまでに。", tag: "窓口別" },
  { title: "タスク一覧・PDF", text: "誰が・いつまでに・何をするか。PDFは出典番号つきの一覧表に。", tag: "PDF / CSV" },
  { title: "法令制限確認書", text: "社内書式（Ver1-2）のまま、用途地域・建蔽率・接道・チェック欄まで記入。", tag: "Excel" },
];

const FLOW = [
  { title: "住所を入れる", text: "その場で土地のまとめ・案内図・公図が出ます。地番まで入れると公図を照合します。" },
  { title: "何を建てるかを一文で", text: "登記簿・公図・測量図・現地写真があれば添付。分からない項目は空欄のままで大丈夫です。" },
  { title: "AIで詳しくチェック", text: "約3〜4分。条文と自治体の資料を確かめて、結論から表示。確認書のExcelまで作れます。" },
];

export default function HomePage() {
  const articleCount = new Set(RULES.flatMap((r) => r.cites.map((c) => `${c.law}:${c.article}`))).size;
  return (
    <>
      <section className="home-hero">
        <div className="hero-inner">
          <p className="hero-en" data-reveal>
            Land &amp; Law Survey
          </p>
          <h1 className="home-title" data-reveal style={{ ["--d" as string]: "0.12s" }}>
            <span>土地を、</span>
            <span>読み解く。</span>
          </h1>
          <p className="hero-lead" data-reveal style={{ ["--d" as string]: "0.24s" }}>
            住所ひとつから、法令制限・役所への協議・案内図・確認書まで。
          </p>
          <div className="hero-start" data-reveal style={{ ["--d" as string]: "0.36s" }}>
            <HomeStart />
          </div>
        </div>
        <ul className="medals" data-reveal style={{ ["--d" as string]: "0.5s" }}>
          <li>
            <small>法令ルール</small>
            <strong>{RULES.length}</strong>
            <span>項目</span>
          </li>
          <li>
            <small>照合する条文</small>
            <strong>{articleCount}</strong>
            <span>条</span>
          </li>
          <li>
            <small>確認書</small>
            <strong>Excel</strong>
            <span>一括作成</span>
          </li>
        </ul>
      </section>

      <div className="sheet sheet-home">
        <section className="hp-sec" id="service">
          <header className="hp-head" data-reveal>
            <p className="hp-en">Service</p>
            <h2>一度の調査でそろうもの</h2>
          </header>
          <div className="service">
            <figure className="service-fig" data-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/annai?lat=35.2885&lon=136.9255&z=17&style=photo&w=900&h=600&fmt=jpg" alt="自動で作る案内図（航空写真）の例" loading="lazy" />
              <figcaption>案内図（航空写真）の自動作成例。出典：国土地理院 地理院タイル</figcaption>
            </figure>
            <dl className="service-list">
              {OUTPUTS.map((o, i) => (
                <div key={o.title} data-reveal style={{ ["--d" as string]: `${0.05 * i}s` }}>
                  <dt>
                    <span className="service-no">{String(i + 1).padStart(2, "0")}</span>
                    {o.title}
                    <em>{o.tag}</em>
                  </dt>
                  <dd>{o.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="more-link" data-reveal>
            <Link href="/consult">土地を調べる</Link>
          </p>
        </section>

        <section className="hp-sec" id="flow">
          <header className="hp-head" data-reveal>
            <p className="hp-en">Flow</p>
            <h2>ご利用の流れ</h2>
          </header>
          <ol className="flow">
            {FLOW.map((f, i) => (
              <li key={f.title} data-reveal style={{ ["--d" as string]: `${0.08 * i}s` }}>
                <span className="flow-no">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="hp-sec" id="policy">
          <header className="hp-head" data-reveal>
            <p className="hp-en">Policy</p>
            <h2>分からないことは、分からないと書く</h2>
          </header>
          <p className="hp-lead" data-reveal>
            すべての項目に「どれだけ確かか」と「出典」を付けます。推測を事実のようには書きません。
          </p>
          <dl className="hp-box" data-reveal>
            {CERTAINTY.map((c) => (
              <div key={c}>
                <dt>
                  <span className={`cert cert-${c}`}>
                    <span aria-hidden>{MARK[c]}</span>
                    {c}
                  </span>
                </dt>
                <dd>{CERTAINTY_HELP[c]}</dd>
              </div>
            ))}
          </dl>
          <p className="hint" data-reveal>
            出典は【条文】e-Gov法令検索・【公的】国と自治体の公式資料・【参考】それ以外の3種類で表示します。{Object.keys(LAWS).length}本の法令を参照しています。
          </p>
          <p className="more-link" data-reveal>
            <Link href="/sources">根拠と更新</Link>
            <Link href="/rules">知識ベース</Link>
          </p>
        </section>

        <section className="hp-sec hp-claude" id="claude">
          <header className="hp-head" data-reveal>
            <p className="hp-en">With Claude</p>
            <h2>Claude の会話からも</h2>
          </header>
          <p className="hp-lead" data-reveal>
            「ドライブの○○様フォルダの資料で法令チェックして、確認書も作って」と頼むと、登記簿・公図・測量図を読んで、このツールで調べて、Excelまで作ります。
          </p>
          <div className="band-actions" data-reveal>
            <Link href="/claude" className="btn btn-ink">
              Claude とつなぐ<span aria-hidden>➤</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
