import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Noto_Sans_JP, Shippori_Mincho_B1 } from "next/font/google";
import { SITE_NAME, SITE_SUBTITLE, siteUrl } from "@/lib/config";
import MotionRoot from "./components/MotionRoot";
import { LogoMark } from "./components/Logo";
import "./globals.css";

// 本文は Noto Sans JP、大きな見出しは明朝（Shippori Mincho B1）、数字と英字は Inter。
// 等幅は地図の座標表示だけに使う。
const jp = Noto_Sans_JP({ subsets: ["latin"], variable: "--font-jp", display: "swap", preload: false });
const serif = Shippori_Mincho_B1({ weight: ["600", "700", "800"], subsets: ["latin"], variable: "--font-serif", display: "swap", preload: false });
const display = Inter({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME}｜${SITE_SUBTITLE}`,
    template: `%s｜${SITE_NAME}`,
  },
  description: "住所を入れるだけで、用途地域・法令制限・役所への事前協議・案内図・法令制限確認書まで。条文と公的資料を出典に、確定／要確認／推測を分けて示す社内ツールです。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${jp.variable} ${serif.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo" aria-label={`${SITE_NAME} ホーム`}>
              <LogoMark />
              <span className="logo-text">
                <strong>{SITE_NAME}</strong>
                <small>{SITE_SUBTITLE}</small>
              </span>
            </Link>
            <nav>
              <Link href="/claude">Claude連携</Link>
              <Link href="/rules">知識ベース</Link>
              <Link href="/sources">根拠と更新</Link>
              <Link href="/consult" className="nav-cta">
                <span className="dot" aria-hidden />
                土地を調べる
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <div className="footer-brand">
              <LogoMark size={24} />
              <span>
                {SITE_NAME} — {SITE_SUBTITLE}
              </span>
            </div>
            <p>
              法令の現行条文（e-Gov法令検索）と国・自治体の公的資料をもとにした検討の出発点です。地図・航空写真は国土地理院の地理院タイル、都市計画・災害は国土交通省、農地は農林水産省の公開データを使っています。最終判断は所管の窓口への確認と建築士の判断で行ってください。
            </p>
          </div>
        </footer>
        <MotionRoot />
      </body>
    </html>
  );
}
