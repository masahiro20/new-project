"use client";

import { askList, groupFacts, landPoints, type LandFact } from "@/lib/landsummary";
import { CertaintyBadge, CertaintyLegend } from "./Certainty";

function Item({ f, i }: { f: LandFact; i: number }) {
  return (
    <dl className={`spec-item tone-${f.tone}`} style={{ ["--i" as string]: i }}>
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
          `出典なし（${f.ask ?? "窓口・図面"}で確認）`
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
  );
}

/**
 * 土地情報まとめ（1段目）: the 土地情報確認AIツール layout — この土地のポイント,
 * 基本情報, 必須チェック12項目, 災害リスク, その他の法令・周辺, 確認先.
 */
export default function LandSheet({ facts, notes }: { facts: LandFact[]; location?: string; notes: string[] }) {
  const points = landPoints(facts);
  const groups = groupFacts(facts);
  const asks = askList(facts);
  let n = 0;
  return (
    <div className="spec">
      <div className="land-points">
        <p className="land-points-title">この土地のポイント</p>
        <ul className="land-counts">
          <li className="is-danger">
            <strong>{points.danger.length}</strong>重大
          </li>
          <li className="is-warn">
            <strong>{points.warn.length}</strong>注意
          </li>
          <li>
            <strong>{points.check.length}</strong>要確認
          </li>
        </ul>
        {points.danger.length + points.warn.length > 0 && (
          <ol className="land-point-list">
            {[...points.danger, ...points.warn].slice(0, 5).map((f) => (
              <li key={f.key} className={`tone-${f.tone}`}>
                <b>{f.label}</b>
                {f.value}
              </li>
            ))}
          </ol>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.id} className={`spec-group spec-group-${g.id}`}>
          <header className="spec-group-head">
            <span className="spec-group-en">{g.en}</span>
            <h3>{g.title}</h3>
          </header>
          <div className="spec-grid">
            {g.facts.map((f) => (
              <Item key={f.key} f={f} i={n++} />
            ))}
          </div>
        </section>
      ))}

      {asks.length > 0 && (
        <section className="spec-group spec-group-ask">
          <header className="spec-group-head">
            <span className="spec-group-en">Ask</span>
            <h3>確認先</h3>
          </header>
          <dl className="ask-table">
            {asks.map((a) => (
              <div key={a.office}>
                <dt>{a.office}</dt>
                <dd>{a.items.join("・")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="spec-foot">
        <CertaintyLegend compact />
        <span className="hint">地図データは住所の代表点で判定。農地・川の距離は数m〜十数mずれることがあります。近隣の地価・上下水・ガスの参考値は周辺の地点のもので、敷地そのものではありません。</span>
      </div>

      {notes.length > 0 && (
        <details className="notes">
          <summary>データの注記（{notes.length}件）</summary>
          <ul>
            {notes.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
