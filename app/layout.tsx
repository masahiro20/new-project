import type { Metadata } from "next";
import { Shippori_Mincho_B1 } from "next/font/google";
import Link from "next/link";
import ScrollFx from "./ScrollFx";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Japanese glyphs load on demand through unicode-range slices, so nothing is preloaded.
const mincho = Shippori_Mincho_B1({ weight: ["700", "800"], subsets: ["latin"], preload: false, display: "swap", variable: "--font-mincho" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "減算ゼロ｜虐待防止・身体拘束適正化の書類をAIで作成（障害福祉）",
    template: "%s｜減算ゼロ",
  },
  description:
    "障害福祉サービス事業所向け。虐待防止委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針を、事業所に合わせてAIが作成します。減算リスクの無料診断つき。",
  openGraph: { type: "website", locale: "ja_JP", siteName: "減算ゼロ" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={mincho.variable}>
      <body>
        <div className="progress" aria-hidden="true" />
        <ScrollFx />
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo"><span className="seal" aria-hidden="true">零</span>減算ゼロ</Link>
            <nav>
              <Link href="/check">無料診断</Link>
              <Link href="/guide">解説</Link>
              <Link href="/generate" className="nav-cta">書類を作る</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p className="footer-mark" aria-hidden="true">減算<em>ゼロ</em></p>
            <nav>
              <Link href="/legal">特定商取引法に基づく表記</Link>
              <Link href="/privacy">プライバシーポリシー</Link>
              <a href="/llms.txt">llms.txt</a>
            </nav>
            <p>本サービスは書類作成を支援するツールです。制度の最新の取扱いは、指定権者（都道府県・市町村）の通知をご確認ください。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
