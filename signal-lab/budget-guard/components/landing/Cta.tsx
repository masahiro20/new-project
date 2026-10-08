import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { TrackLink } from "../Track";
import { WaitlistForm } from "../WaitlistForm";

/** The primary call to action, switched by launch.mode. */
export function Cta() {
  if (config.launch.mode === "waitlist") return <WaitlistForm labels={t.waitlist} />;
  return (
    <div className="actions">
      <TrackLink href="/pricing" className="btn">{config.launch.mode === "presale" ? t.cta.preorder : t.cta.buy}</TrackLink>
    </div>
  );
}
