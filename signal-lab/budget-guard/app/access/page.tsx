import type { Metadata } from "next";
import { AccessForms } from "@/components/AccessForms";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.access.title, robots: { index: false } };

// Static shell (○). ?token / ?error are read in the browser; sign-in goes through
// /api/access/{license,magic,verify}.
export default function AccessPage() {
  const a = t.access;
  return (
    <section>
      <div className="wrap narrow">
        <AccessForms
          magicLink={config.access.magicLink}
          labels={{
            title: a.title, licenseLabel: a.licenseLabel, redeem: a.redeem, magicTitle: a.magicTitle, magicSend: a.magicSend,
            email: t.waitlist.email, tokenTitle: a.tokenTitle, tokenContinue: a.tokenContinue,
            errors: { token: a.invalidToken, license: a.invalidLicense, expired: a.expired, limited: a.limited },
          }}
        />
      </div>
    </section>
  );
}
