"use client";

import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { CHECK_SERVICES, checkGroups, NOT_APPLICABLE_NOTE } from "@/lib/check";

export default function CheckClient({ ai }: { ai: boolean }) {
  const [serviceIndex, setServiceIndex] = useState(0);
  const service = CHECK_SERVICES[serviceIndex];
  const groups = checkGroups(service);
  const note = NOT_APPLICABLE_NOTE[service.kind];
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
    if (showResult) return;
    if (!started) {
      setStarted(true);
      trackEvent("check-start");
    }
    setShowResult(true);
    trackEvent("check-complete");
  }

  const missing = groups.map((g) => ({ ...g, missing: g.items.filter((item) => !checked.has(`${g.name}:${item}`)) })).filter((g) => g.missing.length);

  return (
    <>
      <div className="field" style={{ marginTop: 24 }}>
        <label htmlFor="check-service">サービス種別</label>
        <select
          id="check-service"
          value={serviceIndex}
          onChange={(e) => {
            setServiceIndex(Number(e.target.value));
            setShowResult(false);
          }}
        >
          {CHECK_SERVICES.map((s, i) => (
            <option key={s.label} value={i}>{s.label}</option>
          ))}
        </select>
        {note && <p className="hint" style={{ marginTop: 6 }}>{note}</p>}
      </div>

      {groups.map((g) => (
        <fieldset key={g.id} className="check-group">
          <legend>{g.name}</legend>
          {g.items.map((item) => {
            const key = `${g.name}:${item}`;
            return (
              <label key={key} className="check-item">
                <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} />
                {item}
              </label>
            );
          })}
        </fieldset>
      ))}

      <div className="actions">
        <button type="button" className="btn" onClick={finish}>診断結果を見る</button>
      </div>

      {showResult && (
        <div style={{ marginTop: 32 }} role="status">
          {missing.length === 0 ? (
            <p className="ok">すべての項目が整っています。来年度に向けて、年間計画と指針の見直しを続けましょう。</p>
          ) : (
            <>
              <h2>減算の対象になるおそれがあります</h2>
              <p>次の項目が確認できませんでした。</p>
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
                <Link href={service.guide ? `/guide/${service.guide}` : "/guide"} className="btn secondary">
                  {service.guide ? `${service.label.replace(/（.*$/, "")}の解説` : "サービス種別ごとの解説"}
                </Link>
              </div>
            </>
          )}
          <p className="hint" style={{ marginTop: 16 }}>この診断は目安です。「1年に1回以上」を年度で数えるか直近1年で数えるかなど、取扱いは指定権者によって異なることがあります。最終的な判断は指定権者の通知に従ってください。</p>
        </div>
      )}
    </>
  );
}
