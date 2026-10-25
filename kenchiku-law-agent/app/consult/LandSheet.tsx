"use client";

import { askList, groupFacts, landPoints, type LandFact } from "@/lib/landsummary";
import { CertaintyBadge, CertaintyLegend } from "./Certainty";
import { glance } from "@/lib/glance";
import type { PlanInput } from "@/lib/plan";
import type { ReactNode } from "react";

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
export default function LandSheet({ facts, notes, plan, afterGlance }: { facts: LandFact[]; location?: string; notes: string[]; plan: PlanInput; afterGlance?: ReactNode }) {
  const points = landPoints(facts);
  const g = glance(plan, facts);
  const groups = groupFacts(facts);
  const asks = askList(facts);
  let n = 0;
  return (
    <div className="spec">
      <section className={`glance verdict-${g.verdict.tone}`} aria-label="ひと目でわかる">
        <header className="glance-head">
          <span className="glance-en">At a glance</span>
          <h3>ひと目でわかる</h3>
          <span className="hint">営業・スタッフ向け。数字は国のデータ（住所の代表点）による</span>
        </header>
        <p className="glance-verdict">{g.verdict.text}</p>
        <dl className="glance-basics">
          {g.basics.map((b) => (
            <div key={b.label} className={b.value === "未確認" ? "is-unknown" : ""}>
              <dt>{b.label}</dt>
              <dd>{b.value}</dd>
            </div>
          ))}
        </dl>
        <div className="glance-cols">
          <div>
            <p className="glance-sub">
              お客様に伝える注意点<span>{g.cautions.length ? `${g.cautions.length}件` : "なし"}</span>
            </p>
            {g.cautions.length ? (
              <ol className="glance-cautions">
                {g.cautions.map((c) => (
                  <li key={c.key} className={`tone-${c.tone}`}>
                    <b>{c.title}</b>
                    <span>{c.plain}</span>
                    {c.impacts.length > 0 && (
                      <span className="impacts">
                        {c.impacts.map((m) => (
                          <i key={m} className={`impact impact-${m}`}>
                            {m}
                          </i>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint">データ上、重大・注意の項目はありません。</p>
            )}
          </div>
          <div>
            <p className="glance-sub">
              まだ分からないこと<span>誰に聞くか</span>
            </p>
            {g.unknowns.length ? (
              <ul className="glance-unknowns">
                {g.unknowns.map((u) => (
                  <li key={u.office}>
                    <b>{u.items.join("・")}</b>
                    <span>→ {u.office}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">窓口で確かめる項目はありません。</p>
            )}
          </div>
        </div>
        <p className="glance-count hint">
          重大 {points.danger.length}・注意 {points.warn.length}・要確認 {points.check.length}（下の一覧の内訳）
        </p>
      </section>

      {afterGlance}

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
