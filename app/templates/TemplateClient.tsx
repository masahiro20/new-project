"use client";

import { useEffect, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
import { trackEvent } from "@/lib/analytics";
import { SERVICE_TYPES } from "@/lib/form";
import { PART_LABELS, type Part } from "@/lib/parts";
import { buildTemplate, templateContext, templateParts, type TemplateInput } from "@/lib/templates";

const STORAGE_KEY = "gensan-zero:template-input";

/** 令和の年度：4月始まり。 */
function currentReiwaFiscalYear(now = new Date()): number {
  const fiscal = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return fiscal - 2018;
}

const EMPTY: TemplateInput = {
  facilityName: "",
  serviceType: "放課後等デイサービス",
  staffCount: null,
  reiwaYear: currentReiwaFiscalYear(),
  meetingDate: "",
  committeeMembers: "",
  officerRole: "",
};

/** Everything happens in this browser: nothing is sent to a server and no AI is used. */
export default function TemplateClient() {
  const [input, setInput] = useState<TemplateInput>(EMPTY);
  const [part, setPart] = useState<Part>("committee");
  const [saving, setSaving] = useState(false);
  // While typing, the year field may be empty or partial; only a valid year reaches the template.
  const [yearText, setYearText] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // localStorage is only readable after mount, so restoring here is intended.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setInput({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // Storage blocked: start empty.
    }
    // Coming from the diagnosis (/check): #s=<サービス種別> preselects the service.
    const fromCheck = decodeURIComponent(/^#s=(.+)$/.exec(window.location.hash)?.[1] ?? "");
    if ((SERVICE_TYPES as readonly string[]).includes(fromCheck)) {
      setInput((prev) => ({ ...prev, serviceType: fromCheck as TemplateInput["serviceType"] }));
    }
  }, []);

  /** For shared PCs: forget everything typed here. */
  function clearInput() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: nothing was saved.
    }
    setInput(EMPTY);
  }

  const set = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) =>
    setInput((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: the form still works, only restore-on-reload is lost.
      }
      return next;
    });

  // Cheap pure functions; the React Compiler memoizes them, so no useMemo here.
  const ctx = templateContext(input);
  const parts = templateParts(ctx);
  const shownPart = parts.includes(part) ? part : parts[0];
  const markdown = buildTemplate(shownPart, ctx);
  const label = PART_LABELS[shownPart];

  async function download() {
    setSaving(true);
    try {
      const { downloadDocx } = await import("@/lib/docx-export");
      await downloadDocx(markdown, `${ctx.facilityName.trim() || "事業所"}_令和${ctx.reiwaYear}年度_${label.replace(/（.*$/, "")}_テンプレート.docx`);
      trackEvent(`template-download-${shownPart}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={(e) => e.preventDefault()} className="no-print">
        <div className="field">
          <label htmlFor="t-service">サービス種別</label>
          <select id="t-service" value={input.serviceType} onChange={(e) => set("serviceType", e.target.value as TemplateInput["serviceType"])}>
            {SERVICE_TYPES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {ctx.restraintRate === null && (
            <p className="hint" style={{ marginTop: 6 }}>相談支援は身体拘束廃止未実施減算の対象外のため、身体拘束等適正化セットはありません。</p>
          )}
          {ctx.kind === "unknown" && (
            <p className="hint" style={{ marginTop: 6 }}>自立生活援助・就労定着支援・地域相談支援は身体拘束廃止未実施減算の対象外です。これらのサービスでは身体拘束等適正化セットは不要です。</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="t-name">事業所名</label>
          <input id="t-name" type="text" maxLength={60} value={input.facilityName} onChange={(e) => set("facilityName", e.target.value)} />
        </div>
        <div className="grid template-grid">
          <div className="field">
            <label htmlFor="t-year">年度（令和）</label>
            <input
              id="t-year"
              type="number"
              min={6}
              max={20}
              step={1}
              value={yearText ?? input.reiwaYear}
              onChange={(e) => {
                const v = e.target.value;
                setYearText(v);
                const n = Number(v);
                if (Number.isInteger(n) && n >= 6 && n <= 20) set("reiwaYear", n);
              }}
              onBlur={() => setYearText(null)}
            />
          </div>
          <div className="field">
            <label htmlFor="t-staff">職員数</label>
            <input
              id="t-staff"
              type="number"
              min={1}
              max={500}
              value={input.staffCount ?? ""}
              onChange={(e) => set("staffCount", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-date">
            委員会の開催日 <span className="hint">例：2026年11月20日（金）17:30〜18:30</span>
          </label>
          <input id="t-date" type="text" maxLength={40} value={input.meetingDate} onChange={(e) => set("meetingDate", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-members">
            委員会のメンバー（役職） <span className="hint">氏名は不要です</span>
          </label>
          <input id="t-members" type="text" maxLength={200} placeholder="例：管理者、児童発達支援管理責任者、指導員2名" value={input.committeeMembers} onChange={(e) => set("committeeMembers", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-officer">虐待防止の担当者（役職）</label>
          <input id="t-officer" type="text" maxLength={60} placeholder="例：児童発達支援管理責任者" value={input.officerRole} onChange={(e) => set("officerRole", e.target.value)} />
        </div>
        <p className="hint">
          入力内容はこのブラウザの中だけで使い、次に開いたときのためにこのブラウザに保存します。サーバーには送信されず、AI も使いません。空欄の項目は【要記入】として残ります。
          共用のパソコンでは、使い終わったら「入力を消す」を押してください。
        </p>
        <div className="actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn secondary" onClick={clearInput}>入力を消す</button>
        </div>
      </form>

      <div className="tabs-row no-print" role="tablist" aria-label="書類セット">
        {parts.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === shownPart} className={p === shownPart ? "btn" : "btn secondary"} onClick={() => setPart(p)}>
            {PART_LABELS[p].replace(/（.*$/, "")}
          </button>
        ))}
      </div>

      <div className="result-part">
        <div className="result-head">
          <h2 style={{ margin: 0 }}>{label}</h2>
          <div className="actions no-print" style={{ marginTop: 0 }}>
            <button type="button" className="btn" onClick={download} disabled={saving}>
              {saving ? "作成中…" : "Wordで保存"}
            </button>
          </div>
        </div>
        <MarkdownView markdown={markdown} />
      </div>
    </>
  );
}
