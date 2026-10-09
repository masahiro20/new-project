"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ChecklistDownload from "@/app/ChecklistDownload";
import { trackEvent } from "@/lib/analytics";
import {
  CHECK_SERVICES,
  checkGroups,
  decodeResult,
  encodeResult,
  NOT_APPLICABLE_NOTE,
  parseDraft,
  templateHref,
  templatesFor,
} from "@/lib/check";
import { CHECKLIST } from "@/lib/checklist";
import { PART_LABELS } from "@/lib/parts";

const DRAFT_KEY = "gensan-zero:check-draft";

/** In-progress answers stay in this browser only (never sent), so a visitor can leave and finish later. */
function saveDraft(serviceIndex: number, checked: Set<string>) {
  try {
    if (checked.size) localStorage.setItem(DRAFT_KEY, JSON.stringify({ serviceIndex, checked: [...checked] }));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the check still works, only resuming is lost.
  }
}

export default function CheckClient({ ai }: { ai: boolean }) {
  const [serviceIndex, setServiceIndex] = useState(0);
  const service = CHECK_SERVICES[serviceIndex];
  const groups = checkGroups(service);
  const note = NOT_APPLICABLE_NOTE[service.kind];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [resumed, setResumed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // check-complete is counted once per visit, even if the answers are edited and the result shown again.
  const completed = useRef(false);
  const keys = groups.flatMap((g) => g.items.map((item) => `${g.name}:${item}`));

  // A shared result link (#r=…) reopens the same answers. The fragment never reaches the server.
  // Otherwise, answers left half-way on an earlier visit are restored (this browser only).
  useEffect(() => {
    const result = decodeResult(window.location.hash);
    if (!result) {
      let draft = null;
      try {
        draft = parseDraft(localStorage.getItem(DRAFT_KEY));
      } catch {
        // Storage blocked: start empty.
      }
      if (!draft || !draft.checked.length) return;
      // localStorage is only readable after mount, so restoring here is intended.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServiceIndex(draft.serviceIndex);
      setChecked(new Set(draft.checked));
      // Counted as started on the earlier visit, so don't send check-start again.
      setStarted(true);
      setResumed(true);
      trackEvent("check-resume");
      return;
    }
    const restoredKeys = checkGroups(CHECK_SERVICES[result.serviceIndex]).flatMap((g) => g.items.map((item) => `${g.name}:${item}`));
    // The hash is only readable after mount, so restoring here is intended.
    setServiceIndex(result.serviceIndex);
    setChecked(new Set(restoredKeys.filter((_, i) => result.checked(i))));
    setShowResult(true);
  }, []);

  const toggle = (key: string) => {
    if (!started) {
      setStarted(true);
      trackEvent("check-start");
    }
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
    saveDraft(serviceIndex, next);
  };

  /** For shared PCs, or to start over: forget the answers kept in this browser. */
  function clearAnswers() {
    setChecked(new Set());
    setShowResult(false);
    setResumed(false);
    saveDraft(serviceIndex, new Set());
    window.history.replaceState(null, "", window.location.pathname);
  }

  // Counts only that the check was started/finished; the answers themselves are never sent.
  function finish() {
    if (showResult) return;
    if (!started) {
      setStarted(true);
      trackEvent("check-start");
    }
    setShowResult(true);
    if (!completed.current) {
      completed.current = true;
      trackEvent("check-complete");
    }
    // The finished result lives in the URL (#r=…), so the half-way draft is no longer needed.
    saveDraft(serviceIndex, new Set());
    window.history.replaceState(null, "", `#${encodeResult(serviceIndex, keys.map((k) => checked.has(k)))}`);
    // The result renders below the questions; bring it into view (the button may be in the sticky bar).
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
            // Answers belong to one service's questions, so changing the service starts over.
            setChecked(new Set());
            saveDraft(Number(e.target.value), new Set());
            window.history.replaceState(null, "", window.location.pathname);
          }}
        >
          {CHECK_SERVICES.map((s, i) => (
            <option key={s.label} value={i}>{s.label}</option>
          ))}
        </select>
        {note && <p className="hint" style={{ marginTop: 6 }}>{note}</p>}
      </div>
      {resumed && !showResult && (
        <p className="hint" role="status">
          前回の途中の回答を復元しました（このブラウザにだけ保存されています）。{" "}
          <button type="button" className="link-button" onClick={clearAnswers}>回答を消して最初から</button>
        </p>
      )}

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

      {!showResult && (
        <div className="check-bar no-print">
          <span className="check-progress">
            チェック {checked.size}／{keys.length}
            <span className="hint">（分からない項目は空欄のまま結果を見られます）</span>
          </span>
          <button type="button" className="btn" onClick={finish}>診断結果を見る</button>
        </div>
      )}

      {showResult && (
        <div ref={resultRef} style={{ marginTop: 32, scrollMarginTop: 72 }} role="status">
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
                  {templatesFor(g, g.missing).length > 0 && (
                    <div className="actions" style={{ marginTop: 8 }}>
                      {templatesFor(g, g.missing).map((part) => (
                        <Link
                          key={part}
                          href={templateHref(service, part)}
                          className="btn"
                          onClick={() => trackEvent("check-to-template")}
                        >
                          無料で作る：{PART_LABELS[part].replace(/（.*$/, "")}
                        </Link>
                      ))}
                    </div>
                  )}
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
                <Link href={templateHref(service)} className="btn secondary" onClick={() => trackEvent("check-to-template")}>
                  無料テンプレートの一覧
                </Link>
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
            <button type="button" className="btn secondary" onClick={() => setShowResult(false)}>回答を直す</button>
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
