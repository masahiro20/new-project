import type { Metadata } from "next";
import { LegalDocView } from "@/components/LegalDocView";
import { privacy } from "@/content/legal/privacy";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t.footer.privacy };

export default function PrivacyPage() {
  return <LegalDocView doc={privacy[config.locale]} />;
}
