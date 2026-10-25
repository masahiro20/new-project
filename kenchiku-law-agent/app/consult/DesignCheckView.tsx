"use client";

import { useState } from "react";
import { DESIGN_AREAS, type DesignCheck, type DesignVerdict } from "@/lib/designcheck";

const ORDER: Record<DesignVerdict, number> = { 該当: 0, 要確認: 1, 非該当: 2 };

/** 設計条件チェック：防火の区分を先頭に、分野ごとの 該当／要確認／非該当 と設計で決めること。 */
export default function DesignCheckView({ check }: { check: DesignCheck }) {
  const [showAll, setShowAll] = useState(false);
  const counts = { 該当: 0, 要確認: 0, 非該当: 0 } as Record<DesignVerdict, number>;
  for (const i of check.items) counts[i.verdict]++;
  return (
    <div className="design">
      <div className={`fire-class fire-${check.fire.required}`}>
        <p className="fire-class-k">防火の区分</p>
        <p className="fire-class-v">{check.fire.label}</p>
        <p className="fire-class-plain">
          {check.fire.plain}
          <span className="hint">（判定の前提：{check.basis}・{check.fire.required === "要確認" ? "入力を足すと判定" : "防火指定は国のデータ"}）</span>
        </p>
      </div>

      <div className="design-counts">
        <span className="v-該当">該当 {counts.該当}</span>
        <span className="v-要確認">要確認 {counts.要確認}</span>
        <span className="v-非該当">非該当 {counts.非該当}</span>
        <label className="design-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          非該当の照合結果も表示
        </label>
      </div>

      {DESIGN_AREAS.map((area) => {
        const items = check.items.filter((i) => i.area === area && (showAll || i.verdict !== "非該当")).sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
        const hidden = check.items.filter((i) => i.area === area && i.verdict === "非該当").length;
        if (!items.length && !hidden) return null;
        return (
          <div key={area} className="design-area">
            <h3>
              {area}
              {!showAll && hidden > 0 && <span className="hint">ほか非該当 {hidden}件</span>}
            </h3>
            {items.map((i) => (
              <article key={i.id} className={`design-item v-${i.verdict}`}>
                <header>
                  <span className={`verdict v-${i.verdict}`}>{i.verdict}</span>
                  <strong>{i.title}</strong>
                </header>
                <p className="design-reason">{i.reason}</p>
                {i.verdict !== "非該当" && (
                  <ul className="design-specs">
                    {i.specs.map((s, k) => (
                      <li key={k}>{s}</li>
                    ))}
                  </ul>
                )}
                <p className="design-cites">
                  根拠：
                  {i.cites.map((c, k) => (
                    <a key={k} href={c.url} target="_blank" rel="noopener noreferrer">
                      {c.label}
                    </a>
                  ))}
                </p>
              </article>
            ))}
          </div>
        );
      })}
      <p className="hint design-foot">
        条文の数値は e-Gov の現行条文で確認済み。告示仕様・大臣認定の個別条件、行政の運用（換気口の扱い・IHの扱いなど）は確認検査機関・特定行政庁に確認してください。AIの詳しいチェックを実行すると、この照合をもとに敷地固有の設計の注意点をまとめます。
      </p>
    </div>
  );
}
