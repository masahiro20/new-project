import Link from "next/link";
import { CatMark } from "@/components/CatMark";
import { CAT_TYPES } from "@/lib/types";

export default function Home() {
  const sample = CAT_TYPES.filter((t) => ["HHHH", "LHLL", "HLHL", "LLLH"].includes(t.code));
  return (
    <>
      <section className="hero">
        <CatMark className="cat" />
        <p className="eyebrow">関係性鑑定課</p>
        <h1>
          うちの猫は、<br />
          <em>飼い主を何だと思っている</em>のか。
        </h1>
        <p className="lead">
          16の「事情聴取」に答えるだけで、あなたと猫様の主従関係を、公式っぽい<b>鑑定調書</b>として発行します。下僕等級は、果たして何等級でしょうか。
        </p>
        <Link href="/chosa" className="btn big">事情聴取を受ける（約3分）</Link>
        <p className="note">登録不要・無料。入力した名前はサーバーに保存されません。</p>
      </section>

      <section className="section">
        <h2>調書ができるまで</h2>
        <ol className="steps">
          <li><b>事情聴取に答える</b><span>「深夜3時に鳴かれたら？」など、あるあるの場面を16問。選ぶだけです。</span></li>
          <li><b>鑑定調書が発行される</b><span>タイプ・下僕等級・猫様の支配率・決定的証拠まで、1枚の書類にまとめます。</span></li>
          <li><b>画像で保存して、見せ合う</b><span>調書は画像で保存できます。友達に挑戦状を送って、下僕力を比べることも。</span></li>
        </ol>
      </section>

      <section className="section">
        <h2>判定タイプの一例 <small>全16タイプ</small></h2>
        <div className="cards">
          {sample.map((t) => (
            <Link key={t.code} href={`/types#${t.code}`} className="card" style={{ textDecoration: "none" }}>
              <h3>{t.name}</h3>
              <p>{t.catch}</p>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/types" className="btn ghost small">16タイプをすべて見る</Link>
        </p>
      </section>

      <section className="section">
        <h2>調べているのは、4つのこと</h2>
        <div className="cards">
          <div className="card"><h3>君臨度</h3><p>家の序列で、どちらが上か。</p></div>
          <div className="card"><h3>甘え度</h3><p>どれだけ下僕を必要としているか。</p></div>
          <div className="card"><h3>気まぐれ度</h3><p>機嫌の予測しやすさ。</p></div>
          <div className="card"><h3>要求度</h3><p>下僕に命じる頻度と熱量。</p></div>
        </div>
        <p style={{ marginTop: 24, textAlign: "center" }}>
          <Link href="/chosa" className="btn">さっそく聴取を受ける</Link>
        </p>
      </section>
    </>
  );
}
