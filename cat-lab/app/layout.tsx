import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

const maru = Zen_Maru_Gothic({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-maru",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | うちの子との関係、カードにしよう。`, template: `%s | ${SITE_NAME}` },
  description: `うちの子をえらんで12の「もしも」に答えると、あなたと猫様の関係がレア度つきの「猫様カード」になります。37種の猫に対応、写真も入れられます。`,
  openGraph: {
    title: `${SITE_NAME} | うちの子との関係、カードにしよう。`,
    description: `37種の猫 × 12の関係。うちの子との関係を、カードにしよう。`,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fff8f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={maru.variable}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              <span className="logo"><CatArt breed="chatora" uid="logo" /></span>
              {SITE_NAME}
            </Link>
            <nav className="nav" aria-label="メイン">
              <Link href="/types">関係図鑑</Link>
              <Link href="/yougo">用語集</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>{SITE_NAME} ― {SITE_TAGLINE}</p>
            <p style={{ marginTop: 6 }}>この診断は娯楽です。猫様の健康や行動の相談は、動物病院へどうぞ。</p>
            <p style={{ marginTop: 6 }}><Link href="/about">このサイトについて・プライバシー</Link></p>
          </div>
        </footer>
      </body>
    </html>
  );
}
