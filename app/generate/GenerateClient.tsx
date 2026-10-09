"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
import { SERVICE_TYPES, type FacilityInput } from "@/lib/form";
import { trackEvent } from "@/lib/analytics";
import { endsWithNotice } from "@/lib/notices";
import { PART_LABELS, PARTS, type Part } from "@/lib/parts";
import PurchaseSummary from "./PurchaseSummary";
import Turnstile from "./Turnstile";

const STORAGE_KEY = "gensan-zero:input";
const outputKey = (sessionId: string) => `gensan-zero:output:${sessionId}`;

const EMPTY: FacilityInput = {
  serviceType: "放課後等デイサービス",
  facilityName: "",
  staffCount: 8,
  userCharacteristics: "",
  meetingDate: "",
  committeeMembers: "",
  meetingNotes: "",
  recentIssues: "",
  useRestraint: "なし",
};

type Output = { text: string; done: boolean; error?: string };

function loadSaved(): FacilityInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function save(input: FacilityInput) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    // Storage blocked: checkout still works, but the set can't be restored after redirect.
  }
}

type SavedOutputs = Partial<Record<Part, string>>;

/** Finished paid sets, kept so a reload shows them again instead of regenerating (and re-billing the API). */
function loadOutputs(sessionId: string): SavedOutputs {
  try {
    return JSON.parse(localStorage.getItem(outputKey(sessionId)) ?? "{}") as SavedOutputs;
  } catch {
    return {};
  }
}

function saveOutput(sessionId: string, part: Part, text: string) {
  try {
    localStorage.setItem(outputKey(sessionId), JSON.stringify({ ...loadOutputs(sessionId), [part]: text }));
  } catch {
    // Storage blocked or full: the set is still on screen, only reload-restore is lost.
  }
}

async function streamInto(url: string, body: unknown, onText: (text: string) => void): Promise<string | undefined> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    return data.error ?? "エラーが発生しました。";
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return undefined;
}

export default function GenerateClient({
  price,
  sales,
  demo = false,
  apiBase = "",
  turnstileSiteKey,
}: {
  price: number;
  sales: boolean;
  demo?: boolean;
  /** Origin of the API: the Worker on the static site, "" (same origin) otherwise. */
  apiBase?: string;
  turnstileSiteKey?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  // Without sales there is no paid session to resume, whatever the URL says.
  const sessionId = sales ? params.get("session_id") : null;
  const canceled = sales && params.get("canceled") === "1";

  const [input, setInput] = useState<FacilityInput>(EMPTY);
  const [outputs, setOutputs] = useState<Partial<Record<Part | "preview", Output>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const onTurnstileToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const set = <K extends keyof FacilityInput>(key: K, value: FacilityInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const update = (part: Part | "preview", patch: Partial<Output>) =>
    setOutputs((prev) => ({ ...prev, [part]: { text: "", done: false, ...prev[part], ...patch } }));

  /** Streams one part; resolves to the finished text, or null when it failed or stopped early. */
  async function run(part: Part | "preview", url: string, body: unknown): Promise<string | null> {
    update(part, { text: "", done: false, error: undefined });
    let latest = "";
    const error = await streamInto(url, body, (text) => {
      latest = text;
      update(part, { text });
    });
    update(part, { done: true, error });
    return error || endsWithNotice(latest) ? null : latest;
  }

  async function generatePart(id: string, part: Part, data: FacilityInput) {
    const text = await run(part, `${apiBase}/api/generate`, { sessionId: id, part, input: data });
    if (text) {
      saveOutput(id, part, text);
      trackEvent(`set-generated-${part}`);
    }
  }

  async function generatePaid(id: string, data: FacilityInput, parts: readonly Part[]) {
    setBusy(true);
    await Promise.all(parts.map((part) => generatePart(id, part, data)));
    setBusy(false);
  }

  async function retry(part: Part) {
    if (!sessionId) return;
    setBusy(true);
    await generatePart(sessionId, part, input);
    setBusy(false);
  }

  useEffect(() => {
    const saved = loadSaved();
    // localStorage is only readable after mount, so restoring here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setInput(saved);

    if (sessionId && !started.current) {
      started.current = true;
      if (!saved) {
        setMessage("入力内容が見つかりませんでした。購入時と同じブラウザで開いてください。");
        return;
      }
      const cached = loadOutputs(sessionId);
      setOutputs(Object.fromEntries(Object.entries(cached).map(([part, text]) => [part, { text, done: true }])));
      const missing = PARTS.filter((part) => !cached[part]);
      // First arrival back from checkout (nothing generated yet for this session) = a completed purchase.
      if (missing.length === PARTS.length) trackEvent("purchase-complete");
      if (missing.length) generatePaid(sessionId, saved, missing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function preview() {
    if (!input.facilityName.trim()) return setMessage("事業所名を入力してください。");
    setMessage(null);
    save(input);
    setBusy(true);
    trackEvent("preview-start");
    const plan = await run("preview", `${apiBase}/api/preview`, { input, turnstileToken });
    if (plan) trackEvent("preview-complete");
    if (turnstileSiteKey) setTurnstileReset((n) => n + 1);
    setBusy(false);
  }

  async function checkout() {
    if (!input.facilityName.trim()) return setMessage("事業所名を入力してください。");
    setMessage(null);
    save(input);
    setBusy(true);
    trackEvent("checkout-start");
    const res = await fetch(`${apiBase}/api/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      // Demo checkout is an in-app page (basePath-aware navigation); Stripe is an external URL.
      // Only an in-app path or Stripe Checkout (https) is followed; anything else (javascript:, //host) is refused.
      const url = String(data.url);
      if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) router.push(url);
      else if (/^https:\/\/checkout\.stripe\.com\//.test(url)) window.location.href = url;
      else {
        setMessage("決済ページを開けませんでした。");
        setBusy(false);
      }
    } else {
      setMessage(data.error ?? "決済ページを開けませんでした。");
      setBusy(false);
    }
  }

  const shown = (sessionId ? PARTS : (["preview"] as const)).filter((p) => outputs[p]);

  return (
    <>
      {canceled && <p className="notice">お支払いはキャンセルされました。入力内容は保存されています。</p>}
      {message && <p className="notice">{message}</p>}

      {!sessionId && (
        <form onSubmit={(e) => e.preventDefault()} className="no-print">
          <div className="field">
            <label htmlFor="serviceType">サービス種別</label>
            <select id="serviceType" value={input.serviceType} onChange={(e) => set("serviceType", e.target.value as FacilityInput["serviceType"])}>
              {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="facilityName">事業所名</label>
            <input id="facilityName" type="text" maxLength={60} value={input.facilityName} onChange={(e) => set("facilityName", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="staffCount">職員数</label>
            <input id="staffCount" type="number" min={1} max={500} value={input.staffCount} onChange={(e) => set("staffCount", Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="userCharacteristics">
              利用者の主な特性 <span className="hint">例：小学生中心、自閉スペクトラム症の児童が多い</span>
            </label>
            <textarea id="userCharacteristics" maxLength={400} value={input.userCharacteristics} onChange={(e) => set("userCharacteristics", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="meetingDate">委員会の開催日（予定または実施日）</label>
            <input id="meetingDate" type="text" maxLength={40} placeholder="例：2026年10月15日 14:00〜15:00" value={input.meetingDate} onChange={(e) => set("meetingDate", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="committeeMembers">
              委員会のメンバー（役職） <span className="hint">氏名は不要です</span>
            </label>
            <input id="committeeMembers" type="text" maxLength={300} placeholder="例：管理者、児童発達支援管理責任者、指導員2名" value={input.committeeMembers} onChange={(e) => set("committeeMembers", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="meetingNotes">
              委員会で話し合った内容のメモ <span className="hint">箇条書きで十分です。空欄の場合、議事録は記入欄付きの様式で作成します</span>
            </label>
            <textarea id="meetingNotes" maxLength={2000} value={input.meetingNotes} onChange={(e) => set("meetingNotes", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recentIssues">
              最近の課題・ヒヤリハット <span className="hint">研修の事例検討に使います。個人が特定できる情報は書かないでください</span>
            </label>
            <textarea id="recentIssues" maxLength={800} value={input.recentIssues} onChange={(e) => set("recentIssues", e.target.value)} />
          </div>
          <div className="field">
            <label>身体拘束の実施状況</label>
            <div className="radio-row">
              {(["なし", "あり", "検討中"] as const).map((v) => (
                <label key={v}>
                  <input type="radio" name="useRestraint" checked={input.useRestraint === v} onChange={() => set("useRestraint", v)} /> {v}
                </label>
              ))}
            </div>
          </div>

          {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={onTurnstileToken} resetKey={turnstileReset} />}

          <p className="notice">
            議事録は、実際に開催した委員会のメモをもとに清書します。開催していない会議や研修の記録を作ることはできません。
          </p>

          {sales && <PurchaseSummary price={price} demo={demo} />}

          <div className="actions">
            <button type="button" className={sales ? "btn secondary" : "btn"} onClick={preview} disabled={busy || (!!turnstileSiteKey && !turnstileToken)}>
              無料で年間実施計画を作る
            </button>
            {sales && (
              <button type="button" className="btn" onClick={checkout} disabled={busy}>
                全書類セットを作る（{price.toLocaleString()}円・税込）
              </button>
            )}
          </div>
        </form>
      )}

      {sessionId && (
        <p className="ok no-print">
          {busy
            ? `${demo ? "（デモ）" : ""}お支払いありがとうございます。3つの書類セットを同時に作成しています（数分かかります）。`
            : `${demo ? "（デモ）" : ""}お支払いありがとうございます。作成した書類は、このブラウザに保存されています。忘れずにWordで保存してください。`}
        </p>
      )}

      {shown.map((part) => (
        <ResultPart
          key={part}
          part={part}
          output={outputs[part]!}
          facilityName={input.facilityName}
          onRetry={sessionId && part !== "preview" && !busy ? () => retry(part) : undefined}
        />
      ))}

      {!sales && outputs.preview?.done && !outputs.preview.error && (
        <div className="card no-print" style={{ marginTop: 24 }}>
          <h3>続きの書類の完成イメージ</h3>
          <p>委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針をまとめて作る有料版は準備中です。完成イメージは書類サンプルでご覧いただけます。</p>
          <div className="actions">
            <Link href="/samples" className="btn secondary">書類サンプルを見る</Link>
          </div>
        </div>
      )}

      {sales && !sessionId && outputs.preview?.done && !outputs.preview.error && (
        <div className="card no-print" style={{ marginTop: 24 }}>
          <h3>続きの書類もまとめて作成できます</h3>
          <p>委員会の議事次第・議事録、研修資料と理解度テスト、身体拘束等適正化の指針と記録様式まで、{price.toLocaleString()}円で一式そろいます。</p>
          <PurchaseSummary price={price} demo={demo} />
          <div className="actions">
            <button type="button" className="btn" onClick={checkout} disabled={busy}>全書類セットを作る</button>
          </div>
        </div>
      )}
    </>
  );
}

function ResultPart({
  part,
  output,
  facilityName,
  onRetry,
}: {
  part: Part | "preview";
  output: Output;
  facilityName: string;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label = PART_LABELS[part];

  async function download() {
    const { downloadDocx } = await import("@/lib/docx-export");
    await downloadDocx(output.text, `${facilityName || "事業所"}_${label.replace(/（.*$/, "")}.docx`);
  }

  async function copy() {
    await navigator.clipboard.writeText(output.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="result-part">
      <div className="result-head">
        <h2 style={{ margin: 0 }}>{label}</h2>
        {output.done && !output.error && (
          <div className="actions no-print" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={download}>Wordで保存</button>
            <button type="button" className="btn secondary" onClick={copy}>{copied ? "コピーしました" : "コピー"}</button>
            <button type="button" className="btn secondary" onClick={() => window.print()}>印刷</button>
          </div>
        )}
      </div>
      {output.error && <p className="notice">{output.error}</p>}
      {onRetry && output.done && (output.error || endsWithNotice(output.text)) && (
        <div className="actions no-print" style={{ marginTop: 0, marginBottom: 12 }}>
          <button type="button" className="btn secondary" onClick={onRetry}>この書類を作り直す</button>
        </div>
      )}
      {!output.done && <p className="spinner no-print">作成中…</p>}
      {output.text && <MarkdownView markdown={output.text} />}
    </div>
  );
}
