import Link from "next/link";
import HomeStart from "./HomeStart";
import { RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";
import { CERTAINTY, CERTAINTY_HELP } from "@/lib/report";

const SAMPLE: { label: string; value: string; cert: "確定" | "推測" | "入力"; tone: string }[] = [
  { label: "区域区分", value: "市街化区域", cert: "確定", tone: "ok" },
  { label: "用途地域", value: "第一種住居地域", cert: "確定", tone: "info" },
  { label: "農地", value: "現況が畑の可能性", cert: "推測", tone: "danger" },
  { label: "川・水路", value: "約5m先", cert: "推測", tone: "danger" },
  { label: "浸水想定", value: "0.5〜3.0m", cert: "確定", tone: "warn" },
  { label: "前面道路", value: "幅員5.55m", cert: "入力", tone: "info" },
];
const MARK = { 確定: "✓", 要確認: "!", 推測: "?", 入力: "✎" } as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const FEATURES = [
  { icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6", title: "土地のまとめ", text: "用途地域・建蔽率／容積率・高さ制限・防火・農地・川・浸水・土砂・液状化を、住所から数秒で。" },
  { icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11", title: "見落としチェック12項目", text: "農地転用・河川・水路を挟む接道・調整区域・がけ・文化財など、後から発覚すると困る点を必ず評価。" },
  { icon: "M3 7h18M3 12h18M3 17h12M17 17l2 2 3-4", title: "役所への事前協議", text: "窓口ごとに「何を決める協議か」「確認項目」「持参資料」「いつまでに」を一覧に。" },
  { icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5", title: "タスクとPDF", text: "担当・時期つきのタスク一覧（CSVにも）。PDFで保存すると、出典番号つきの一覧表になります。" },
];

export default function HomePage() {
  const articleCount = new Set(RULES.flatMap((r) => r.cites.map((c) => `${c.law}:${c.article}`))).size;
  return (
    <>
      <section className="home-hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">社内用・建築／土地の法令チェック</p>
            <h1 className="home-title">
              住所を入れるだけで、
              <br />
              その土地の<em>注意点</em>と<em>役所に聞くこと</em>が分かる。
            </h1>
            <p className="lead">国のデータで土地を即時に調べ、AIが条文と自治体の資料を確かめて、出典付きでまとめます。</p>
            <HomeStart />
            <p className="hint start-sub">
              住所がまだ決まっていない場合は <Link href="/consult">計画だけで始める</Link>。Claude の会話からも使えます（<Link href="/claude">Claude連携</Link>）。
            </p>
          </div>

          <div className="preview" aria-label="結果の見本">
            <div className="preview-top">
              <span className="preview-tag">見本</span>
              <span className="preview-verdict">結論：条件付きで建築可能</span>
            </div>
            <div className="preview-grid">
              {SAMPLE.map((s) => (
                <div key={s.label} className={`fact tone-${s.tone}`}>
                  <div className="fact-top">
                    <span className="fact-label">{s.label}</span>
                    <span className={`cert cert-${s.cert}`}>
                      <span aria-hidden>{MARK[s.cert]}</span>
                      {s.cert}
                    </span>
                  </div>
                  <div className="fact-value">{s.value}</div>
                </div>
              ))}
            </div>
            <ol className="preview-list">
              <li>
                <span className="pill tone-danger">該当</span>農地法5条の届出（受理まで造成不可）
              </li>
              <li>
                <span className="pill tone-warn">可能性あり</span>水路の官民境界と河川区域の確認
              </li>
              <li>
                <span className="pill tone-info">要確認</span>下水道の区域・放流先
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2 className="center">1回のチェックで分かること</h2>
          <div className="features">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature">
                <span className="feature-icon">
                  <Icon d={f.icon} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2 className="center">使い方は3ステップ</h2>
          <ol className="howto">
            <li>
              <span>1</span>
              <strong>住所を入れる</strong>
              <small>その場で土地のまとめが出ます</small>
            </li>
            <li>
              <span>2</span>
              <strong>何を建てるか一文で</strong>
              <small>登記簿・公図・写真があれば添付</small>
            </li>
            <li>
              <span>3</span>
              <strong>AIで詳しくチェック</strong>
              <small>約3〜4分。結論から順に表示</small>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <h2 className="center">分からないことは、分からないと書きます</h2>
          <p className="center muted">すべての項目に「どれだけ確かか」と「出典」を付けます。推測を事実のようには書きません。</p>
          <div className="trustgrid">
            {CERTAINTY.map((c) => (
              <div key={c} className={`trustcard cert-card-${c}`}>
                <span className={`cert cert-${c}`}>
                  <span aria-hidden>{MARK[c]}</span>
                  {c}
                </span>
                <p>{CERTAINTY_HELP[c]}</p>
              </div>
            ))}
          </div>
          <p className="hint center">
            出典は【条文】e-Gov法令検索の現行条文、【公的】国・自治体の公式資料、【参考】それ以外、の3種類で表示します。知識ベース：{RULES.length}ルール・{Object.keys(LAWS).length}法令・{articleCount}条文（<Link href="/rules">一覧</Link>・<Link href="/sources">根拠と更新</Link>）。
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap narrow center">
          <h2>Claude の会話からも使えます</h2>
          <p className="muted">「ドライブの「○○様」フォルダの資料をもとに法令チェックして」と頼むと、登記簿・公図・測量図を読んでこのツールで確認します。</p>
          <div className="actions" style={{ justifyContent: "center" }}>
            <Link href="/claude" className="btn secondary">Claude とつなぐ方法</Link>
            <Link href="/consult" className="btn">今すぐチェックする</Link>
          </div>
          <p className="hint" style={{ marginTop: 24 }}>
            条例（がけ条例・日影・景観など）は自治体ごとに異なるため、見つかれば出典を示し、なければ確認先の窓口を示します。建築確認・許可の可否を保証するものではありません。入力内容はサーバーに保存しません。
          </p>
        </div>
      </section>
    </>
  );
}
