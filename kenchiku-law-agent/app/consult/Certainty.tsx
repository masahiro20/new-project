import { CERTAINTY, CERTAINTY_HELP, CERTAINTY_SHORT, type Certainty } from "@/lib/report";
import { sourceTier } from "@/lib/tier";

type Cite = { label?: string; url?: string };

const MARK: Record<Certainty | "入力", string> = { 確定: "✓", 要確認: "!", 推測: "?", 入力: "✎" };
const INPUT_HELP = "入力された値をそのまま使っています（原本で確認してください）";

export function CertaintyBadge({ value }: { value?: Certainty | "入力" }) {
  const v = value ?? "要確認";
  return (
    <span className={`cert cert-${v}`} title={v === "入力" ? INPUT_HELP : CERTAINTY_HELP[v]}>
      <span aria-hidden>{MARK[v]}</span>
      {v}
    </span>
  );
}

export function CertaintyLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`cert-legend ${compact ? "compact" : ""}`} aria-label="確実性の見方">
      {compact && <span className="cert-legend-title">確実性</span>}
      {CERTAINTY.map((c) => (
        <span key={c}>
          <CertaintyBadge value={c} />
          <small>{compact ? CERTAINTY_SHORT[c] : CERTAINTY_HELP[c]}</small>
        </span>
      ))}
    </div>
  );
}

/** Source chips. A claim with no source says so instead of staying silent. */
export function Sources({ list, label = "出典" }: { list?: Cite[]; label?: string }) {
  const items = (list ?? []).filter((e) => e.label?.trim());
  return (
    <div className="ev">
      <span className="ev-label">{label}</span>
      {items.length === 0 ? (
        <span className="evchip tier-none" title="出典で裏付けていないため、推測・要確認として扱います">出典なし</span>
      ) : (
        items.map((e, i) =>
          e.url ? (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" title={e.label} className={`evchip tier-${sourceTier(e.url)}`}>
              {e.label}
            </a>
          ) : (
            <span key={i} className="evchip tier-資料" title={e.label}>
              {e.label}
            </span>
          ),
        )
      )}
    </div>
  );
}
