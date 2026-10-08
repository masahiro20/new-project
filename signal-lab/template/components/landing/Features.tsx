import { config } from "@/lib/config";
import { t } from "@/lib/i18n";

export function Features() {
  return (
    <section>
      <div className="wrap">
        <h2>{t.sections.features}</h2>
        <div className="grid">
          {config.landing.features.map((f) => (
            <div key={f.title} className="card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
