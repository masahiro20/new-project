import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_ORDER, RULES } from "@/lib/knowledge";
import { LAWS } from "@/lib/laws";
import { citeLabel, citeUrl } from "@/lib/rules";

export const metadata: Metadata = {
  title: "知識ベース（ルール一覧）",
  description: "エージェントが使う法令ルールの一覧。各ルールは e-Gov 法令検索の条文と公的資料を根拠にしています。",
};

export default function RulesPage() {
  return (
    <section>
      <div className="wrap narrow prose">
        <p className="eyebrow">知識ベース</p>
        <h1>ルール一覧（{RULES.length}項目）</h1>
        <p className="lead">
          即時チェックとエージェントの土台になるルールです。条文リンクは e-Gov 法令検索の該当条に飛びます。「条文を表示」はこのサイト内で現行条文を取得して表示します。数値・条番号は <code>npm run verify-sources</code> で定期的に照合しています。
        </p>
        <p>
          引用している法令：{Object.values(LAWS).map((l) => l.title).join("、")}
        </p>
        {CATEGORY_ORDER.map((category) => {
          const items = RULES.filter((r) => r.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <h2>{category}</h2>
              {items.map((rule) => (
                <details key={rule.id} id={rule.id}>
                  <summary>{rule.title}</summary>
                  <p>{rule.summary}</p>
                  <p><strong>対応：</strong>{rule.action}</p>
                  <p><strong>担当：</strong>{rule.roles.join("・")}</p>
                  <table>
                    <thead>
                      <tr><th>根拠条文</th><th>リンク</th></tr>
                    </thead>
                    <tbody>
                      {rule.cites.map((c) => (
                        <tr key={`${c.law}:${c.article}`}>
                          <td>{citeLabel(c)}</td>
                          <td>
                            <Link href={`/law/${LAWS[c.law].id}/${c.article}`}>条文を表示</Link>
                            {" ／ "}
                            <a href={citeUrl(c)} target="_blank" rel="noopener noreferrer">e-Gov</a>
                          </td>
                        </tr>
                      ))}
                      {rule.refs?.map((r) => (
                        <tr key={r.url}>
                          <td>【公的】{r.publisher}：{r.label}</td>
                          <td><a href={r.url} target="_blank" rel="noopener noreferrer">開く</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
