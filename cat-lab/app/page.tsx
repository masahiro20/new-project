import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { CAT_TYPES } from "@/lib/types";

const SHOW = [
  { code: "HHHH", coat: "chatora" },
  { code: "LHLL", coat: "mike" },
  { code: "HLHL", coat: "kuro" },
  { code: "LLHH", coat: "sabashiro" },
];

export default function Home() {
  const sample = SHOW.map((s) => ({ ...s, type: CAT_TYPES.find((t) => t.code === s.code)! }));
  return (
    <>
      <section className="hero">
        <div className="cats">
          <CatArt className="c1" coat="mike" uid="h1" traits={{ blush: true }} />
          <CatArt className="c2" coat="chatora" uid="h2" traits={{ crown: true, open: true }} />
          <CatArt className="c3" coat="kuro" uid="h3" traits={{ wink: true }} />
        </div>
        <p className="bubble">もしかして、私が下僕…？</p>
        <h1>
          うちの猫様、<br />
          あなたを<em>下僕</em>だと<br />思ってる？
        </h1>
        <p className="lead">
          16の質問に答えるだけ。あなたと猫様の主従関係を、公式っぽい<b>鑑定調書</b>にしてお届けします。下僕等級は、はたして何等級？
        </p>
        <Link href="/chosa" className="btn big">主従関係を調べてみる 🐾</Link>
        <p className="note">無料・登録なし・約3分</p>
      </section>

      <section className="section">
        <h2><small>HOW IT WORKS</small>調書ができるまで</h2>
        <ol className="steps">
          <li><span className="em" aria-hidden="true">🐱</span><div><b>毛柄をえらんで、16の質問に答える</b><span>「深夜3時に鳴かれたら？」など、あるあるの場面を選ぶだけ。</span></div></li>
          <li><span className="em" aria-hidden="true">📜</span><div><b>うちの子の鑑定調書ができあがる</b><span>タイプ・下僕等級・支配率・決定的証拠。猫様の絵つきです。</span></div></li>
          <li><span className="em" aria-hidden="true">📣</span><div><b>画像で保存して、見せ合う</b><span>友達に挑戦状を送って、下僕力を比べることもできます。</span></div></li>
        </ol>
      </section>

      <section className="section">
        <h2><small>16 TYPES</small>どの猫様かな？</h2>
        <div className="grid2">
          {sample.map((s) => (
            <Link key={s.code} href={`/types#${s.code}`} className="card center">
              <CatArt
                coat={s.coat}
                uid={`s-${s.code}`}
                traits={{ crown: s.code[0] === "H", blush: s.code[1] === "H", wink: s.code[2] === "H", open: s.code[3] === "H" }}
              />
              <h3>{s.type.name}</h3>
              <p>{s.type.catch}</p>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 22, textAlign: "center" }}>
          <Link href="/types" className="btn ghost small">16タイプをぜんぶ見る</Link>
        </p>
      </section>

      <section className="section">
        <h2><small>4 INDICATORS</small>調べているのは、この4つ</h2>
        <div className="grid2 axis-cards">
          <div className="card"><p className="ico" aria-hidden="true">👑</p><h3>君臨度</h3><p>家の中で、どっちが偉いか。</p></div>
          <div className="card"><p className="ico" aria-hidden="true">💗</p><h3>甘え度</h3><p>どれだけ下僕が必要か。</p></div>
          <div className="card"><p className="ico" aria-hidden="true">🎲</p><h3>気まぐれ度</h3><p>機嫌の読みやすさ。</p></div>
          <div className="card"><p className="ico" aria-hidden="true">📣</p><h3>要求度</h3><p>下僕に命じる頻度と熱量。</p></div>
        </div>
        <p style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>
          高いほど、猫様の絵にも特徴が出ます（王冠・ほっぺ・ウインク・鳴き顔）。
        </p>
        <p style={{ marginTop: 26, textAlign: "center" }}>
          <Link href="/chosa" className="btn big">さっそく調べる 🐾</Link>
        </p>
      </section>
    </>
  );
}
