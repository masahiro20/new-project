"use client";

import { useEffect, useState } from "react";
import { EMPTY_SURVEY, type Survey } from "@/lib/survey";
import type { PlanInput } from "@/lib/plan";
import type { PartialReport } from "@/lib/report";

const KEY = "kenchiku-law-agent:survey:";

type Field = { k: keyof Survey; label: string; ph?: string; half?: boolean };
const CUSTOMER: Field[] = [
  { k: "salesRep", label: "担当営業", half: true },
  { k: "name1", label: "お施主様名", ph: "山田 太郎", half: true },
  { k: "kana1", label: "フリガナ", ph: "ヤマダ タロウ", half: true },
  { k: "phone1", label: "電話番号", half: true },
  { k: "name2", label: "お施主様名（2人目）", half: true },
  { k: "kana2", label: "フリガナ（2人目）", half: true },
  { k: "currentZip", label: "現住所 〒", ph: "500-0000", half: true },
  { k: "currentAddress", label: "現住所" },
];
const SITE: Field[] = [
  { k: "siteZip", label: "建築地 〒", half: true },
  { k: "road1Direction", label: "接道の方位", ph: "南", half: true },
  { k: "lot", label: "該当地（地番・地積・地目）", ph: "空欄なら住所と入力値から作ります" },
  { k: "heightDistrict", label: "高度地区", ph: "なければ「無」", half: true },
  { k: "wallSetback", label: "壁面後退（m）", ph: "なければ「無」", half: true },
  { k: "buildingAgreement", label: "建築協定", ph: "なければ「無」", half: true },
  { k: "road2Direction", label: "2本目の接道 方位", half: true },
  { k: "road2Width", label: "2本目の道路幅員（m）", half: true },
];

/** 法令制限確認書（Excel）: customer details are optional — blanks stay blank in the sheet. */
export default function SurveyPanel({ plan, report, accessKey, suggestedLot }: { plan: PlanInput; report: PartialReport | null; accessKey: string; suggestedLot?: string | null }) {
  const storageKey = `${KEY}${plan.address.trim()}`;
  const [survey, setSurvey] = useState<Survey>(EMPTY_SURVEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(`${KEY}__last`);
      const base = saved ? { ...EMPTY_SURVEY, ...JSON.parse(saved) } : EMPTY_SURVEY;
      // The rep carries over between cases; the customer does not.
      setSurvey(localStorage.getItem(storageKey) ? base : { ...EMPTY_SURVEY, salesRep: base.salesRep });
    } catch {
      setSurvey(EMPTY_SURVEY);
    }
  }, [storageKey]);

  const set = (k: keyof Survey, v: string) =>
    setSurvey((s) => {
      const next = { ...s, [k]: v } as Survey;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        localStorage.setItem(`${KEY}__last`, JSON.stringify({ salesRep: next.salesRep }));
      } catch {
        // storage blocked
      }
      return next;
    });

  async function make() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/kakuninsho", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessKey ? { "x-access-key": accessKey } : {}) },
        body: JSON.stringify({ plan, survey, report: report?.summary ? { summary: { verdict: report.summary.verdict, topRisks: report.summary.topRisks?.slice(0, 3) } } : null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `作成できませんでした（${res.status}）`);
        return;
      }
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "法令制限確認書.xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setDone(name);
    } catch {
      setError("通信エラーで作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const input = (f: Field) => (
    <label key={f.k} className={`sf ${f.half ? "half" : ""}`}>
      <span>{f.label}</span>
      <input type="text" value={String(survey[f.k] ?? "")} placeholder={f.ph ?? ""} onChange={(e) => set(f.k, e.target.value)} />
    </label>
  );
  const select = (k: "road1Owner" | "water" | "sewage", label: string, options: string[]) => (
    <label className="sf half">
      <span>{label}</span>
      <select value={survey[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">（空欄）</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="surveycard">
      <div className="docs-row">
        <div>
          <strong>法令制限確認書（Excel）</strong>
          <span>社内書式「敷地調査　建築法令制限確認書 Ver1-2」。用途地域・建蔽率／容積率・防火・都市計画区域・接道・該当地（公図）・備考は自動で記入。顧客情報は分かる分だけ。</span>
        </div>
        <button type="button" className="btn small btn-signal" onClick={make} disabled={busy || plan.address.trim().length < 3}>
          {busy ? "作成中…" : "Excelで保存"}
        </button>
      </div>
      {error && <p className="notice">{error}</p>}
      {done && <p className="ok">「{done}」を保存しました。設備・仕様の欄は空のままです。</p>}
      <details className="survey-more">
        <summary>顧客情報・接道などを入れる<span className="hint">任意。空欄のままでも作れます</span></summary>
        {suggestedLot && !survey.lot && (
          <button type="button" className="chip-btn lot-suggest" onClick={() => set("lot", suggestedLot)}>
            公図データの「{suggestedLot.split("（")[0]}」を該当地に入れる
          </button>
        )}
        <div className="sgrid">
          <p className="sgroup">お客様</p>
          {CUSTOMER.map(input)}
          <p className="sgroup">敷地</p>
          {SITE.map(input)}
          {select("road1Owner", "道路の種類", ["国道", "県道", "市道"])}
          {select("water", "給水", ["引込有", "引込無", "要確認"])}
          {select("sewage", "排水", ["下水道", "集中浄化槽", "個別浄化槽"])}
        </div>
        <p className="hint">入力はこの端末にだけ保存されます（住所ごと）。サーバーには残りません。</p>
      </details>
    </section>
  );
}
