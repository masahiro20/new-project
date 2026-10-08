import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "このサイトについて",
  description: "主従研究所のしくみと、データ・写真の取り扱いについて。",
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <h1>このサイトについて</h1>
        <p>主従研究所は、猫様と飼い主の関係を「カード」にして楽しむ、娯楽のための診断サイトです。</p>
      </div>

      <section className="sheet">
        <h2 className="sheet-h">入力した内容の取り扱い</h2>
        <ul className="obs">
          <li>猫様のお名前・回答は、結果ページのURLの中にだけ入ります。サーバーやデータベースには保存しません。</li>
          <li>結果のリンクを共有すると、リンクを受け取った人にも名前と結果が見えます。</li>
          <li>会員登録はなく、メールアドレスなどの個人情報はお預かりしません。</li>
        </ul>
      </section>

      <section className="sheet">
        <h2 className="sheet-h">写真の取り扱い</h2>
        <ul className="obs">
          <li>カードに入れた写真は、お使いの端末のブラウザの中だけで処理します。インターネット上に送信・保存されることはありません。</li>
          <li>ページを閉じたり再読み込みしたりすると、写真は消えます。</li>
          <li>写真入りのカードを投稿するときは、写り込んだ人や場所にご注意ください。</li>
        </ul>
      </section>

      <section className="sheet">
        <h2 className="sheet-h">診断について</h2>
        <ul className="obs">
          <li>結果は質問への回答と猫種から計算した、娯楽のためのものです。科学的・医学的な根拠はありません。</li>
          <li>猫様の健康や行動について気になることは、動物病院にご相談ください。</li>
          <li>サイトの表示のため、ホスティング事業者（Vercel）が一般的なアクセス記録を扱う場合があります。</li>
        </ul>
      </section>

      <p className="center" style={{ marginTop: 28 }}>
        <Link href="/chosa" className="btn primary big">診断してみる</Link>
      </p>
    </>
  );
}
