import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { SceneArt } from "@/components/SceneArt";
import { BREEDS, shortName } from "@/lib/breeds";
import { RELATION_BY_ID } from "@/lib/relations";
import type { RelationId } from "@/lib/scenes";

const SAMPLES: { rel: RelationId; variant: number; breed: string; cat: number; human: number; hair: "short" | "bob" | "bun" | "spiky"; shirt: string }[] = [
  { rel: "king", variant: 0, breed: "chatora", cat: 1, human: 0, hair: "short", shirt: "#7ec8e3" },
  { rel: "lovers", variant: 1, breed: "ragdoll", cat: 0, human: 2, hair: "bob", shirt: "#ff9ec4" },
  { rel: "oshi", variant: 0, breed: "scottish", cat: 0, human: 0, hair: "bun", shirt: "#b48cff" },
  { rel: "partner", variant: 2, breed: "kuro", cat: 0, human: 2, hair: "spiky", shirt: "#ffd34d" },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="cats">
          <CatArt className="c1" breed="scottish" uid="h1" traits={{ blush: true }} />
          <CatArt className="c2" breed="mike" uid="h2" traits={{ crown: true, open: true }} />
          <CatArt className="c3" breed="kuro" uid="h3" traits={{ wink: true }} />
        </div>
        <p className="bubble">うちらって、どういう関係…？</p>
        <h1>
          うちの猫様と、<br />
          <em>ほんとうは</em><br />どんな関係？
        </h1>
        <p className="lead">
          うちの子をえらんで、12の「もしも」の質問に答えるだけ。ふたりの関係を、<b>オリジナルのイラスト</b>にしてお届けします。
        </p>
        <Link href="/chosa" className="btn big">関係を鑑定してみる 🐾</Link>
        <p className="note">無料・登録なし・約2分</p>
      </section>

      <section className="section">
        <h2><small>RESULT</small>こんなイラストが届きます</h2>
        <div className="carousel" tabIndex={0} aria-label="結果イラストの例">
          {SAMPLES.map((s, i) => {
            const r = RELATION_BY_ID.get(s.rel)!;
            return (
              <figure key={s.rel} className="sample">
                <SceneArt rel={s.rel} variant={s.variant} breed={s.breed} traits={{}} human={{ hair: s.hair, shirt: s.shirt }} uid={`ex${i}`} catLine={r.catLines[s.cat]} humanLine={r.humanLines[s.human]} />
                <figcaption><b>{r.name}</b>{BREEDS.find((b) => b.id === s.breed)?.label}の場合</figcaption>
              </figure>
            );
          })}
        </div>
        <p className="center-note">関係は12タイプ × 絵のパターンいろいろ。猫種・セリフ・服の色まで、ひとりひとり変わります。</p>
      </section>

      <section className="section">
        <h2><small>20 CATS</small>柄でも、猫種でも</h2>
        <div className="mini-breeds">
          {BREEDS.map((b) => (
            <div key={b.id} className="mini">
              <CatArt breed={b.id} uid={`m-${b.id}`} />
              <span>{shortName(b)}</span>
            </div>
          ))}
        </div>
        <p className="center-note">猫種ごとに、その子らしさを生かした専用の質問が入ります。</p>
      </section>

      <section className="section">
        <h2><small>HOW IT WORKS</small>鑑定のながれ</h2>
        <ol className="steps">
          <li><span className="em" aria-hidden="true">🐱</span><div><b>うちの子をえらぶ</b><span>柄8種・猫種12種から。名前も入れられます。</span></div></li>
          <li><span className="em" aria-hidden="true">🔮</span><div><b>12の「もしも」に答える</b><span>「猫様が突然しゃべったら？」など。選ぶとどうなるかは、お楽しみ。</span></div></li>
          <li><span className="em" aria-hidden="true">🎨</span><div><b>ふたりのイラストが届く</b><span>画像で保存して、Instagram・X・LINEでシェアできます。</span></div></li>
        </ol>
        <p style={{ marginTop: 28, textAlign: "center" }}>
          <Link href="/chosa" className="btn big">さっそく鑑定する 🐾</Link>
        </p>
      </section>
    </>
  );
}
