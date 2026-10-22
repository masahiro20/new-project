"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
import ReportView from "./ReportView";
import PrintSheet from "./PrintSheet";
import SiteMap from "./SiteMap";
import LotCard, { type LotInfo } from "./LotCard";
import SurveyPanel from "./SurveyPanel";
import Attachments, { type Attachment } from "./Attachments";
import LandSheet from "./LandSheet";
import { landFacts } from "@/lib/landsummary";
import { reportToMarkdown, tasksToCsv, type PartialReport } from "@/lib/report";
import { STAGE_HINT } from "@/lib/knowledge";
import type { AgentEvent } from "@/lib/agent";
import {
  AREA_DIVISIONS,
  BUILDING_USES,
  EMPTY_PLAN,
  EXTRAS,
  FIRE_ZONES,
  HAZARDS,
  LAND_CATEGORIES,
  ROAD_TYPES,
  STRUCTURES,
  WORK_TYPES,
  YES_NO_UNKNOWN,
  ZONINGS,
  planFromQuery,
  type PlanInput,
} from "@/lib/plan";
import { SEVERITY_SHORT, citeLabel, citeUrl, groupByAgency, groupByStage, runRules, splitFindings, type Finding } from "@/lib/rules";
import type { SiteContext } from "@/lib/site";
import { mergeSiteIntoPlan } from "@/lib/site";

const STORAGE_KEY = "kenchiku-law-agent:plan:v2";
const ACCESS_KEY = "kenchiku-law-agent:access";
const LAST_KEY = "kenchiku-law-agent:last:v1";
const TASKS_KEY = "kenchiku-law-agent:tasks:";
/** Typical length of one AI check, for the progress bar. */
const EXPECTED_SECONDS = 220;

const PLAN_EXAMPLES = [
  "木造2階建ての自宅（延べ面積110㎡）",
  "木造平屋の自宅（延べ面積90㎡）",
  "今の家を解体して木造2階建てに建て替え",
  "畑を買って木造2階建ての自宅を建てる",
  "1階が店舗の木造3階建て（兼用住宅）",
];

type Source = { tier: "条文" | "公的" | "参考"; title: string; url: string };
type Saved = {
  savedAt: string;
  address: string;
  description: string;
  report: PartialReport;
  sources: Source[];
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumberField({ id, label, unit, value, onChange, hint }: { id: string; label: string; unit: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}{" "}
        <span className="hint">
          {unit}
          {hint ? `・${hint}` : ""}
        </span>
      </label>
      <input id={id} type="number" inputMode="decimal" min={0} step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    </div>
  );
}

function SelectField<T extends string>({ id, label, value, options, onChange, hint }: { id: string; label: string; value: T; options: readonly T[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {hint && <span className="hint">{hint}</span>}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function FindingItem({ f, showAgency = true }: { f: Finding; showAgency?: boolean }) {
  const { rule, severity } = f;
  return (
    <details className="fitem">
      <summary>
        <span className={`badge ${severity}`}>{SEVERITY_SHORT[severity]}</span>
        <span className="ftitle">{rule.title}</span>
        {showAgency && <span className="agency">{rule.agency}</span>}
      </summary>
      <div className="fbody">
        <p>{rule.summary}</p>
        <p>
          <strong>やること：</strong>
          {rule.action}
        </p>
        <p className="cites">
          <span className="ev-label">出典</span>{" "}
          {rule.cites.map((c) => (
            <a key={`${c.law}:${c.article}`} href={citeUrl(c)} target="_blank" rel="noopener noreferrer">
              {citeLabel(c)}
            </a>
          ))}
          {rule.refs?.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer">
              {r.publisher}：{r.label}
            </a>
          ))}
        </p>
        <p className="roles">担当：{rule.roles.join("・")}</p>
      </div>
    </details>
  );
}

const PHASES = ["住所のデータを照合", "条文を確認", "自治体の資料を確認", "回答をまとめる"];

function phaseOf(log: string[], writing: boolean): number {
  if (writing || log.some((l) => l.includes("回答をまとめて"))) return 3;
  if (log.some((l) => l.startsWith("Web"))) return 2;
  if (log.some((l) => l.startsWith("e-Gov") || l.includes("条文と公的資料"))) return 1;
  return 0;
}

export default function ConsultClient({ accessRequired, siteLookupAvailable }: { accessRequired: boolean; siteLookupAvailable: boolean }) {
  const [plan, setPlan] = useState<PlanInput>(EMPTY_PLAN);
  const [site, setSite] = useState<SiteContext | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [report, setReport] = useState<PartialReport | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reportFinal, setReportFinal] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [taskDone, setTaskDone] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  const [copied, setCopied] = useState(false);
  const [lotInfo, setLotInfo] = useState<LotInfo | null>(null);
  const suggestedLot = (() => {
    const k = lotInfo?.kozu;
    if (k?.status === "ok") return `${k.district ?? ""}${k.query?.chiban ?? ""}（公図：${k.map?.kind ?? ""}・図上 約${k.area}㎡／地積・地目は登記簿で確認）`;
    const c = lotInfo?.chiban;
    if (c?.status === "ok" && c.lots[0]?.contains) return `${c.lots[0].oaza}${c.lots[0].chiban}（地番図より推定・登記簿で要確認）`;
    return null;
  })();
  // Once an answer is on screen, the inputs fold into one line so the answer comes first.
  const [editing, setEditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lookedUp = useRef<string>("");
  const resultRef = useRef<HTMLDivElement>(null);

  const pendingLookup = useRef(false);
  const [arrival, setArrival] = useState<"claude" | "home" | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = planFromQuery(q);
    if (fromUrl) {
      setPlan(fromUrl);
      setArrival(q.get("from") === "home" ? "home" : "claude");
      if (fromUrl.landInfo || fromUrl.extras.length) setShowDetails(true);
      pendingLookup.current = Boolean(fromUrl.address);
      window.history.replaceState(null, "", "/consult");
    } else {
      setPlan(load(STORAGE_KEY, EMPTY_PLAN));
    }
    try {
      setAccessKey(localStorage.getItem(ACCESS_KEY) ?? "");
      const last = localStorage.getItem(LAST_KEY);
      if (last) setSaved(JSON.parse(last) as Saved);
    } catch {
      // storage blocked
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // storage blocked: the form still works, it just won't persist
    }
  }, [plan]);

  // Progress clock while the AI works.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // Task checkmarks are kept per answer on this device.
  const taskKey = report?.summary?.headline ? `${TASKS_KEY}${hash(`${plan.address}|${report.summary.headline}`)}` : null;
  useEffect(() => {
    if (!taskKey || !reportFinal) return;
    try {
      setTaskDone(JSON.parse(localStorage.getItem(taskKey) ?? "{}"));
    } catch {
      setTaskDone({});
    }
  }, [taskKey, reportFinal]);
  const toggleTask = (i: number) =>
    setTaskDone((d) => {
      const next = { ...d, [i]: !d[i] };
      try {
        if (taskKey) localStorage.setItem(taskKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) => setPlan((p) => ({ ...p, [key]: value }));
  const toggle = <K extends "hazards" | "extras">(key: K, item: PlanInput[K][number]) =>
    setPlan((p) => {
      const list = p[key] as string[];
      return {
        ...p,
        [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
      };
    });

  const headers = () => ({
    "Content-Type": "application/json",
    ...(accessKey ? { "x-access-key": accessKey } : {}),
  });

  async function lookup(force = false) {
    const address = plan.address.trim();
    if (address.length < 3) return;
    if (!force && lookedUp.current === address) return;
    lookedUp.current = address;
    setSiteBusy(true);
    setSiteError(null);
    try {
      localStorage.setItem(ACCESS_KEY, accessKey);
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`/api/site?address=${encodeURIComponent(address)}`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) {
        setSiteError(data.error ?? "取得に失敗しました。");
        setSite(null);
        return;
      }
      setSite(data as SiteContext);
    } catch {
      setSiteError("通信エラーで土地情報を取得できませんでした。");
    } finally {
      setSiteBusy(false);
    }
  }

  useEffect(() => {
    if (pendingLookup.current && plan.address.trim().length >= 3) {
      pendingLookup.current = false;
      lookup(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.address]);

  // The plan the rules and the agent actually see: user choices win, lookup fills the blanks.
  const effective = useMemo(() => mergeSiteIntoPlan(plan, site), [plan, site]);
  const findings = useMemo(() => (plan.description.trim().length >= 5 ? runRules(effective) : []), [plan.description, effective]);
  const split = useMemo(() => splitFindings(findings), [findings]);
  const agencies = useMemo(() => groupByAgency([...split.specific, ...split.checks]), [split]);

  async function consult() {
    if (plan.description.trim().length < 5) {
      setError("「何を建てたいか」を入れてください（下の例を押すと入ります）。");
      document.getElementById("description")?.focus();
      return;
    }
    setError(null);
    setText("");
    setReport(null);
    setReportFinal(false);
    setTaskDone({});
    setLog([]);
    setSources([]);
    setDone(false);
    setBusy(true);
    setEditing(false);
    setStartedAt(Date.now());
    setNow(Date.now());
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
    try {
      localStorage.setItem(ACCESS_KEY, accessKey);
    } catch {
      // ignore
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let finalReport: PartialReport | null = null;
    const found: Source[] = [];
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          ...plan,
          documents: attachments.map(({ name, mediaType, data }) => ({
            name,
            mediaType,
            data,
          })),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `エラーが発生しました（${res.status}）。`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let sawDone = false;
      let sawReport = false;
      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: AgentEvent;
          try {
            ev = JSON.parse(line) as AgentEvent;
          } catch {
            continue;
          }
          if (ev.type === "report_partial") {
            sawReport = true;
            finalReport = ev.report;
            setReport(ev.report);
          } else if (ev.type === "report") {
            sawReport = true;
            finalReport = ev.report;
            setReport(ev.report);
            setReportFinal(true);
          } else if (ev.type === "text") {
            acc += ev.delta;
            setText(acc);
          } else if (ev.type === "status" || ev.type === "tool") {
            setLog((l) => [...l, ev.type === "status" ? ev.text : ev.summary]);
          } else if (ev.type === "source") {
            if (!found.some((x) => x.url === ev.url)) found.push({ tier: ev.tier, title: ev.title, url: ev.url });
            setSources([...found]);
          } else if (ev.type === "error") {
            sawDone = true;
            setError(ev.message);
          } else if (ev.type === "done") {
            sawDone = true;
            setDone(true);
          }
        }
      }
      if (!sawDone)
        setError(
          sawReport
            ? "時間の上限で回答が途中で切れました。表示されている部分は有効です。続きが必要なら「AIで詳しくチェック」をもう一度押してください。"
            : "回答が完了しませんでした（時間の上限の可能性）。もう一度お試しください。",
        );
      if (finalReport?.summary) {
        const entry: Saved = {
          savedAt: new Date().toISOString(),
          address: plan.address,
          description: plan.description,
          report: finalReport,
          sources: found,
        };
        setSaved(entry);
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify(entry));
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function openSaved() {
    if (!saved) return;
    setPlan((p) => ({
      ...p,
      address: saved.address,
      description: saved.description,
    }));
    setReport(saved.report);
    setSources(saved.sources);
    setReportFinal(true);
    setDone(true);
    setLog([]);
    if (saved.address && saved.address !== plan.address) {
      pendingLookup.current = true;
    } else if (!site && saved.address) {
      lookup(true);
    }
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  }

  async function copyResult() {
    const src = sources.map((s) => `- 【${s.tier}】${s.title} ${s.url}`).join("\n");
    const land = facts.map((f) => `- ${f.label}：${f.value}［${f.certainty}${f.cites.length ? `・出典：${f.cites.map((c) => c.label).join("、")}` : ""}］`).join("\n");
    const body = report ? reportToMarkdown(report) : text;
    await navigator.clipboard.writeText(`# ${plan.address}\n${plan.description}\n\n## 土地のまとめ\n${land}\n\n${body}\n\n---\n参照した出典\n${src}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const facts = useMemo(() => (site ? landFacts(effective, site) : []), [effective, site]);
  const sourceCounts = useMemo(() => sources.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.tier]: (acc[x.tier] ?? 0) + 1 }), {}), [sources]);
  const elapsed = startedAt && busy ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const phase = phaseOf(log, Boolean(report));
  const location = site ? (site.matched ? `${site.matched}（地図上の代表点で判定）` : "位置を特定できませんでした") : null;
  const step = report ? 4 : busy ? 3 : plan.description.trim().length >= 5 ? 3 : site ? 2 : 1;
  const canRun = plan.description.trim().length >= 5 && !busy;
  const collapsed = Boolean(report) && !busy && !editing;

  const landBlock = (site || siteBusy || siteError) && (
    <>
      <div className={site && !siteError ? "card envcard" : "notice"} style={{ marginBottom: 20 }}>
        {siteBusy && (
          <div className="scanning" role="status">
            <span className="radar" aria-hidden />
            <p>住所の位置を特定し、都市計画・災害・農地・川のデータを照合しています…</p>
          </div>
        )}
        {siteError && <p>{siteError}</p>}
        {site && !siteBusy && (
          <>
            {!site.apiAvailable && (
              <p className="notice" style={{ margin: "0 0 12px" }}>
                不動産情報ライブラリの API キーが未設定のため、用途地域などは取得できていません。下の「詳しい条件」で手入力してください。
              </p>
            )}
            <LandSheet facts={facts} location={location ?? ""} notes={site.derived.notes} />
          </>
        )}
      </div>
    </>
  );

  const toolsBlock = site && !siteBusy && (
    <div className="tools">
      {site.lat !== null && site.lon !== null && <SiteMap lat={site.lat} lon={site.lon} label={plan.address} />}
      {site.lat !== null && site.lon !== null && <LotCard address={plan.address} lat={site.lat} lon={site.lon} accessKey={accessKey} onInfo={setLotInfo} />}
      <div id="survey">
        <SurveyPanel plan={plan} report={report} accessKey={accessKey} suggestedLot={suggestedLot} />
      </div>
    </div>
  );

  return (
    <>
      <ol className="steps no-print" aria-label="進め方">
        {["住所を入れる", "何を建てるか", "AIでチェック", "結果を使う"].map((label, i) => (
          <li key={label} className={step > i + 1 ? "is-done" : step === i + 1 ? "is-current" : ""}>
            <span className="steps-n">{step > i + 1 ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {saved && !report && !busy && (
        <div className="resume no-print">
          <span>
            前回の結果：<strong>{saved.address || "住所なし"}</strong>
            <span className="hint">
              （
              {new Date(saved.savedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              ）
            </span>
          </span>
          <button type="button" className="btn small secondary" onClick={openSaved}>
            開く
          </button>
        </div>
      )}

      <div className={`layout no-print ${report ? "has-report" : ""}`}>
        <div>
          <form onSubmit={(e) => e.preventDefault()}>
            {arrival === "claude" && (
              <p className="ok" style={{ marginTop: 0 }}>
                Claude から開きました。住所・計画・資料から読み取った内容を入れてあります（資料のメモは「詳しい条件」の一番下）。内容を確かめて「AIで詳しくチェック」を押してください。
              </p>
            )}
            {collapsed ? (
              <div className="formsum">
                <dl>
                  <dt>住所</dt>
                  <dd>{plan.address || "—"}</dd>
                  <dt>計画</dt>
                  <dd>{plan.description || "—"}</dd>
                </dl>
                <button type="button" className="btn small secondary" onClick={() => setEditing(true)}>
                  入力を変える
                </button>
              </div>
            ) : (
              <div className="panel">
                {accessRequired && (
                  <div className="field">
                    <label htmlFor="accessKey">
                      アクセスキー <span className="hint">社内で共有しているキー。最初の1回だけ（この端末に保存されます）</span>
                    </label>
                    <input id="accessKey" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" placeholder="アクセスキー" />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="address" className="big-label">
                    <span className="label-n">1</span>敷地の住所
                  </label>
                  <div className="address-row">
                    <input
                      id="address"
                      type="text"
                      maxLength={200}
                      value={plan.address}
                      placeholder="例：静岡県浜松市中央区元城町103-2"
                      onChange={(e) => set("address", e.target.value)}
                      onBlur={() => lookup()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookup(true);
                        }
                      }}
                    />
                    <button type="button" className="btn" onClick={() => lookup(true)} disabled={siteBusy || plan.address.trim().length < 3}>
                      {siteBusy ? "調べています…" : "土地を調べる"}
                    </button>
                  </div>
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    番地まで入れると、用途地域・農地・川・浸水などを国のデータで数秒で調べます。
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="description" className="big-label">
                    <span className="label-n">2</span>何を建てたいか
                  </label>
                  <textarea
                    id="description"
                    maxLength={4000}
                    value={plan.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="一文で十分です。例：木造2階建ての自宅（延べ面積110㎡）"
                    style={{ minHeight: 72 }}
                  />
                  <div className="chips" aria-label="入力例">
                    {PLAN_EXAMPLES.map((ex) => (
                      <button key={ex} type="button" className="chip-btn" onClick={() => set("description", ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
                <Attachments files={attachments} onChange={setAttachments} />
              </div>
            )}

            {!report && landBlock}

            {!collapsed && (
              <>
                <details className="more" open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
                  <summary>
                    分かれば入れる（任意）
                    <span className="hint">　規模・道路・地目・盛土・自動取得の手直し・資料のメモ</span>
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    <div className="field-row">
                      <SelectField id="workType" label="工事種別" value={plan.workType} options={WORK_TYPES} onChange={(v) => set("workType", v)} />
                      <SelectField id="buildingUse" label="建物用途" value={plan.buildingUse} options={BUILDING_USES} onChange={(v) => set("buildingUse", v)} />
                      <SelectField id="structure" label="構造" value={plan.structure} options={STRUCTURES} onChange={(v) => set("structure", v)} />
                    </div>
                    <div className="field-row">
                      <NumberField id="floors" label="階数" unit="階" value={plan.floors} onChange={(v) => set("floors", v === null ? null : Math.round(v))} />
                      <NumberField id="totalFloorArea" label="延べ面積" unit="㎡" value={plan.totalFloorArea} onChange={(v) => set("totalFloorArea", v)} hint="概算で可" />
                      <NumberField id="siteArea" label="敷地面積" unit="㎡" value={plan.siteArea} onChange={(v) => set("siteArea", v)} hint="上限面積の目安が出ます" />
                      <SelectField id="landCategory" label="登記の地目" value={plan.landCategory} options={LAND_CATEGORIES} onChange={(v) => set("landCategory", v)} />
                    </div>
                    <div className="field-row">
                      <NumberField id="roadWidth" label="前面道路の幅員" unit="m" value={plan.roadWidth} onChange={(v) => set("roadWidth", v)} />
                      <NumberField id="frontage" label="接道長さ" unit="m" value={plan.frontage} onChange={(v) => set("frontage", v)} hint="旗竿地は路地の幅" />
                      <SelectField id="roadType" label="前面道路の種別" value={plan.roadType} options={ROAD_TYPES} onChange={(v) => set("roadType", v)} />
                    </div>
                    <div className="field-row">
                      <NumberField id="fillHeight" label="盛土の高さ" unit="m" value={plan.fillHeight} onChange={(v) => set("fillHeight", v)} />
                      <NumberField id="cutHeight" label="切土の高さ" unit="m" value={plan.cutHeight} onChange={(v) => set("cutHeight", v)} />
                      <NumberField id="earthworkArea" label="盛土・切土の面積" unit="㎡" value={plan.earthworkArea} onChange={(v) => set("earthworkArea", v)} />
                      <NumberField id="demolitionArea" label="解体する建物の床面積" unit="㎡" value={plan.demolitionArea} onChange={(v) => set("demolitionArea", v)} hint="建て替え時" />
                    </div>
                    <p className="hint">自動取得の結果が都市計画図と違うときは、ここで選び直してください。手で選んだ値が優先されます。</p>
                    <div className="field-row">
                      <SelectField id="areaDivision" label="区域区分" value={plan.areaDivision} options={AREA_DIVISIONS} onChange={(v) => set("areaDivision", v)} />
                      <SelectField id="zoning" label="用途地域" value={plan.zoning} options={ZONINGS} onChange={(v) => set("zoning", v)} />
                      <SelectField id="fireZone" label="防火指定" value={plan.fireZone} options={FIRE_ZONES} onChange={(v) => set("fireZone", v)} />
                      <SelectField id="farmlandBlue" label="農用地区域（青地）か" value={plan.farmlandBlue} options={YES_NO_UNKNOWN} onChange={(v) => set("farmlandBlue", v)} />
                    </div>
                    <div className="field-row">
                      <NumberField id="buildingArea" label="建築面積" unit="㎡" value={plan.buildingArea} onChange={(v) => set("buildingArea", v)} />
                      <NumberField id="height" label="最高高さ" unit="m" value={plan.height} onChange={(v) => set("height", v)} />
                      <NumberField id="contractAmountMan" label="請負金額" unit="万円" value={plan.contractAmountMan} onChange={(v) => set("contractAmountMan", v)} />
                    </div>
                    <div className="field">
                      <label>該当する区域・指定（自動取得に追加）</label>
                      <div className="check-grid">
                        {HAZARDS.map((h) => (
                          <label key={h}>
                            <input
                              type="checkbox"
                              checked={effective.hazards.includes(h)}
                              disabled={site?.derived.hazards.includes(h) && !plan.hazards.includes(h)}
                              onChange={() => toggle("hazards", h)}
                            />{" "}
                            {h}
                            {site?.derived.hazards.includes(h) && <span className="hint">（自動）</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label>その他該当する事項</label>
                      <div className="check-grid">
                        {EXTRAS.map((x) => (
                          <label key={x}>
                            <input type="checkbox" checked={plan.extras.includes(x)} onChange={() => toggle("extras", x)} /> {x}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="landInfo">
                        資料のメモ <span className="hint">登記事項、公図・測量図の要点、重要事項説明書の抜き書きなど</span>
                      </label>
                      <textarea id="landInfo" maxLength={6000} value={plan.landInfo} onChange={(e) => set("landInfo", e.target.value)} />
                    </div>
                  </div>
                </details>

                {!siteLookupAvailable && (
                  <p className="notice" style={{ marginTop: 16 }}>
                    住所からの自動取得（用途地域・区域区分・防火指定・災害区域）には、国土交通省 不動産情報ライブラリの API キー（無料・申請制）が必要です。サーバーの環境変数 REINFOLIB_API_KEY
                    に設定してください。
                  </p>
                )}

                {error && <p className="notice">{error}</p>}

                <div className="runbar">
                  <button type="button" className="btn btn-run" onClick={consult} disabled={!canRun}>
                    {busy ? "チェック中…" : report ? "もう一度AIでチェック" : "AIで詳しくチェック"}
                  </button>
                  {busy ? (
                    <button type="button" className="btn secondary" onClick={() => abortRef.current?.abort()}>
                      中止
                    </button>
                  ) : (
                    <span className="hint">約3〜4分。条文と自治体の公式資料を確認し、出典付きでまとめます。</span>
                  )}
                  {!busy && (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        setPlan(EMPTY_PLAN);
                        setSite(null);
                        lookedUp.current = "";
                        setText("");
                        setReport(null);
                        setReportFinal(false);
                        setAttachments([]);
                        setSources([]);
                        setLog([]);
                        setError(null);
                      }}
                    >
                      入力をクリア
                    </button>
                  )}
                </div>
              </>
            )}
          </form>

          {!report && toolsBlock}

          <div ref={resultRef} style={{ scrollMarginTop: 80 }}>
            {(text || report || busy) && (
              <div style={{ marginTop: 28 }}>
                <div className="result-head">
                  <div>
                    <p className="card-kicker">RESULT</p>
                    <h2 style={{ margin: 0 }}>チェック結果</h2>
                  </div>
                  {(done || (report && !busy)) && (
                    <div className="toolbar">
                      <button type="button" className="btn small" onClick={() => window.print()}>
                        PDFで保存
                      </button>
                      <button type="button" className="btn small btn-signal" onClick={() => document.getElementById("survey")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        法令制限確認書（Excel）
                      </button>
                      {report?.tasks && report.tasks.length > 0 && (
                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={() => download(`タスク_${plan.address || "案件"}.csv`, tasksToCsv(report.tasks, taskDone), "text/csv;charset=utf-8")}
                        >
                          タスクをCSV
                        </button>
                      )}
                      <button type="button" className="btn small secondary" onClick={copyResult}>
                        {copied ? "コピーしました" : "出典付きでコピー"}
                      </button>
                    </div>
                  )}
                </div>
                {busy && !reportFinal && (
                  <div className="runprogress" role="status">
                    <div className="radar big" aria-hidden>
                      <span className="sweep" />
                      <span className="blip b1" />
                      <span className="blip b2" />
                      <span className="blip b3" />
                      <strong className="radar-time">
                        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                      </strong>
                    </div>
                    <div className="runprogress-body">
                      <div className="runprogress-top">
                        <span className="dot-live" aria-hidden />
                        <strong>{PHASES[phase]}…</strong>
                        <span className="hint">
                          {Math.floor(elapsed / 60)}分{String(elapsed % 60).padStart(2, "0")}秒 経過（目安3〜4分）
                        </span>
                      </div>
                      <div className="bar">
                        <span
                          style={{
                            width: `${Math.min(97, Math.max((phase / PHASES.length) * 100, (elapsed / EXPECTED_SECONDS) * 100))}%`,
                          }}
                        />
                      </div>
                      <ol className="phases">
                        {PHASES.map((p, i) => (
                          <li key={p} className={i < phase ? "is-done" : i === phase ? "is-current" : ""}>
                            {p}
                          </li>
                        ))}
                      </ol>
                      {log.length > 0 && <p className="hint runlog">{log[log.length - 1]}</p>}
                      <p className="hint">画面はこのままでお待ちください。結論から順に表示されます。</p>
                    </div>
                  </div>
                )}
                {report ? (
                  <ReportView report={report} streaming={busy && !reportFinal} sourceCounts={reportFinal ? sourceCounts : undefined} taskDone={taskDone} onToggleTask={toggleTask} />
                ) : (
                  text && <MarkdownView markdown={text} />
                )}
                {!busy && log.length > 0 && (
                  <details className="progress">
                    <summary>AIが調べた手順（{log.length}件）</summary>
                    <ul className="log">
                      {log.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {sources.length > 0 && (
                  <details className="card sources-card" style={{ marginTop: 16 }}>
                    <summary>参照した出典の一覧（{sources.length}件）</summary>
                    <ul className="sources">
                      {sources.map((s) => (
                        <li key={s.url}>
                          <span className={`badge tier-${s.tier}`}>{s.tier}</span>
                          <a href={s.url} target="_blank" rel="noopener noreferrer">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {report && (
              <div style={{ marginTop: 20 }}>
                {landBlock}
                {toolsBlock}
              </div>
            )}
          </div>
        </div>

        <aside className="sticky side">
          <div className="card">
            <div className="side-head">
              <h3>すぐ分かる論点</h3>
              {findings.length > 0 && !report && (
                <button type="button" className="btn small secondary" onClick={() => window.print()}>
                  PDFで保存
                </button>
              )}
            </div>
            <p className="hint" style={{ margin: "0 0 10px" }}>
              住所のデータと入力を、条文照合済みのルールに当てはめた自動判定です（AIを使わず即時）。
            </p>
            {findings.length === 0 ? (
              <div className="empty">
                <p>住所と「何を建てたいか」を入れると、ここに論点と窓口が出ます。</p>
              </div>
            ) : (
              <>
                <div className="counts">
                  <span>
                    <strong>{split.specific.length}</strong>この敷地・計画に固有
                  </span>
                  <span>
                    <strong>{split.checks.length}</strong>窓口で確認
                  </span>
                  <span>
                    <strong>{split.routine.length}</strong>毎回の手続き
                  </span>
                </div>

                {agencies.length > 0 && (
                  <div className="side-sec">
                    <h4>先に聞きに行く窓口</h4>
                    {agencies.slice(0, 8).map(({ agency, items }) => (
                      <details key={agency} className="agency-fold">
                        <summary>
                          <strong>{agency}</strong>
                          <span className="pill tone-info">{items.length}件</span>
                        </summary>
                        <ul>
                          {items.map((f) => (
                            <li key={f.rule.id}>{f.rule.title}</li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}

                {split.specific.length > 0 && (
                  <div className="side-sec">
                    <h4>この敷地・計画ならではの論点</h4>
                    {groupByStage(split.specific).map(({ stage, items }) => (
                      <div key={stage} className="stage">
                        <p className="stage-name">
                          {stage}
                          <span className="hint">　{STAGE_HINT[stage]}</span>
                        </p>
                        {items.map((f) => (
                          <FindingItem key={f.rule.id} f={f} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {split.checks.length > 0 && (
                  <div className="side-sec">
                    <h4>窓口で確認すること（入力不足・条例次第）</h4>
                    {split.checks.map((f) => (
                      <FindingItem key={f.rule.id} f={f} />
                    ))}
                  </div>
                )}

                {split.routine.length > 0 && (
                  <details className="routine">
                    <summary>通常の新築で毎回必要な手続き（{split.routine.length}件）</summary>
                    {split.routine.map((f) => (
                      <FindingItem key={f.rule.id} f={f} />
                    ))}
                  </details>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <PrintSheet
        plan={effective}
        location={location}
        facts={facts}
        report={report}
        findings={findings}
        sources={sources}
        taskDone={taskDone}
        map={site && site.lat !== null && site.lon !== null ? { lat: site.lat, lon: site.lon } : null}
        lot={lotInfo}
      />
    </>
  );
}
