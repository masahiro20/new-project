import type { Metadata } from "next";
import { RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";
import snapshot from "@/data/law-snapshot.json";

export const metadata: Metadata = {
  title: "根拠の扱いと更新手順",
  description: "このエージェントが根拠として扱う情報源の等級と、条文照合・更新の手順。",
};

export default function SourcesPage() {
  const refs = new Map<string, { label: string; publisher: string }>();
  for (const r of RULES) for (const ref of r.refs ?? []) refs.set(ref.url, { label: ref.label, publisher: ref.publisher });
  const snap = snapshot as { verifiedAt: string; articles: Record<string, { law: string; label: string; caption: string; revisionId: string }> };
  const articleCount = Object.keys(snap.articles).length;

  return (
    <div className="sheet sheet-page">
      <header className="page-hero">
        <div className="wrap narrow">
          <p className="page-en">Evidence</p>
          <p className="page-kicker">根拠と更新</p>
          <h1>エビデンスの扱い</h1>
          <p className="lead">法令の話は「誰が言ったか」ではなく「どの条文に書いてあるか」で決まります。このツールは根拠を3つの等級に分け、下位の情報を単独の根拠にしません。</p>
        </div>
      </header>
      <section className="content">
        <div className="wrap narrow prose">
          <h2>根拠の等級</h2>
          <table>
            <thead>
              <tr>
                <th>等級</th>
                <th>内容</th>
                <th>取得方法</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>【条文】</td>
                <td>法律・政令・省令の現行条文（一次情報）</td>
                <td>e-Gov 法令API v2（laws.e-gov.go.jp）から条単位で取得。回答中の条番号・数値はこの条文で裏付けます。</td>
              </tr>
              <tr>
                <td>【公的】</td>
                <td>国土交通省・総務省消防庁・農林水産省・環境省・都道府県・市区町村の公式ページ、通知、技術的助言、運用指針</td>
                <td>知識ベースに登録した資料と、エージェントの Web 検索（go.jp / lg.jp ドメイン等を自動判定）。条例・自治体運用の確認に使います。</td>
              </tr>
              <tr>
                <td>【参考】</td>
                <td>業界団体・企業・個人の解説記事など</td>
                <td>公的根拠を探す手がかりに限定。回答の根拠一覧では【参考】と明示し、単独では採用しません。</td>
              </tr>
            </tbody>
          </table>

          <h2>条文照合の仕組み</h2>
          <ul>
            <li>知識ベース（{RULES.length}ルール）の各根拠には、法令ID・条番号・期待する条見出しを登録しています。</li>
            <li>
              <code>npm run verify-sources</code> を実行すると、全ての条（現在 {articleCount} 条）を e-Gov から取得し、条見出しが一致するか、現行版（改正）の識別子が変わっていないかを照合し、
              <code>data/law-snapshot.json</code> を更新します。
            </li>
            <li>最終照合：{new Date(snap.verifiedAt).toLocaleString("ja-JP")}。改正で条番号が繰り下がった場合は照合が失敗し、ルールの修正が必要になります。</li>
            <li>エージェントは回答時にも条文をツールで取得するため、知識ベースの要約と現行条文がずれた場合は条文側が優先されます。</li>
          </ul>

          <h2>法改正への対応</h2>
          <ul>
            <li>2025年4月1日施行：建築基準法（4号特例の縮小＝新2号・新3号建築物、木造の構造審査の拡大、壁量計算の見直し）、建築物省エネ法（全ての新築・増改築で省エネ基準適合義務）。</li>
            <li>盛土規制法（宅地造成及び特定盛土等規制法）：2023年5月施行、規制区域の指定は都道府県ごとに順次。所在地の指定状況を必ず確認。</li>
            <li>
              e-Gov の現行版識別子で改正を検知します。月1回の <code>verify-sources</code> 実行を推奨します。
            </li>
          </ul>

          <h2>引用している法令（{Object.keys(LAWS).length}）</h2>
          <ul>
            {Object.values(LAWS).map((l) => (
              <li key={l.id}>
                <a href={`https://laws.e-gov.go.jp/law/${l.id}`} target="_blank" rel="noopener noreferrer">
                  {l.title}
                </a>
                （{l.id}）
              </li>
            ))}
          </ul>

          <h2>登録している公的資料（{refs.size}）</h2>
          <ul>
            {[...refs.entries()].map(([url, r]) => (
              <li key={url}>
                {r.publisher}：
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {r.label}
                </a>
              </li>
            ))}
          </ul>

          <h2>限界</h2>
          <ul>
            <li>
              条例（がけ条例、日影の指定区域、景観計画、火災予防条例、開発許可の条例区域、最低敷地面積など）は自治体ごとに異なり、網羅していません。該当の可能性と確認先を示し、見つかれば自治体ページの
              URL を返します。
            </li>
            <li>告示・技術的助言・通達の全文は e-Gov 法令APIの対象外です。必要な場合は国土交通省等の公式ページを参照します。</li>
            <li>許可の可否を保証するものではありません。最終判断は所管窓口への確認と建築士の判断で行ってください。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
