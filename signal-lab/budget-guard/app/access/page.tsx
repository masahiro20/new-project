import type { Metadata } from "next";
import { AccessForms } from "@/components/AccessForms";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.access.title, robots: { index: false } };

const ERRORS: Record<string, string> = {
  token: t.access.invalidToken,
  license: t.access.invalidLicense,
  expired: t.access.expired,
  limited: t.access.limited,
};

export default async function AccessPage(props: PageProps<"/access">) {
  const { token, error } = await props.searchParams;
  const errorMessage = typeof error === "string" ? ERRORS[error] : undefined;

  // Magic links land here and require a click, so mail scanners that prefetch
  // links can't burn the single-use token.
  if (typeof token === "string" && token) {
    return (
      <section>
        <div className="wrap narrow">
          <h1>{t.access.tokenTitle}</h1>
          <form action="/api/access/verify" method="post">
            <input type="hidden" name="token" value={token} />
            <button className="btn">{t.access.tokenContinue}</button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="wrap narrow">
        <h1>{t.access.title}</h1>
        {errorMessage && <p className="notice">{errorMessage}</p>}
        <AccessForms labels={{ ...t.access, email: t.waitlist.email }} magicLink={config.access.magicLink} />
      </div>
    </section>
  );
}
