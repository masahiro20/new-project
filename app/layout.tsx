import type { Metadata } from "next";
import Link from "next/link";
import { aiEnabled, demoPurchase, liveBilling } from "@/lib/launch";
import { DEMO_BANNER } from "@/lib/payments/mode";
import { ogImage } from "@/lib/og";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "減算ゼロ｜虐待防止・身体拘束適正化の書類をAIで作成（障害福祉）",
    template: "%s｜減算ゼロ",
  },
  description:
    "障害福祉サービス事業所向け。虐待防止委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針を、事業所に合わせてAIが作成します。減算リスクの無料診断つき。",
  openGraph: { type: "website", locale: "ja_JP", siteName: "減算ゼロ", images: [ogImage()] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ai = aiEnabled();
  return (
    <html lang="ja">
      <body>
        {demoPurchase() && (
          <div className="demo-banner" role="status">
            {DEMO_BANNER}
          </div>
        )}
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo">減算ゼロ</Link>
            <nav>
              {ai && <Link href="/check">無料診断</Link>}
              <Link href="/guide">解説</Link>
              <Link href="/samples">サンプル</Link>
              {ai ? (
                <Link href="/generate" className="nav-cta">書類を作る</Link>
              ) : (
                <Link href="/check" className="nav-cta">無料診断</Link>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <nav>
              <Link href="/terms">利用規約</Link>
              {liveBilling() && <Link href="/legal">特定商取引法に基づく表記</Link>}
              <Link href="/privacy">プライバシーポリシー</Link>
              <Link href="/llms.txt" prefetch={false}>llms.txt</Link>
            </nav>
            <p>本サービスは書類作成を支援するツールです。制度の最新の取扱いは、指定権者（都道府県・市町村）の通知をご確認ください。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
