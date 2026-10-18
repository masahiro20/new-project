import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME}｜建築・土地の法令チェック（社内用）`,
    template: `%s｜${SITE_NAME}`,
  },
  description:
    "建築基準法・都市計画法・農地法・消防法・盛土規制法などの現行条文（e-Gov）と国・自治体の公的資料を根拠に、計画の注意点・必要な手続き・確認事項を整理する社内向けエージェントです。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo">{SITE_NAME}</Link>
            <nav>
              <Link href="/rules">知識ベース</Link>
              <Link href="/sources">根拠と更新</Link>
              <Link href="/consult" className="nav-cta">計画をチェック</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              本ツールは法令の現行条文（e-Gov法令検索）と公的資料をもとに検討の出発点を示すものです。最終判断は特定行政庁・消防本部・農業委員会など所管の窓口への確認と、建築士の判断で行ってください。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
