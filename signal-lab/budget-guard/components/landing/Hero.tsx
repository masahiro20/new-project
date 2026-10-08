import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { Cta } from "./Cta";

export function Hero() {
  const { hero } = config.landing;
  return (
    <section className="hero">
      <div className="wrap">
        {hero.eyebrow && <div className="eyebrow">{hero.eyebrow}</div>}
        {config.launch.mode === "presale" && <span className="badge">{t.cta.presaleBadge}</span>}
        <h1>{hero.headline}</h1>
        <p className="lead">{hero.sub}</p>
        <Cta />
      </div>
    </section>
  );
}
