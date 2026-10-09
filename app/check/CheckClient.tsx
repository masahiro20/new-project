"use client";

import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const GROUPS = [
  {
    name: "虐待防止措置",
    risk: "虐待防止措置未実施減算（所定単位数の1%）",
    items: ["今年度、虐待防止委員会を開催し議事録がある", "委員会の結果を職員に周知した記録がある", "今年度、虐待防止研修を実施し記録がある", "虐待防止の担当者が決まっている"],
  },
  {
    name: "身体拘束等の適正化",
    risk: "身体拘束廃止未実施減算（施設・居住系10%、訪問・通所系1%）",
    items: ["今年度、身体拘束等適正化委員会を開催した（一体開催も可）", "身体拘束等の適正化のための指針がある", "今年度、身体拘束等適正化の研修を実施した", "やむを得ず拘束する場合の記録様式がある"],
  },
  {
    name: "業務継続計画（BCP）",
    risk: "業務継続計画未策定減算（施設・居住系3%、その他1%）",
    items: ["感染症の業務継続計画がある", "自然災害の業務継続計画がある"],
  },
];

export default function CheckClient({ ai }: { ai: boolean }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [started, setStarted] = useState(false);

  const toggle = (key: string) => {
    if (!started) {
      setStarted(true);
      trackEvent("check-start");
    }
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Counts only that the check was started/finished; the answers themselves are never sent.
  function finish() {
    if (!started) {
      setStarted(true);
      trackEvent("check-start");
    }
    setShowResult(true);
    trackEvent("check-complete");
  }

  const missing = GROUPS.map((g) => ({ ...g, missing: g.items.filter((item) => !checked.has(`${g.name}:${item}`)) })).filter((g) => g.missing.length);

  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.name} style={{ marginTop: 24 }}>
          <h2>{g.name}</h2>
          {g.items.map((item) => {
            const key = `${g.name}:${item}`;
            return (
              <label key={key} className="check-item">
                <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} />
                {item}
              </label>
            );
          })}
        </div>
      ))}

      <div className="actions">
        <button type="button" className="btn" onClick={showResult ? undefined : finish}>診断結果を見る</button>
      </div>

      {showResult && (
        <div style={{ marginTop: 32 }}>
          {missing.length === 0 ? (
            <p className="ok">すべての項目が整っています。来年度に向けて、年間計画と指針の見直しを続けましょう。</p>
          ) : (
            <>
              <h2>減算の対象になるおそれがあります</h2>
              {missing.map((g) => (
                <div key={g.name} className="card" style={{ marginBottom: 12 }}>
                  <h3>{g.risk}</h3>
                  <ul>
                    {g.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              ))}
              <p>
                {ai
                  ? "虐待防止と身体拘束等適正化の書類は、このサイトでまとめて作成できます。年間実施計画は無料です。"
                  : "必要な書類の形は、無料の書類サンプルで確認できます（Wordで保存して編集できます）。AIによる作成機能は準備中です。"}
              </p>
              <div className="actions">
                {ai && <Link href="/generate" className="btn">書類を作る</Link>}
                <Link href="/samples" className={ai ? "btn secondary" : "btn"}>書類サンプルを見る</Link>
                <Link href="/guide" className="btn secondary">サービス種別ごとの解説</Link>
              </div>
            </>
          )}
          <p className="hint" style={{ marginTop: 16 }}>この診断は目安です。最終的な判断は指定権者の通知に従ってください。</p>
        </div>
      )}
    </>
  );
}
