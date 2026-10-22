"use client";

import type { LandFact } from "@/lib/landsummary";
import { CertaintyBadge, CertaintyLegend } from "./Certainty";

export default function LandSheet({ facts, location, notes }: { facts: LandFact[]; location: string; notes: string[] }) {
  const alerts = facts.filter((f) => f.tone === "danger");
  return (
    <div className="landsheet">
      <div className="landsheet-head">
        <div>
          <h3>土地のまとめ</h3>
          <p className="hint">{location}</p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alertbar">
          <strong>見落とし注意</strong>
          {alerts.map((f) => (
            <span key={f.key} className="pill tone-danger">
              {f.label}：{f.value}
            </span>
          ))}
        </div>
      )}

      <div className="factgrid">
        {facts.map((f) => (
          <div key={f.key} className={`fact tone-${f.tone}`}>
            <div className="fact-top">
              <span className="fact-label">{f.label}</span>
              <CertaintyBadge value={f.certainty} />
            </div>
            <div className="fact-value">{f.value}</div>
            {f.sub && <div className="fact-sub">{f.sub}</div>}
            <div className="fact-src">
              {f.certainty === "入力" ? (
                <span>出典：入力値</span>
              ) : f.cites.length === 0 ? (
                <span>出典なし（窓口・図面で確認）</span>
              ) : (
                <>
                  出典：
                  {f.cites.map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" title={c.label}>
                      {c.label}
                    </a>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="landsheet-foot">
        <CertaintyLegend compact />
        <span className="hint">地図データは住所の代表点で判定。農地・川の距離は数m〜十数mずれることがあります。</span>
      </div>

      {notes.length > 0 && (
        <details className="notes">
          <summary>データの注記（{notes.length}件）</summary>
          <ul>
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
