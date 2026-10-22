"use client";

import type { LandFact } from "@/lib/landsummary";
import { CertaintyBadge, CertaintyLegend } from "./Certainty";

/** 土地のまとめ as a spec sheet: label, value, note, certainty and source per row. */
export default function LandSheet({ facts, notes }: { facts: LandFact[]; location?: string; notes: string[] }) {
  const alerts = facts.filter((f) => f.tone === "danger");
  return (
    <div className="spec">
      {alerts.length > 0 && (
        <p className="spec-alert">
          <strong>見落とし注意</strong>
          {alerts.map((f) => (
            <span key={f.key}>
              {f.label}：{f.value}
            </span>
          ))}
        </p>
      )}

      <div className="spec-grid">
        {facts.map((f, i) => (
          <dl key={f.key} className={`spec-item tone-${f.tone}`} style={{ ["--i" as string]: i }}>
            <dt>
              <span className="spec-label">{f.label}</span>
              <CertaintyBadge value={f.certainty} />
            </dt>
            <dd className="spec-value">{f.value}</dd>
            {f.sub && <dd className="spec-sub">{f.sub}</dd>}
            <dd className="spec-src">
              {f.certainty === "入力" ? (
                "出典：入力値"
              ) : f.cites.length === 0 ? (
                "出典なし（窓口・図面で確認）"
              ) : (
                <>
                  出典：
                  {f.cites.map((c, j) => (
                    <a key={j} href={c.url} target="_blank" rel="noopener noreferrer" title={c.label}>
                      {c.label}
                    </a>
                  ))}
                </>
              )}
            </dd>
          </dl>
        ))}
      </div>

      <div className="spec-foot">
        <CertaintyLegend compact />
        <span className="hint">地図データは住所の代表点で判定。農地・川の距離は数m〜十数mずれることがあります。</span>
      </div>

      {notes.length > 0 && (
        <details className="notes">
          <summary>データの注記（{notes.length}件）</summary>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
