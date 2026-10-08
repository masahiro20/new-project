import type { LegalDoc } from "@/content/legal/types";
import { config } from "@/lib/config";

export function LegalDocView({ doc }: { doc: LegalDoc }) {
  const { title, sections } = doc(config);
  return (
    <section>
      <div className="wrap narrow prose">
        <h1>{title}</h1>
        {sections.map((s) => (
          <div key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body.map((p) => <p key={p}>{p}</p>)}
          </div>
        ))}
      </div>
    </section>
  );
}
