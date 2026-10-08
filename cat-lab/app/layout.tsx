import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

const maru = Zen_Maru_Gothic({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-maru",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME} | うちの猫様、私のこと下僕だと思ってる？`, template: `%s | ${SITE_NAME}` },
  description: `${SITE_TAGLINE}。16の質問に答えると、あなたと猫様の主従関係を「鑑定調書」にしてお届けします。`,
  openGraph: {
    title: `${SITE_NAME} | うちの猫様、私のこと下僕だと思ってる？`,
    description: `${SITE_TAGLINE}。あなたは何等級の下僕ですか？`,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fff6e9",
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
              <span className="logo"><CatArt coat="chatora" uid="logo" /></span>
              {SITE_NAME}
            </Link>
            <nav className="nav" aria-label="メイン">
              <Link href="/types">タイプ図鑑</Link>
              <Link href="/yougo">用語集</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p className="paws" aria-hidden="true">🐾🐾🐾</p>
            <p>{SITE_NAME} ― {SITE_TAGLINE}</p>
            <p style={{ marginTop: 6 }}>この診断は娯楽です。猫様の健康や行動の相談は、動物病院へどうぞ。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
