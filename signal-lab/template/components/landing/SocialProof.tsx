import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export function SocialProof() {
  const items = config.landing.socialProof;
  if (items.length === 0) return null;
  return (
    <section>
      <div className="wrap">
        <h2>{t.sections.voices}</h2>
        <div className="grid">
          {items.map((s) => (
            <figure key={s.quote} className="card" style={{ margin: 0 }}>
              <blockquote style={{ margin: 0 }}>{s.quote}</blockquote>
              <figcaption className="hint">— {s.author}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
