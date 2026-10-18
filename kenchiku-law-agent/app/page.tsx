import Link from "next/link";
import { RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";

export default function HomePage() {
  const articleCount = new Set(RULES.flatMap((r) => r.cites.map((c) => `${c.law}:${c.article}`))).size;
  return (
    <>
      <section>
        <div className="wrap narrow">
          <p className="eyebrow">社内用・建築／土地の法令チェック</p>
          <h1>「こういう計画をしたい」を入れると、注意点・手続き・確認事項を根拠付きで返します</h1>
          <p className="lead">
            設計・コーディネーター・施工・営業の誰が使っても同じ答えが出るように、建築基準法・都市計画法・農地法・消防法・盛土規制法などの<strong>現行条文（e-Gov法令検索）</strong>と国・自治体の<strong>公的資料</strong>だけを根拠にします。条番号・数値はツールで条文を取得してから書く設計です。
          </p>
          <div className="actions">
            <Link href="/consult" className="btn">計画をチェックする</Link>
            <Link href="/rules" className="btn secondary">知識ベースを見る</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="grid">
            <div className="card">
              <h3>1. 計画と土地情報を入力</h3>
              <p>自由記述に加えて、区域区分・用途地域・接道・地目・該当区域などを選びます。不明なら「不明」のままで構いません。「不明」は「該当なし」ではなく「要確認」として扱います。</p>
            </div>
            <div className="card">
              <h3>2. ルールで即時チェック</h3>
              <p>{RULES.length}項目のルールが、条文照合済みの知識ベースから「該当」「可能性が高い」「要確認」を即時に判定します（{Object.keys(LAWS).length}法令・{articleCount}条文を引用）。</p>
            </div>
            <div className="card">
              <h3>3. エージェントが深掘り</h3>
              <p>Claude が e-Gov から条文を取得し、必要なら国交省・消防庁・農水省・自治体の公式ページを検索して、計画に当てはめた注意点、こちらから確認したい質問、担当別の次のアクションをまとめます。</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap narrow prose">
          <h2>想定している相談の例</h2>
          <ul>
            <li>市街化区域の畑（地目：畑）を買って木造2階建ての住宅を建てたい。何から確認する？</li>
            <li>調整区域の実家の隣に分家住宅を建てられるか。</li>
            <li>幅員3.6mの道に接する旗竿地。路地の幅は1.9m。建てられる？</li>
            <li>準防火地域で1階店舗＋2・3階住宅の兼用住宅。確認申請・消防はどう変わる？</li>
            <li>高低差2.5mの土地に盛土して平屋を建てる。許可は要る？</li>
            <li>築40年の家を解体して建て替え。解体時の届出と調査は？</li>
          </ul>
          <h2>できないこと・注意</h2>
          <ul>
            <li>条例（がけ条例・日影・景観・火災予防条例など）の内容は自治体ごとに異なるため、該当の可能性と確認先を示すまでです。該当条例が見つかれば URL を示します。</li>
            <li>建築確認・許可の可否を保証するものではありません。最終判断は所管窓口への確認と建築士の判断で行ってください。</li>
            <li>入力内容はブラウザとサーバーの処理にのみ使い、サーバーには保存しません。</li>
          </ul>
        </div>
      </section>
    </>
  );
}
