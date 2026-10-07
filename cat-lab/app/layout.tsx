import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CatMark } from "@/components/CatMark";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME} | 猫様と下僕の主従関係診断`, template: `%s | ${SITE_NAME}` },
  description: `${SITE_TAGLINE}。事情聴取に答えると、あなたと猫様の関係を「鑑定調書」として発行します。`,
  openGraph: {
    title: `${SITE_NAME} | 猫様と下僕の主従関係診断`,
    description: `${SITE_TAGLINE}。あなたは何等級の下僕ですか？`,
    siteName: SITE_NAME,
    locale: "ja_JP",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#f5eedf",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              <CatMark />
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
            <p>{SITE_NAME} ― {SITE_TAGLINE}</p>
            <p style={{ marginTop: 6 }}>この診断は娯楽です。猫様の健康や行動の相談は、動物病院へどうぞ。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
