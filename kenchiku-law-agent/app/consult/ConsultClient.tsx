"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
import ReportView from "./ReportView";
import PrintSheet from "./PrintSheet";
import SiteMap from "./SiteMap";
import LotCard, { type LotInfo } from "./LotCard";
import SurveyPanel, { CustomerFields, useSurvey } from "./SurveyPanel";
import Rail, { type RailItem } from "./Rail";
import Section from "../components/Section";
import Attachments, { type Attachment } from "./Attachments";
import LandSheet from "./LandSheet";
import SiteProgress from "./SiteProgress";
import DesignCheckView from "./DesignCheckView";
import ViewSwitch, { VIEW_KEY, type ViewMode } from "./ViewSwitch";
import SalesBriefView from "./SalesBriefView";
import { salesBrief } from "@/lib/salesbrief";
import { designCheck } from "@/lib/designcheck";
import { landFacts, type SurveyFacts } from "@/lib/landsummary";
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
  scaleFromDescription,
  type PlanInput,
} from "@/lib/plan";
import { SEVERITY_SHORT, citeLabel, citeUrl, groupByAgency, groupByStage, runRules, splitFindings, type Finding } from "@/lib/rules";
import type { SiteContext, SiteStepId } from "@/lib/site";
import { SITE_STEPS, mergeSiteIntoPlan } from "@/lib/site";

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

const ASK_EXAMPLES = ["将来二世帯にできるか", "駐車場を3台確保したい", "3階建てにしたら何が変わるか", "平屋にした場合の建蔽率", "店舗・事務所を併設したい", "庭に倉庫・カーポートを置きたい"];

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
  const [ranWith, setRanWith] = useState("");
  const [view, setViewState] = useState<ViewMode>("すべて");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "営業" || v === "設計" || v === "すべて") setViewState(v);
    } catch {
      // storage blocked
    }
  }, []);
  const setView = (v: ViewMode) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked
    }
  };
  const forDesign = view !== "営業";
  const forSales = view !== "設計";
  const scrollOnDone = useRef(false);
  // 住所の読み込みの進み具合（サーバーから届いたデータのまとまり）と所要時間
  const [siteSteps, setSiteSteps] = useState<SiteStepId[]>([]);
  const [siteStartedAt, setSiteStartedAt] = useState<number | null>(null);
  const [siteSeconds, setSiteSeconds] = useState<number | null>(null);
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
  // 敷地調査・お客様情報（この端末にだけ保存）。上下水・ガス・壁面後退・高度地区は土地情報まとめにも反映する。
  const [survey, setSurveyField] = useSurvey(plan.address);
  const surveyFacts = useMemo<SurveyFacts>(
    () => ({ wallSetback: survey.wallSetback, heightDistrict: survey.heightDistrict, water: survey.water, sewage: survey.sewage, gas: survey.gas }),
    [survey.wallSetback, survey.heightDistrict, survey.water, survey.sewage, survey.gas],
  );
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

  // Progress clock while the AI works or the address is being read.
  useEffect(() => {
    if (!busy && !siteBusy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy, siteBusy]);

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

  function showLand() {
    const el = document.getElementById("s-land");
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  /** The button next to the address: runs the lookup, or jumps to the result when it is already there. */
  function onLookupClick() {
    // Already running (e.g. started when the address field lost focus): show the result when it lands.
    if (siteBusy) {
      scrollOnDone.current = true;
      return;
    }
    if (site && !siteError && site.address === plan.address.trim()) {
      showLand();
      return;
    }
    lookup(true, true);
  }

  async function lookup(force = false, fromClick = false) {
    const address = plan.address.trim();
    if (address.length < 3) return;
    if (!force && lookedUp.current === address) return;
    scrollOnDone.current = fromClick;
    lookedUp.current = address;
    setSiteBusy(true);
    setSiteError(null);
    try {
      localStorage.setItem(ACCESS_KEY, accessKey);
    } catch {
      // ignore
    }
    const t0 = Date.now();
    setSiteSteps([]);
    setSiteSeconds(null);
    setSiteStartedAt(t0);
    setNow(t0);
    try {
      const res = await fetch(`/api/site?address=${encodeURIComponent(address)}&stream=1`, { headers: headers() });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setSiteError(data.error ?? "取得に失敗しました。");
        setSite(null);
        return;
      }
      // NDJSON: a line per data group as it arrives, then the whole site.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let got: SiteContext | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: "step"; id: SiteStepId } | { type: "site"; site: SiteContext } | { type: "error"; error: string };
          if (ev.type === "step") setSiteSteps((prev) => (prev.includes(ev.id) ? prev : [...prev, ev.id]));
          else if (ev.type === "site") got = ev.site;
          else setSiteError(ev.error);
        }
      }
      if (got) {
        setSite(got);
        setSiteSeconds(Math.max(1, Math.round((Date.now() - t0) / 1000)));
        // A click means "show me": bring the result into view once it has rendered.
        if (scrollOnDone.current) setTimeout(showLand, 80);
        scrollOnDone.current = false;
      } else setSite(null);
    } catch {
      setSiteError("通信エラーで土地情報を取得できませんでした。");
    } finally {
      setSiteBusy(false);
      setSiteStartedAt(null);
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
    setRanWith(runKey);
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
    await navigator.clipboard.writeText(`# ${plan.address}\n${plan.description}\n\n## 土地情報まとめ\n${land}\n\n${body}\n\n---\n参照した出典\n${src}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const design = useMemo(() => designCheck(effective), [effective]);
  const facts = useMemo(() => (site ? landFacts(effective, site, surveyFacts) : []), [effective, site, surveyFacts]);
  const sourceCounts = useMemo(() => sources.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.tier]: (acc[x.tier] ?? 0) + 1 }), {}), [sources]);
  const elapsed = startedAt && busy ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const phase = phaseOf(log, Boolean(report));
  const location = site ? (site.matched ? `${site.matched}（地図上の代表点で判定）` : "位置を特定できませんでした") : null;
  const step = report ? 4 : busy ? 3 : plan.description.trim().length >= 5 ? 3 : site ? 2 : 1;
  const canRun = plan.description.trim().length >= 5 && !busy;
  const askLines = plan.asks
    .split(/\n+/)
    .map((l) => l.trim().replace(/^(?:[-・*]|\d+[.、)）])\s*/, ""))
    .filter(Boolean);
  const runKey = JSON.stringify([plan.description.trim(), askLines, attachments.map((a) => a.name), plan.address.trim()]);
  const stale = Boolean(report && !busy && ranWith && ranWith !== runKey);
  const descScale = scaleFromDescription(plan.description);
  const readScale =
    (plan.floors === null && descScale.floors !== null) || (plan.totalFloorArea === null && descScale.totalFloorArea !== null)
      ? [plan.floors === null && descScale.floors !== null ? `${descScale.floors}階建て` : "", plan.totalFloorArea === null && descScale.totalFloorArea !== null ? `延べ${descScale.totalFloorArea}㎡` : ""].filter(Boolean).join("・")
      : "";
  const collapsed = Boolean(report) && !busy && !editing;

  const hasSite = Boolean(site && !siteBusy);
  const siteReady = Boolean(site && !siteBusy && !siteError && site.address === plan.address.trim());
  const hasMap = Boolean(hasSite && site && site.lat !== null && site.lon !== null);
  const resultVisible = Boolean(text || report || busy);
  const rail: RailItem[] = [
    { id: "s-input", no: "01", label: "計画を入れる", ready: true },
    { id: "s-land", no: "02", label: "土地情報まとめ", ready: Boolean(site || siteBusy || siteError), note: siteBusy ? "読込中" : undefined },
    { id: "s-maps", no: "03", label: "案内図・公図", ready: hasMap },
    { id: "s-issues", no: "04", label: "法令の論点", hidden: !forDesign, ready: findings.length > 0, note: findings.length ? String(split.specific.length + split.checks.length) : undefined },
    { id: "s-design", no: "05", label: "設計条件（設計者向け）", hidden: !forDesign, ready: findings.length > 0, note: findings.length ? String(design.items.filter((i) => i.verdict === "該当").length) : undefined },
    { id: "s-result", no: "06", label: "AIの詳しいチェック", ready: true, note: busy ? "実行中" : report ? "済" : undefined },
    { id: "s-docs", no: "07", label: "書類を作る", ready: hasSite },
  ];

  const runControls = (
    <div className="runbar">
      <button type="button" className="btn btn-run" onClick={consult} disabled={!canRun}>
        {busy ? "チェック中…" : stale ? "今の入力でもう一度チェック" : report ? "もう一度AIでチェック" : "AIで詳しくチェック"}
      </button>
      {busy ? (
        <button type="button" className="btn secondary" onClick={() => abortRef.current?.abort()}>
          中止
        </button>
      ) : (
        <span className="hint">約3〜4分。条文と自治体の公式資料を確認し、出典付きでまとめます。</span>
      )}
    </div>
  );

  return (
    <>
      <header className="ws-hero no-print">
        <div className="wrap ws-hero-inner">
          <p className="page-en">Survey</p>
          <p className="page-kicker">土地・法令調査</p>
          <h1 className="ws-title">{plan.address.trim() || "土地を調べる"}</h1>
          <p className="ws-sub">{plan.description.trim() || "住所と「何を建てたいか」を入れると、土地のまとめ・図面・論点がその場で、AIの詳しいチェックは約3〜4分で出ます。"}</p>
          <ol className="ws-progress" aria-label="進み具合">
            {["住所", "計画", "AIチェック", "書類"].map((label, i) => (
              <li key={label} className={step > i + 1 ? "is-done" : step === i + 1 ? "is-current" : ""}>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="wrap ws no-print">
        <Rail items={rail} title={plan.address.trim() || "新しい案件"} />

        <div className="ws-main">
          {saved && !report && !busy && (
            <div className="resume">
              <span>
                前回の結果　<strong>{saved.address || "住所なし"}</strong>
                <span className="hint">
                  （{new Date(saved.savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）
                </span>
              </span>
              <button type="button" className="linkbtn" onClick={openSaved}>
                開く →
              </button>
            </div>
          )}

          <Section id="s-input" no="01" title="計画を入れる" lead="住所は地番まで。分からない項目は空欄のままで大丈夫です。">
            <form onSubmit={(e) => e.preventDefault()}>
              {arrival === "claude" && <p className="ok">Claude から開きました。住所・計画・資料から読み取った内容を入れてあります（資料のメモは「分かれば入れる」の一番下）。</p>}
              {collapsed ? (
                <div className="formsum">
                  <dl>
                    <dt>住所</dt>
                    <dd>{plan.address || "—"}</dd>
                    <dt>計画</dt>
                    <dd>{plan.description || "—"}</dd>
                    {plan.asks.trim() && (
                      <>
                        <dt>AIへ</dt>
                        <dd>{plan.asks.trim().split(/\n+/).join("／")}</dd>
                      </>
                    )}
                  </dl>
                  <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
                    入力を変える →
                  </button>
                </div>
              ) : (
                <>
                  {accessRequired && (
                    <div className="field field-key">
                      <label htmlFor="accessKey">アクセスキー</label>
                      <input id="accessKey" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" placeholder="社内で共有しているキー（この端末に保存）" />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="address" className="big-label">
                      敷地の住所
                    </label>
                    <div className="address-row">
                      <input
                        id="address"
                        className="input-xl"
                        type="text"
                        maxLength={200}
                        value={plan.address}
                        placeholder="例：浜松市中央区元城町103-2"
                        onChange={(e) => set("address", e.target.value)}
                        onBlur={() => lookup()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onLookupClick();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={`btn lookup-btn${siteBusy ? " is-busy" : ""}${siteReady ? " is-ready" : ""}`}
                        onClick={onLookupClick}
                        disabled={plan.address.trim().length < 3}
                        aria-busy={siteBusy}
                      >
                        {siteBusy ? (
                          <>
                            <span className="spinner" aria-hidden />
                            調べています
                          </>
                        ) : siteReady ? (
                          <>
                            土地情報を見る<span aria-hidden>↓</span>
                          </>
                        ) : (
                          "土地を調べる"
                        )}
                      </button>
                    </div>
                    {(siteBusy || siteReady || siteError) && (
                      <div className={`lookup-status${siteBusy ? " is-busy" : siteError ? " is-error" : " is-done"}`} role="status" aria-live="polite">
                        {siteBusy ? (
                          <>
                            <span className="lookup-bar" aria-hidden>
                              <i style={{ width: `${Math.max(6, (siteSteps.length / SITE_STEPS.length) * 100)}%` }} />
                            </span>
                            <span>
                              国の公開データを照合しています（{siteSteps.length}/{SITE_STEPS.length}・{siteStartedAt ? Math.max(0, Math.round((now - siteStartedAt) / 1000)) : 0}秒）
                              {SITE_STEPS.find((s) => !siteSteps.includes(s.id)) && <em>　{SITE_STEPS.find((s) => !siteSteps.includes(s.id))!.label}</em>}
                            </span>
                          </>
                        ) : siteError ? (
                          <span>{siteError}</span>
                        ) : (
                          <>
                            <span className="lookup-check" aria-hidden>
                              ✓
                            </span>
                            <span>
                              土地情報を読み込みました{siteSeconds !== null ? `（${siteSeconds}秒）` : ""}。
                              <button type="button" className="linkbtn" onClick={showLand}>
                                結果を見る ↓
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="description" className="big-label">
                      何を建てたいか
                      <span className="flow-tag flow-now">すぐ反映 → 法令の論点・設計条件</span>
                    </label>
                    <textarea id="description" maxLength={4000} value={plan.description} onChange={(e) => set("description", e.target.value)} placeholder="一文で十分です。例：木造2階建ての自宅（延べ面積110㎡）" rows={2} />
                    {readScale && (
                      <p className="read-scale">
                        文章から読み取り：{readScale}
                        <span className="hint">（防火・構造の判定に使います。違うときは「分かれば入れる」の階数・延べ面積で直せます）</span>
                      </p>
                    )}
                    <div className="examples" aria-label="入力例">
                      <span>例</span>
                      {PLAN_EXAMPLES.map((ex) => (
                        <button key={ex} type="button" onClick={() => set("description", ex)}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="asks" className="big-label">
                      AIに見てほしいこと
                      <span className="flow-tag flow-ai">「AIで詳しくチェック」を押すと反映</span>
                      <span className="hint">任意。想定している使い方・気になっていること・知りたいことを1行に1つ。AIが1つずつ答えます</span>
                    </label>
                    <textarea id="asks" maxLength={2000} value={plan.asks} onChange={(e) => set("asks", e.target.value)} placeholder={"例：将来、親と同居できる二世帯にしたい\n例：車を3台とめたい。建蔽率は足りるか\n例：3階建てにした場合、何が変わるか"} rows={3} />
                    <div className="examples" aria-label="追加の例">
                      <span>追加</span>
                      {ASK_EXAMPLES.map((ex) => (
                        <button key={ex} type="button" onClick={() => set("asks", plan.asks.trim() ? `${plan.asks.trim()}\n${ex}` : ex)}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Attachments files={attachments} onChange={setAttachments} />
                  <CustomerFields survey={survey} set={setSurveyField} />
                  <details className="more" open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
                    <summary>
                      分かれば入れる<span className="hint">規模・道路・地目・盛土・自動取得の手直し・資料のメモ</span>
                    </summary>
                    <div className="more-body">
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
                              <input type="checkbox" checked={effective.hazards.includes(h)} disabled={site?.derived.hazards.includes(h) && !plan.hazards.includes(h)} onChange={() => toggle("hazards", h)} /> {h}
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
                  {!siteLookupAvailable && <p className="notice">住所からの自動取得には、国土交通省 不動産情報ライブラリの API キー（REINFOLIB_API_KEY）が必要です。</p>}
                  <dl className="flow-legend" aria-label="入力がどこに反映されるか">
                    <div>
                      <dt>
                        <span className="flow-tag flow-now">すぐ反映</span>
                      </dt>
                      <dd>何を建てたいか・分かれば入れる → 04 法令の論点・05 設計条件</dd>
                    </div>
                    <div>
                      <dt>
                        <span className="flow-tag flow-ai">ボタンで反映</span>
                      </dt>
                      <dd>
                        AIに見てほしいこと・土地の資料 → 06「AIで詳しくチェック」を押したとき
                        <button type="button" className="linkbtn" onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                          AIのチェックへ ↓
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <span className="flow-tag flow-doc">書類に反映</span>
                      </dt>
                      <dd>お客様情報 → 07 法令制限確認書（Excel）</dd>
                    </div>
                  </dl>
                  <div className="input-foot">
                    <button
                      type="button"
                      className="linkbtn muted"
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
                  </div>
                </>
              )}
            </form>
          </Section>

          {(site || siteBusy || siteError) && <ViewSwitch view={view} onChange={setView} />}
          {(site || siteBusy || siteError) && (
            <div className="stage-band" data-reveal>
              <span className="stage-en">Stage 1</span>
              <strong>土地情報</strong>
              <p>土地の条件をそろえる段階。基本情報・必須チェック12項目・災害リスク・周辺の法令・確認先を、国の公開データと入力から。</p>
            </div>
          )}
          {(site || siteBusy || siteError) && (
            <Section id="s-land" no="02" title="土地情報まとめ" lead={location ?? "住所の位置を特定しています"}>
              {siteBusy && <SiteProgress done={siteSteps} seconds={siteStartedAt ? Math.max(0, Math.round((now - siteStartedAt) / 1000)) : 0} />}
              {siteError && <p className="notice">{siteError}</p>}
              {site && !siteBusy && (
                <>
                  {siteSeconds !== null && (
                    <p className="site-done" role="status">
                      <span aria-hidden>✓</span>読み込み完了　国の公開データ{siteSteps.length}種類を照合（{siteSeconds}秒）
                    </p>
                  )}
                  {!site.apiAvailable && <p className="notice">不動産情報ライブラリの API キーが未設定のため、用途地域などは取得できていません。「分かれば入れる」で手入力してください。</p>}
                  <LandSheet
                    facts={facts}
                    location={location ?? ""}
                    notes={site.derived.notes}
                    plan={effective}
                    afterGlance={forSales && plan.description.trim().length >= 5 ? <SalesBriefView items={salesBrief(effective, facts, findings)} /> : null}
                  />
                </>
              )}
            </Section>
          )}

          {hasMap && site && site.lat !== null && site.lon !== null && (
            <Section id="s-maps" no="03" title="案内図・公図" lead="国土地理院の地図と、法務省の登記所備付地図データ。">
              <div className="plates">
                <SiteMap lat={site.lat} lon={site.lon} label={plan.address} />
                <LotCard address={plan.address} lat={site.lat} lon={site.lon} accessKey={accessKey} onInfo={setLotInfo} />
              </div>
            </Section>
          )}

          {findings.length > 0 && (
            <div className="stage-band" data-reveal>
              <span className="stage-en">Stage 2</span>
              <strong>法令チェック</strong>
              <p>土地情報に計画を当てはめる段階。条文照合済みのルールで論点を出し、AIが条文と自治体の資料を確かめて、結論・事前協議・タスクまでまとめます。</p>
            </div>
          )}
          {findings.length > 0 && !forDesign && (
            <div className="view-note">
              法令の論点（{split.specific.length + split.checks.length}件）と設計条件チェックは、設計士向けの内容です。
              <button type="button" className="linkbtn" onClick={() => setView("設計")}>
                設計士の表示に切り替える
              </button>
            </div>
          )}
          {findings.length > 0 && forDesign && (
            <Section id="s-issues" no="04" title="法令の論点（自動判定）" lead="土地情報と入力を、条文照合済みのルールに当てはめた即時の判定です（AIは使っていません）。">
              <div className="issues">
                <div className="issues-counts">
                  <div>
                    <strong>{split.specific.length}</strong>
                    <span>この敷地・計画に固有</span>
                  </div>
                  <div>
                    <strong>{split.checks.length}</strong>
                    <span>窓口で確認</span>
                  </div>
                  <div>
                    <strong>{split.routine.length}</strong>
                    <span>毎回の手続き</span>
                  </div>
                </div>
                <div className="issues-grid">
                  <div className="issues-col">
                    {split.specific.length > 0 &&
                      groupByStage(split.specific).map(({ stage, items }) => (
                        <div key={stage} className="stage">
                          <p className="stage-name">
                            {stage}
                            <span className="hint">{STAGE_HINT[stage]}</span>
                          </p>
                          {items.map((f) => (
                            <FindingItem key={f.rule.id} f={f} />
                          ))}
                        </div>
                      ))}
                    {split.checks.length > 0 && (
                      <div className="stage">
                        <p className="stage-name">
                          窓口で確認すること<span className="hint">入力不足・条例次第</span>
                        </p>
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
                  </div>
                  {agencies.length > 0 && (
                    <aside className="agencies">
                      <p className="stage-name">先に聞きに行く窓口</p>
                      <ol>
                        {agencies.slice(0, 8).map(({ agency, items }) => (
                          <li key={agency}>
                            <strong>{agency}</strong>
                            <span>{items.map((f) => f.rule.title.replace(/（.*?）/g, "")).join("／")}</span>
                          </li>
                        ))}
                      </ol>
                    </aside>
                  )}
                </div>
              </div>
            </Section>
          )}
          {findings.length > 0 && forDesign && (
            <Section id="s-design" no="05" title="設計条件チェック（設計者向け）" lead="防火・構造・省エネ・内装・敷地条件を、階数・延べ面積・構造・防火指定と条文で照合した結果です（AIは使っていません）。">
              <DesignCheckView check={design} />
            </Section>
          )}

          <div ref={resultRef} style={{ scrollMarginTop: 80 }}>
            <Section
              id="s-result"
              no="06"
              title="AIの詳しいチェック"
              lead="条文（e-Gov）と自治体の公式資料を確かめ、結論・見落とし・設計・事前協議・タスクを出典付きでまとめます。"
              aside={
                (done || (report && !busy)) && (
                  <button type="button" className="linkbtn" onClick={copyResult}>
                    {copied ? "コピーしました" : "出典付きでコピー"}
                  </button>
                )
              }
            >
              {error && <p className="notice">{error}</p>}
              {!busy && (
                <div className={`handoff${stale ? " is-stale" : ""}`}>
                  <p className="handoff-title">
                    {stale ? "入力が変わりました。もう一度押すと、今の内容で調べ直します" : report ? "前回のチェックで使った内容" : "押すと、AIはこの内容で調べます"}
                  </p>
                  <dl>
                    <div>
                      <dt>何を建てたいか</dt>
                      <dd>{plan.description.trim() || <span className="hint">未入力（必須）</span>}</dd>
                    </div>
                    <div>
                      <dt>AIに見てほしいこと</dt>
                      <dd>
                        {askLines.length ? (
                          <ol>
                            {askLines.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ol>
                        ) : (
                          <span className="hint">なし（任意）</span>
                        )}
                        <button type="button" className="linkbtn" onClick={() => document.getElementById("asks")?.focus()}>
                          {askLines.length ? "直す" : "書く"}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>土地の資料</dt>
                      <dd>{attachments.length ? `${attachments.length}件（AIが読み取ります）` : <span className="hint">なし（任意）</span>}</dd>
                    </div>
                    <div>
                      <dt>土地情報・法令の論点</dt>
                      <dd>{site ? "読み込み済み（上の02〜05をそのまま渡します）" : <span className="hint">住所を調べると一緒に渡します</span>}</dd>
                    </div>
                  </dl>
                  <p className="hint">ボタンを押した時点の入力で調べます。お客様情報はAIに送りません（Excelだけに使います）。</p>
                </div>
              )}
              {runControls}
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
                    </div>
                    <div className="bar">
                      <span style={{ width: `${Math.min(97, Math.max((phase / PHASES.length) * 100, (elapsed / EXPECTED_SECONDS) * 100))}%` }} />
                    </div>
                    <ol className="phases">
                      {PHASES.map((p, i) => (
                        <li key={p} className={i < phase ? "is-done" : i === phase ? "is-current" : ""}>
                          {p}
                        </li>
                      ))}
                    </ol>
                    {log.length > 0 && <p className="hint runlog">{log[log.length - 1]}</p>}
                  </div>
                </div>
              )}
              {resultVisible && (report ? <ReportView view={view} report={report} streaming={busy && !reportFinal} sourceCounts={reportFinal ? sourceCounts : undefined} taskDone={taskDone} onToggleTask={toggleTask} /> : text && <MarkdownView markdown={text} />)}
              {!busy && (log.length > 0 || sources.length > 0) && (
                <div className="trail">
                  {sources.length > 0 && (
                    <details>
                      <summary>参照した出典（{sources.length}件）</summary>
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
                  {log.length > 0 && (
                    <details>
                      <summary>AIが調べた手順（{log.length}件）</summary>
                      <ul className="log">
                        {log.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </Section>
          </div>

          {hasSite && (
            <Section id="s-docs" no="07" title="書類を作る" lead="社内で使う形式で、そのまま保存できます。">
              <ul className="docs">
                <li>
                  <div>
                    <strong>法令チェック表（PDF）</strong>
                    <span>案内図・公図・土地のまとめ・論点{report ? "・AIの結論とタスク" : ""}を出典番号つきの一覧表に。</span>
                  </div>
                  <button type="button" className="btn small" onClick={() => window.print()}>
                    PDFで保存
                  </button>
                </li>
                {report?.tasks && report.tasks.length > 0 && (
                  <li>
                    <div>
                      <strong>タスク一覧（CSV）</strong>
                      <span>担当・時期・やること・相手先。Excel やスプレッドシートで開けます。</span>
                    </div>
                    <button type="button" className="btn small secondary" onClick={() => download(`タスク_${plan.address || "案件"}.csv`, tasksToCsv(report.tasks, taskDone), "text/csv;charset=utf-8")}>
                      CSVで保存
                    </button>
                  </li>
                )}
              </ul>
              <div id="survey">
                <SurveyPanel plan={effective} site={site} report={report} accessKey={accessKey} suggestedLot={suggestedLot} survey={survey} set={setSurveyField} />
              </div>
            </Section>
          )}
        </div>
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
