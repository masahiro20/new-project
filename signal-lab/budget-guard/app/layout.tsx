import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { Track } from "@/components/Track";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${config.name}｜${config.tagline}`, template: `%s｜${config.name}` },
  description: config.description,
  openGraph: { type: "website", locale: config.locale === "ja" ? "ja_JP" : "en_US", siteName: config.name },
  twitter: { card: "summary_large_image" },
  // /success?session_id, /access?token, /checkout/demo?id and /app/c?id carry capabilities
  // in the query: never send the URL (or even the origin) to other sites.
  referrer: "same-origin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = { "--accent": config.brand.color, "--accent-ink": config.brand.ink } as React.CSSProperties;
  return (
    <html lang={config.locale} style={brand}>
      <body>
        <DemoBanner />
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo">{config.name}</Link>
            <nav>
              <Link href="/pricing">{t.nav.pricing}</Link>
              {config.access.gate === "license" && config.launch.mode !== "waitlist" && <Link href="/access">{t.nav.signIn}</Link>}
              {config.launch.mode !== "waitlist" && <Link href="/app" className="nav-cta">{t.nav.openApp}</Link>}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <nav>
              <Link href="/legal/tokushoho">{t.footer.tokushoho}</Link>
              <Link href="/legal/privacy">{t.footer.privacy}</Link>
              <Link href="/legal/terms">{t.footer.terms}</Link>
              <a href="/llms.txt">llms.txt</a>
            </nav>
            <p>© {config.legal.sellerName.includes("【") ? config.name : config.legal.sellerName}</p>
          </div>
        </footer>
        <Track />
      </body>
    </html>
  );
}
