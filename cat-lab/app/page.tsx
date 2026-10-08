import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { SampleCards } from "@/components/SampleCards";
import { BREEDS, shortName } from "@/lib/breeds";
import type { CardData } from "@/lib/card";
import { RELATION_BY_ID, type RelationId } from "@/lib/relations";

function sample(id: RelationId, name: string, breedId: string, breedLabel: string, line: number, rank: CardData["rarity"]["rank"], axes: CardData["axes"]): CardData {
  const r = RELATION_BY_ID.get(id)!;
  return {
    name,
    breedId,
    breedLabel,
    rel: { id: r.id, name: r.name, catRole: r.catRole, humanRole: r.humanRole, catIcon: r.catIcon, humanIcon: r.humanIcon, theme: r.theme, stickers: r.stickers, face: r.face, acc: r.acc },
    catLine: r.catLines[line],
    aruaru: [r.aruaru[0], r.aruaru[1]],
    rarity: { rank, label: "" },
    axes,
  };
}

const SAMPLES: CardData[] = [
  sample("oshi", "むぎ", "scottish", "スコティッシュフォールド", 0, "SR", { dom: 62, amae: 32, mood: 70, demand: 40 }),
  sample("king", "こてつ", "chatora", "茶トラ", 1, "SSR", { dom: 88, amae: 44, mood: 40, demand: 80 }),
  sample("lovers", "ルナ", "ragdoll", "ラグドール", 0, "UR", { dom: 34, amae: 92, mood: 36, demand: 56 }),
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <p className="pill">猫好きのための 関係診断</p>
        <h1>うちの子との関係、<br /><em>カード</em>にしよう。</h1>
        <p className="lead">うちの子をえらんで、12の「もしも」に答えるだけ。ふたりの関係が、レア度つきの猫様カードになります。</p>
        <SampleCards samples={SAMPLES} />
        <Link href="/chosa" className="btn primary big">無料で診断する</Link>
        <p className="note">登録なし・約2分・写真も入れられます</p>
      </section>

      <section className="section">
        <h2 className="sec-title">見せ合いたくなる、3つのしかけ</h2>
        <div className="feats">
          <div className="feat"><span className="fi" aria-hidden="true">✨</span><div><b>レア度つきのカード</b><p>UR・SSR・SR・R。友達の猫様と、どっちがレアか比べっこ。</p></div></div>
          <div className="feat"><span className="fi" aria-hidden="true">📷</span><div><b>うちの子の写真でつくれる</b><p>写真はスマホの中だけで処理。どこにも送信されません。</p></div></div>
          <div className="feat"><span className="fi" aria-hidden="true">📱</span><div><b>ストーリーズ用もワンタップ</b><p>縦長画像もすぐ保存。X・LINEでもシェアできます。</p></div></div>
        </div>
      </section>

      <section className="section">
        <h2 className="sec-title">柄も猫種も、37種類</h2>
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
        <h2 className="sec-title">診断のながれ</h2>
        <ol className="steps">
          <li><b>うちの子をえらぶ</b><span>柄16種・猫種21種から。名前も入れられます。</span></li>
          <li><b>12の「もしも」に答える</b><span>「猫様が突然しゃべったら？」など。選ぶとどうなるかは、お楽しみ。</span></li>
          <li><b>カードを開封して、シェア</b><span>関係・口ぐせ・あるある入りの、世界にひとつのカード。</span></li>
        </ol>
        <p className="center" style={{ marginTop: 28 }}>
          <Link href="/chosa" className="btn primary big">さっそく診断する</Link>
        </p>
      </section>
    </>
  );
}
