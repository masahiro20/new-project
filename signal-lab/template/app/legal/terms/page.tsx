import type { Metadata } from "next";
import { LegalDocView } from "@/components/LegalDocView";
import { terms } from "@/content/legal/terms";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.footer.terms };

export default function TermsPage() {
  return <LegalDocView doc={terms[config.locale]} />;
}
