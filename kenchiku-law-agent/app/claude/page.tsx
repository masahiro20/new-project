import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/mcp";
import { siteUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Claude から使う",
  description: "Claude（claude.ai・デスクトップ・Claude Code）からこのツールを呼び出し、ドライブの土地資料と住所から法令チェックをする方法。",
};

const EXAMPLES = [
  { title: "資料フォルダから丸ごと", text: "ドライブの「○○様」フォルダにある土地資料（登記簿・公図・測量図・写真）をもとに、法令制限と役所への事前協議を確認して。木造2階建ての自宅の予定。" },
  { title: "確認書まで一括", text: "○○様の建築地で法令制限確認書（Excel）と案内図を作って。施主名・電話・現住所は顧客リストのとおり、担当は中谷。" },
  { title: "住所だけで候補地を比べる", text: "浜松市中央区○○町1-2と、浜名区△△1500の土地のまとめを並べて。用途地域・高さ制限・農地・川・浸水の違いが分かるように。" },
  { title: "1枚の資料を確かめる", text: "この公図（添付）を見て、接道と水路の問題がないか法令チェックして。住所は静岡県浜松市…" },
  { title: "条文を確かめる", text: "2項道路のセットバックの条文を出して。" },
];

const FOLDER = `案件/
└ ○○様（静岡県浜松市○○町1500）/
   ├ 01_登記事項証明書.pdf
   ├ 02_公図.pdf
   ├ 03_地積測量図.pdf
   ├ 04_現況測量図.pdf
   ├ 05_重要事項説明書.pdf
   └ 写真/
      ├ 前面道路.jpg
      ├ 水路.jpg
      └ 擁壁.jpg`;

export default function ClaudePage() {
  const endpoint = `${siteUrl()}/api/mcp`;
  return (
    <>
      <header className="page-hero">
        <div className="wrap narrow">
          <p className="kicker">
            <span className="kicker-dot" aria-hidden />
            Claude から使う（MCP）
          </p>
          <h1>ドライブの資料と住所から、Claude にそのまま頼めます</h1>
          <p className="lead">
            Claude にこのツールをつなぐと、会話の中で「○○様のフォルダの資料をもとに法令チェックして」と頼めます。資料を読むのは
            Claude、国のデータの取得と条文で裏付けたチェックはこのツールが受け持ちます。結果には、この画面で詳しいチェックを続けるリンクが付きます。
          </p>
        </div>
      </header>
      <section className="content">
        <div className="wrap narrow prose">
          <h2>できること</h2>
          <div className="grid">
            <div className="card">
              <h3>資料を読んで判断</h3>
              <p>登記簿の地目・地積、公図の水路・里道、測量図の接道長さ・高低差、写真の擁壁や水路を読み取り、法令チェックに反映します。</p>
            </div>
            <div className="card">
              <h3>住所から土地のまとめ</h3>
              <p>用途地域・建蔽率／容積率・高さ制限・防火・農地・川・浸水・土砂・液状化を国の公開データで一覧にします。</p>
            </div>
            <div className="card">
              <h3>食い違いを指摘</h3>
              <p>「登記は宅地だが地図では畑」「公図では道路との間に水路」など、資料と自動取得データのずれを拾います。</p>
            </div>
            <div className="card">
              <h3>確実性と出典つき</h3>
              <p>各項目に「確定／要確認／推測」と出典を付けて返します。やることはタスク一覧にし、画面のリンクからPDF・CSVに保存できます。</p>
            </div>
          </div>

          <h2>1. つなぐ（最初に1回だけ）</h2>
          <h3>claude.ai／Claude デスクトップアプリ</h3>
          <ol>
            <li>Claude の設定から「コネクタ」を開き、「カスタムコネクタを追加」を選びます。</li>
            <li>
              名前に「建築法令エージェント」、URL に次を入れて追加します（キーは入れません）。
              <pre className="law">{endpoint}</pre>
            </li>
            <li>「接続」を押すと、このツールのサインイン画面が開きます。社内で共有しているアクセスキーを入れて「接続する」を押します。接続は約30日ごとに自動で更新されます。</li>
            <li>ドライブの資料を読ませるときは、同じ画面で Google ドライブのコネクタもオンにします。</li>
          </ol>
          <p className="hint">「サインインサービスに登録できませんでした」と出た場合は、そのコネクタを一度削除し、上のURL（キーなし）で追加し直してください。</p>
          <h3>Claude Code</h3>
          <pre className="law">{`claude mcp add --transport http kenchiku-law ${endpoint} --header "Authorization: Bearer アクセスキー"`}</pre>

          <h2>2. 資料の置き方（読み取り精度が上がります）</h2>
          <ul>
            <li>案件ごとに1フォルダにまとめ、フォルダ名にお客様名と住所を入れます。</li>
            <li>ファイル名に資料の種類（登記事項証明書・公図・地積測量図・現況測量図・重要事項説明書）を入れます。Claude が種類ごとに読むところを変えます。</li>
            <li>写真はファイル名に写っているもの（前面道路・水路・擁壁）を書きます。</li>
            <li>スキャンは文字が読める解像度で。登記簿は全部事項（乙区まで）を入れます。</li>
          </ul>
          <pre className="law">{FOLDER}</pre>

          <h2>3. 頼み方の例</h2>
          <div className="grid">
            {EXAMPLES.map((e) => (
              <div className="card" key={e.title}>
                <h3>{e.title}</h3>
                <p>「{e.text}」</p>
              </div>
            ))}
          </div>
          <p>Claude の入力欄のプロンプト一覧に「土地資料から法令チェック」も出ます。お客様名と住所を入れるだけで、上の手順どおりに進めます。</p>

          <h2>Claude に渡している機能</h2>
          <table>
            <thead>
              <tr>
                <th>機能</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name}>
                  <td>
                    <strong>{t.title}</strong>
                    <br />
                    <code>{t.name}</code>
                  </td>
                  <td>{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>注意</h2>
          <ul>
            <li>資料の読み取りは Claude が行います。数値は必ず原本で確かめてください。写真からの見立ては「推測」として扱います。</li>
            <li>住所の判定は地図上の代表点です。境界付近や、農地・川までの距離は十数m程度ずれることがあります。</li>
            <li>最終判断は所管の窓口と建築士で行ってください。</li>
          </ul>
          <p>
            <Link className="btn" href="/consult">
              画面で法令チェックする
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
