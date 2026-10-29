import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono, Noto_Serif_JP, Shippori_Mincho_B1 } from "next/font/google";
import { SITE_NAME, SITE_SUBTITLE, siteUrl } from "@/lib/config";
import MotionRoot from "./components/MotionRoot";
import BackdropVideo from "./components/BackdropVideo";
import { LogoMark, LogoType } from "./components/Logo";
import "./globals.css";

// 会社サイト（homelandick.com）に合わせて、本文も見出しも明朝。
// 本文・英字は Noto Serif JP、キャッチは Shippori Mincho B1。等幅は地図の座標表示だけ。
const jp = Noto_Serif_JP({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-jp", display: "swap", preload: false });
const serif = Shippori_Mincho_B1({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-serif", display: "swap", preload: false });
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
    <html lang="ja" className={`${jp.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <BackdropVideo />
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="logo" aria-label={`${SITE_NAME} ホーム`}>
              <LogoMark size={34} />
              <LogoType height={30} />
              <span className="logo-app">
                <small>LAND SCAN</small>
                土地・法令調査
              </span>
            </Link>
            <nav>
              <Link href="/claude">Claude連携</Link>
              <Link href="/rules">知識ベース</Link>
              <Link href="/sources">根拠と更新</Link>
              <Link href="/accuracy">答え合わせ</Link>
              <Link href="/consult" className="nav-cta">
                土地を調べる<span aria-hidden>➤</span>
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <LogoMark size={40} />
              <LogoType height={34} />
            </div>
            <p className="footer-app">
              LAND SCAN — 土地・法令調査（社内ツール）
            </p>
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
