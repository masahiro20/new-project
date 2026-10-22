import Link from "next/link";
import HomeStart from "./HomeStart";
import AerialReel from "./components/AerialReel";
import CountUp from "./components/CountUp";
import Marquee from "./components/Marquee";
import { RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";
import { CERTAINTY, CERTAINTY_HELP } from "@/lib/report";

const MARK = { 確定: "✓", 要確認: "!", 推測: "?" } as const;

const STATUTES = [
  "建築基準法 第43条 接道義務",
  "農地法 第5条 転用",
  "河川法 第26条 工作物の新築",
  "都市計画法 第29条 開発許可",
  "盛土規制法 第12条",
  "建築基準法 第56条 斜線制限",
  "文化財保護法 第93条",
  "建築基準法 第22条 屋根不燃区域",
  "土地改良法 第66条",
  "浄化槽法 第5条",
  "建築基準法 第52条 容積率",
  "不動産登記法 第37条 地目変更",
];

const CHECKS = ["農地", "川・水路", "接道", "調整区域", "がけ・擁壁", "浸水・地盤", "文化財", "上下水道", "境界", "都市計画道路", "防火・22条", "高さ・斜線"];

export default function HomePage() {
  const articleCount = new Set(RULES.flatMap((r) => r.cites.map((c) => `${c.law}:${c.article}`))).size;
  return (
    <>
      <section className="home-hero">
        <AerialReel />
        <div className="wrap hero-inner">
          <p className="kicker" data-reveal>
            <span className="kicker-dot" aria-hidden />
            HOMERANDIC LAND & LAW SCANNER
          </p>
          <h1 className="home-title">
            <span className="line" data-reveal style={{ ["--d" as string]: "0.05s" }}>
              土地を、
            </span>
            <span className="line accent" data-reveal style={{ ["--d" as string]: "0.18s" }}>
              スキャンする。
            </span>
          </h1>
          <p className="hero-lead" data-reveal style={{ ["--d" as string]: "0.3s" }}>
            住所を入れるだけ。用途地域・法令制限・役所への事前協議・案内図・法令制限確認書まで、一気に。
          </p>
          <div data-reveal style={{ ["--d" as string]: "0.42s" }}>
            <HomeStart />
          </div>
        </div>
        <a href="#outputs" className="scroll-cue" aria-label="下へ">
          <span />
        </a>
      </section>

      <Marquee items={STATUTES} />

      <section className="section-dark" id="outputs">
        <div className="wrap">
          <header className="sec-head" data-reveal>
            <p className="sec-no">OUTPUT</p>
            <h2>1回のスキャンで、ぜんぶ出る。</h2>
          </header>
          <div className="bento">
            <article className="tile tile-land" data-reveal style={{ ["--d" as string]: "0.05s" }}>
              <p className="tile-tag">LAND SHEET</p>
              <h3>土地のまとめ</h3>
              <p>用途地域・建蔽率／容積率・高さ・防火・農地・川・浸水・土砂・液状化を国のデータで数秒で。</p>
              <div className="mini-facts" aria-hidden>
                <span className="mf mf-ok">
                  <small>区域区分</small>市街化区域<em className="cert cert-確定">✓確定</em>
                </span>
                <span className="mf">
                  <small>用途地域</small>第一種住居<em className="cert cert-確定">✓確定</em>
                </span>
                <span className="mf mf-hot">
                  <small>農地</small>畑の可能性<em className="cert cert-推測">?推測</em>
                </span>
                <span className="mf mf-warn">
                  <small>浸水想定</small>0.5〜3.0m<em className="cert cert-確定">✓確定</em>
                </span>
              </div>
            </article>
            <article className="tile tile-check" data-reveal style={{ ["--d" as string]: "0.12s" }}>
              <p className="tile-tag">12 CHECKS</p>
              <h3>見落としチェック</h3>
              <p>後から発覚すると「建てられない・数か月遅れる」12項目を毎回すべて判定。</p>
              <ol className="check-dots" aria-hidden>
                {CHECKS.map((c, i) => (
                  <li key={c} style={{ ["--i" as string]: i }}>
                    {c}
                  </li>
                ))}
              </ol>
            </article>
            <article className="tile tile-map" data-reveal style={{ ["--d" as string]: "0.18s" }}>
              <img src="/api/annai?lat=35.2923&lon=136.9126&z=16&style=pale&bare=1&w=700&h=460" alt="" loading="lazy" />
              <span className="pulse" aria-hidden />
              <div className="tile-over">
                <p className="tile-tag">MAP</p>
                <h3>案内図</h3>
                <p>地図・航空写真をピン付きで自動作成。PNGで保存。</p>
              </div>
            </article>
            <article className="tile tile-xls" data-reveal style={{ ["--d" as string]: "0.24s" }}>
              <p className="tile-tag">EXCEL</p>
              <h3>法令制限確認書</h3>
              <p>社内書式（Ver1-2）のまま、用途地域・建蔽率・接道・チェック欄まで自動で記入。</p>
              <div className="xls" aria-hidden>
                {["用途地域", "建蔽率", "容積率", "防火", "接道", "備考"].map((k, i) => (
                  <div key={k} className="xls-row" style={{ ["--i" as string]: i }}>
                    <b>{k}</b>
                    <span />
                  </div>
                ))}
              </div>
            </article>
            <article className="tile tile-consult" data-reveal style={{ ["--d" as string]: "0.3s" }}>
              <p className="tile-tag">COUNTER</p>
              <h3>役所への事前協議</h3>
              <p>窓口ごとに「何を決める協議か・確認項目・持参資料・いつまでに」。</p>
              <ol className="mini-steps" aria-hidden>
                <li>農業委員会</li>
                <li>土木事務所 河川</li>
                <li>上下水道</li>
              </ol>
            </article>
            <article className="tile tile-task" data-reveal style={{ ["--d" as string]: "0.36s" }}>
              <p className="tile-tag">TASK / PDF</p>
              <h3>タスクとPDF</h3>
              <p>誰が・いつまでに・何をするか。PDFは出典番号つきの一覧表に。</p>
              <ul className="mini-tasks" aria-hidden>
                <li>登記事項証明書を取り直す</li>
                <li>5条届出の受付日を確認</li>
                <li>河川区域の境界を確認</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section-paper">
        <div className="wrap">
          <header className="sec-head" data-reveal>
            <p className="sec-no">HOW IT WORKS</p>
            <h2>使い方は3ステップ。</h2>
          </header>
          <ol className="flow">
            <li data-reveal style={{ ["--d" as string]: "0.05s" }}>
              <span className="flow-no">01</span>
              <strong>住所を入れる</strong>
              <p>その場で土地のまとめと案内図。</p>
            </li>
            <li data-reveal style={{ ["--d" as string]: "0.15s" }}>
              <span className="flow-no">02</span>
              <strong>何を建てるか一文で</strong>
              <p>登記簿・公図・測量図・写真があれば添付。</p>
            </li>
            <li data-reveal style={{ ["--d" as string]: "0.25s" }}>
              <span className="flow-no">03</span>
              <strong>AIで詳しくチェック</strong>
              <p>約3〜4分。条文と自治体の資料を確かめて、結論から表示。</p>
            </li>
          </ol>
          <div className="stats" data-reveal>
            <div>
              <strong>
                <CountUp to={RULES.length} />
              </strong>
              <span>法令ルール</span>
            </div>
            <div>
              <strong>
                <CountUp to={Object.keys(LAWS).length} />
              </strong>
              <span>法令</span>
            </div>
            <div>
              <strong>
                <CountUp to={articleCount} />
              </strong>
              <span>条文を照合</span>
            </div>
            <div>
              <strong>
                <CountUp to={12} />
              </strong>
              <span>見落としチェック</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-dark honesty">
        <div className="wrap narrow">
          <header className="sec-head center" data-reveal>
            <p className="sec-no">HONESTY</p>
            <h2>分からないことは、分からないと書く。</h2>
            <p className="sec-lead">すべての項目に「どれだけ確かか」と「出典」。推測を事実のようには書きません。</p>
          </header>
          <div className="trustgrid">
            {CERTAINTY.map((c, i) => (
              <div key={c} className={`trustcard cert-card-${c}`} data-reveal style={{ ["--d" as string]: `${0.08 * i}s` }}>
                <span className={`cert big cert-${c}`}>
                  <span aria-hidden>{MARK[c]}</span>
                  {c}
                </span>
                <p>{CERTAINTY_HELP[c]}</p>
              </div>
            ))}
          </div>
          <p className="hint center" data-reveal>
            出典は【条文】e-Gov法令検索・【公的】国と自治体の公式資料・【参考】それ以外の3種類で表示（<Link href="/rules">ルール一覧</Link>・<Link href="/sources">根拠と更新</Link>）。
          </p>
        </div>
      </section>

      <section className="section-signal">
        <div className="wrap claude-band" data-reveal>
          <div>
            <p className="sec-no dark">WITH CLAUDE</p>
            <h2>Claude の会話からも。</h2>
            <p>「ドライブの○○様フォルダの資料で法令チェックして、確認書も作って」と頼むと、登記簿・公図・測量図を読んで、このツールで調べて、Excelまで作ります。</p>
          </div>
          <div className="band-actions">
            <Link href="/claude" className="btn btn-ink">
              Claude とつなぐ
            </Link>
            <Link href="/consult" className="btn btn-ghost-ink">
              今すぐ調べる →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
