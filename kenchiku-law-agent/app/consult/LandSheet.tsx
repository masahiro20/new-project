"use client";

import type { LandFact } from "@/lib/landsummary";

const SOURCE_TONE: Record<LandFact["source"], string> = { 国の公開データ: "data", 条文から算出: "law", 入力値: "input", 要確認: "todo" };

export default function LandSheet({ facts, location, notes }: { facts: LandFact[]; location: string; notes: string[] }) {
  const alerts = facts.filter((f) => f.tone === "danger");
  return (
    <div className="landsheet">
      <div className="landsheet-head">
        <div>
          <h3>土地のまとめ</h3>
          <p className="hint">{location}</p>
        </div>
        <div className="legend" aria-label="出どころ">
          <span className="src src-data">国の公開データ</span>
          <span className="src src-law">条文から算出</span>
          <span className="src src-todo">要確認</span>
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
              <span className={`src src-${SOURCE_TONE[f.source]}`} title={f.source}>{f.source === "国の公開データ" ? "データ" : f.source === "条文から算出" ? "条文" : f.source === "入力値" ? "入力" : "要確認"}</span>
            </div>
            <div className="fact-value">{f.value}</div>
            {f.sub && <div className="fact-sub">{f.sub}</div>}
            {f.link && (
              <a className="fact-link" href={f.link.url} target="_blank" rel="noopener noreferrer">
                {f.link.label}
              </a>
            )}
          </div>
        ))}
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
