import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchArticle } from "@/lib/egov";
import { articleLabel } from "@/lib/laws";

type Params = { lawId: string; article: string };

const valid = (p: Params) => /^\d{3}[A-Z]{2}\d{10}$/.test(p.lawId) && /^\d+(_\d+)*$/.test(p.article);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: valid(p) ? `条文 ${articleLabel(p.article)}` : "条文" };
}

export default async function LawArticlePage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (!valid(p)) notFound();
  const article = await fetchArticle(p.lawId, p.article).catch(() => null);
  if (!article) notFound();

  return (
    <>
      <header className="page-hero">
        <div className="wrap narrow">
          <p className="kicker">
            <span className="kicker-dot" aria-hidden />
            現行条文（e-Gov 法令検索より取得）
          </p>
          <h1>
            {article.lawTitle} {article.label}
            {article.caption && (
              <span className="hint" style={{ fontSize: "1rem", marginLeft: 8 }}>
                {article.caption}
              </span>
            )}
          </h1>
          <p className="lead">
            {article.lawNum}／現行版 {article.revisionId}（施行日 {article.enforcementDate ?? "不明"}）／取得 {new Date(article.fetchedAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </header>
      <section className="content">
        <div className="wrap narrow">
          <pre className="law">{article.text}</pre>
          <div className="actions">
            <a className="btn secondary" href={article.url} target="_blank" rel="noopener noreferrer">
              e-Gov で開く
            </a>
            <Link className="btn secondary" href="/rules">
              知識ベースへ戻る
            </Link>
          </div>
          <p className="hint">条文は e-Gov 法令API v2 からリクエスト時に取得しています（最大1時間キャッシュ）。別表・附則はこの画面では表示しないため、必要なときは e-Gov で確認してください。</p>
        </div>
      </section>
    </>
  );
}
