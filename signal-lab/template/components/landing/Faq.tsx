import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export function Faq() {
  const items = config.landing.faq;
  if (items.length === 0) return null;
  return (
    <section>
      <div className="wrap narrow">
        <h2>{t.sections.faq}</h2>
        {items.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
