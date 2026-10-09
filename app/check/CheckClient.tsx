"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ChecklistDownload from "@/app/ChecklistDownload";
import { trackEvent } from "@/lib/analytics";
import { CHECK_SERVICES, checkGroups, decodeResult, encodeResult, NOT_APPLICABLE_NOTE } from "@/lib/check";
import { CHECKLIST } from "@/lib/checklist";

export default function CheckClient({ ai }: { ai: boolean }) {
  const [serviceIndex, setServiceIndex] = useState(0);
  const service = CHECK_SERVICES[serviceIndex];
  const groups = checkGroups(service);
  const note = NOT_APPLICABLE_NOTE[service.kind];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const keys = groups.flatMap((g) => g.items.map((item) => `${g.name}:${item}`));

  // A shared result link (#r=…) reopens the same answers. The fragment never reaches the server.
  useEffect(() => {
    const result = decodeResult(window.location.hash);
    if (!result) return;
    const restoredKeys = checkGroups(CHECK_SERVICES[result.serviceIndex]).flatMap((g) => g.items.map((item) => `${g.name}:${item}`));
    // The hash is only readable after mount, so restoring here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServiceIndex(result.serviceIndex);
    setChecked(new Set(restoredKeys.filter((_, i) => result.checked(i))));
    setShowResult(true);
  }, []);

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
    window.history.replaceState(null, "", `#${encodeResult(serviceIndex, keys.map((k) => checked.has(k)))}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
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
            window.history.replaceState(null, "", window.location.pathname);
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
                  <p className="next-steps">
                    <strong>次にやること：</strong>
                    {g.next.map((n, i) => (
                      <span key={n.href}>
                        {i > 0 && "／"}
                        <Link href={n.href}>{n.label}</Link>
                      </span>
                    ))}
                  </p>
                </div>
              ))}
              <p>
                {ai
                  ? "虐待防止と身体拘束等適正化の書類は、このサイトでまとめて作成できます。年間実施計画は無料です。"
                  : "必要な書類の雛形は、無料の書類テンプレートで事業所名などを入れて作成できます（Wordで保存して編集できます）。AIが事業所に合わせて書き分ける有料版は準備中です。"}
              </p>
              <div className="actions">
                {ai && <Link href="/generate" className="btn">書類を作る</Link>}
                <Link href="/templates" className={ai ? "btn secondary" : "btn"}>無料テンプレートで作る</Link>
                <Link href="/samples" className="btn secondary">書類サンプルを見る</Link>
                <Link href={service.guide ? `/guide/${service.guide}` : "/guide"} className="btn secondary">
                  {service.guide ? `${service.label.replace(/（.*$/, "")}の解説` : "サービス種別ごとの解説"}
                </Link>
              </div>
            </>
          )}
          {service.child && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>無料配布：{CHECKLIST.title}</h3>
              <p>減算に直結する体制のほか、個別支援計画・運営規程・安全計画まで、運営指導の前に印を付けて確認できます。</p>
              <ChecklistDownload />
            </div>
          )}
          <div className="actions no-print">
            <button type="button" className="btn secondary" onClick={copyLink}>
              {copied === "done" ? "結果のURLをコピーしました" : "結果のURLをコピー（職員と共有）"}
            </button>
          </div>
          {copied === "failed" && <p className="hint">コピーできませんでした。ブラウザのアドレス欄のURLをそのまま共有してください。</p>}
          <p className="hint" style={{ marginTop: 16 }}>この診断は目安です。「1年に1回以上」を年度で数えるか直近1年で数えるかなど、取扱いは指定権者によって異なることがあります。最終的な判断は指定権者の通知に従ってください。</p>
        </div>
      )}
    </>
  );
}
