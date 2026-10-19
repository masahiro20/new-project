"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
import ReportView from "./ReportView";
import { reportToMarkdown, type PartialReport } from "@/lib/report";
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
  signalText,
  type PlanInput,
} from "@/lib/plan";
import { SEVERITY_SHORT, citeLabel, citeUrl, groupByAgency, groupByStage, runRules, splitFindings, type Finding } from "@/lib/rules";
import type { SiteContext } from "@/lib/site";
import { mergeSiteIntoPlan } from "@/lib/site";

const STORAGE_KEY = "kenchiku-law-agent:plan:v2";
const ACCESS_KEY = "kenchiku-law-agent:access";

type Source = { tier: "条文" | "公的" | "参考"; title: string; url: string };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function NumberField({ id, label, unit, value, onChange, hint }: { id: string; label: string; unit: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="hint">{unit}{hint ? `・${hint}` : ""}</span>
      </label>
      <input id={id} type="number" min={0} step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
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
        {options.map((o) => <option key={o}>{o}</option>)}
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
          {rule.cites.map((c) => (
            <a key={`${c.law}:${c.article}`} href={citeUrl(c)} target="_blank" rel="noopener noreferrer">{citeLabel(c)}</a>
          ))}
          {rule.refs?.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer">{r.publisher}：{r.label}</a>
          ))}
        </p>
        <p className="roles">担当：{rule.roles.join("・")}</p>
      </div>
    </details>
  );
}

function Alert({ tone, title, children }: { tone: "danger" | "warn" | "info"; title: string; children: React.ReactNode }) {
  return (
    <div className={`alert tone-${tone}`}>
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
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
  const [reportFinal, setReportFinal] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lookedUp = useRef<string>("");

  useEffect(() => {
    setPlan(load(STORAGE_KEY, EMPTY_PLAN));
    try {
      setAccessKey(localStorage.getItem(ACCESS_KEY) ?? "");
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

  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) => setPlan((p) => ({ ...p, [key]: value }));
  const toggle = <K extends "hazards" | "extras">(key: K, item: PlanInput[K][number]) =>
    setPlan((p) => {
      const list = p[key] as string[];
      return { ...p, [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item] };
    });

  const headers = () => ({ "Content-Type": "application/json", ...(accessKey ? { "x-access-key": accessKey } : {}) });

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

  // The plan the rules and the agent actually see: user choices win, lookup fills the blanks.
  const effective = useMemo(() => mergeSiteIntoPlan(plan, site), [plan, site]);
  const findings = useMemo(() => (plan.description.trim().length >= 5 ? runRules(effective) : []), [plan.description, effective]);
  const split = useMemo(() => splitFindings(findings), [findings]);
  const agencies = useMemo(() => groupByAgency([...split.specific, ...split.checks]), [split]);

  async function consult() {
    if (plan.description.trim().length < 5) {
      setError("何を建てたいか（計画）を入力してください。");
      return;
    }
    setError(null);
    setText("");
    setReport(null);
    setReportFinal(false);
    setLog([]);
    setSources([]);
    setDone(false);
    setBusy(true);
    try {
      localStorage.setItem(ACCESS_KEY, accessKey);
    } catch {
      // ignore
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/consult", { method: "POST", headers: headers(), body: JSON.stringify(plan), signal: controller.signal });
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
            setReport(ev.report);
          } else if (ev.type === "report") {
            sawReport = true;
            setReport(ev.report);
            setReportFinal(true);
          } else if (ev.type === "text") {
            acc += ev.delta;
            setText(acc);
          } else if (ev.type === "status" || ev.type === "tool") {
            setLog((l) => [...l, ev.type === "status" ? ev.text : ev.summary]);
          } else if (ev.type === "source") {
            setSources((s) => (s.some((x) => x.url === ev.url) ? s : [...s, { tier: ev.tier, title: ev.title, url: ev.url }]));
          } else if (ev.type === "error") {
            sawDone = true;
            setError(ev.message);
          } else if (ev.type === "done") {
            sawDone = true;
            setDone(true);
          }
        }
      }
      if (!sawDone) setError(sawReport ? "時間の上限で回答が途中で切れました。表示されている部分は有効です。続きが必要なら「法令チェックを実行」をもう一度押してください。" : "回答が完了しませんでした（時間の上限の可能性）。もう一度お試しください。");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function copyResult() {
    const src = sources.map((s) => `- 【${s.tier}】${s.title} ${s.url}`).join("\n");
    const body = report ? reportToMarkdown(report) : text;
    await navigator.clipboard.writeText(`${body}\n\n---\n参照した根拠\n${src}`);
  }

  const hitLayers = site?.layers.filter((l) => l.status === "hit") ?? [];
  const noneLayers = site?.layers.filter((l) => l.status === "none") ?? [];

  return (
    <div className="layout">
      <div>
        <form onSubmit={(e) => e.preventDefault()} className="no-print">
          <fieldset>
            <legend>1. 住所と計画</legend>
            {accessRequired && (
              <div className="field">
                <label htmlFor="accessKey">
                  アクセスキー <span className="hint">共有されたキーを最初に入力してください（この端末に保存されます）。未入力だと住所の自動取得も実行も「アクセスキーが違います」になります</span>
                </label>
                <input id="accessKey" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" placeholder="アクセスキー" />
              </div>
            )}
            <div className="field">
              <label htmlFor="address">
                敷地の住所 <span className="hint">番地まで。入力を終えると用途地域・区域区分・防火指定・災害区域を自動で調べます</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
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
                <button type="button" className="btn secondary small" onClick={() => lookup(true)} disabled={siteBusy || plan.address.trim().length < 3} style={{ whiteSpace: "nowrap" }}>
                  {siteBusy ? "取得中…" : "調べる"}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">
                何を建てたいか <span className="hint">一文で十分です。例：木造2階建ての自宅（延べ面積110㎡）。畑を買って建てる予定</span>
              </label>
              <textarea id="description" maxLength={4000} value={plan.description} onChange={(e) => set("description", e.target.value)} style={{ minHeight: 80 }} />
            </div>
          </fieldset>

          {(site || siteBusy || siteError) && (
            <div className={site && !siteError ? "card" : "notice"} style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>土地の環境（自動取得）</h3>
              {siteBusy && <p className="spinner">国土地理院で位置を特定し、国交省の都市計画・災害データを照合しています…</p>}
              {siteError && <p>{siteError}</p>}
              {site && !siteBusy && (
                <>
                  <p style={{ margin: "0 0 8px" }}>
                    位置：{site.matched ?? "特定できず"}
                    {site.lat !== null && <span className="hint">（北緯 {site.lat.toFixed(5)}、東経 {site.lon?.toFixed(5)}）</span>}
                  </p>
                  {!site.apiAvailable && (
                    <p className="notice" style={{ margin: "8px 0" }}>
                      不動産情報ライブラリの API キーが未設定のため、用途地域などは取得できていません。下の「詳しい条件」で手入力してください。
                    </p>
                  )}
                  {(() => {
                    const sg = site.derived.signals;
                    const st = signalText(sg);
                    const red = hitLayers.filter((l) => ["XKT029", "XKT016", "XKT021", "XKT022"].includes(l.id));
                    return (
                      <div className="alerts">
                        {sg.farmland === "敷地が農地の可能性" && (
                          <Alert tone="danger" title="現況が農地の可能性">
                            {st.farmland}。登記が宅地でも農地転用（農地法）の手続きが必要になることがあります。農業委員会で確認してください。
                          </Alert>
                        )}
                        {sg.farmland === "周辺に農地" && (
                          <Alert tone="warn" title="周りに田畑">
                            {st.farmland}。前面の道が農道でないか、水路が敷地にかかっていないか確認してください。
                          </Alert>
                        )}
                        {sg.waterMeters !== null && sg.waterMeters <= 60 && (
                          <Alert tone={sg.waterMeters <= 20 ? "danger" : "warn"} title="川・水路が近い">
                            {st.water}。河川区域・河川保全区域・水路の管理者と境界を確認してください。
                          </Alert>
                        )}
                        {red.map((l) => (
                          <Alert key={l.id} tone="danger" title={l.label}>
                            {l.summary.join("／")}
                          </Alert>
                        ))}
                        {site.derived.areaDivision === "市街化調整区域" && (
                          <Alert tone="danger" title="市街化調整区域">
                            原則として建築できない区域です。開発許可・建築許可の立地基準に当てはまるかを都市計画課（開発指導）で確認してください。
                          </Alert>
                        )}
                      </div>
                    );
                  })()}
                  {site.apiAvailable && (
                    <table style={{ width: "100%", fontSize: ".92rem", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr>
                          <th style={{ textAlign: "left", width: "9em", padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>区域区分</th>
                          <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>{site.derived.areaDivision ?? "データなし（要確認）"}</td>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>用途地域</th>
                          <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>
                            {site.derived.zoning ?? "データなし（要確認）"}
                            {(site.derived.kenpei || site.derived.yoseki) && <span className="hint">　建蔽率 {site.derived.kenpei ?? "—"}／容積率 {site.derived.yoseki ?? "—"}</span>}
                          </td>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>防火指定</th>
                          <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>{site.derived.fireZone ?? "データなし（要確認）"}</td>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>農地</th>
                          <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>
                            {signalText(site.derived.signals).farmland}
                            <span className="hint">（農水省 筆ポリゴン）</span>
                          </td>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>川・水路</th>
                          <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--line)" }}>
                            {signalText(site.derived.signals).water}
                            <span className="hint">（国土地理院 地図）</span>
                          </td>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", verticalAlign: "top" }}>該当区域</th>
                          <td style={{ padding: "4px 6px" }}>
                            {hitLayers.length === 0 && "該当なし（下記レイヤで確認）"}
                            {hitLayers.map((l) => (
                              <div key={l.id}>
                                <strong>{l.label}</strong>：{l.summary.join("／")}
                              </div>
                            ))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {site.derived.notes.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingLeft: "1.2em", fontSize: ".9rem" }}>
                      {site.derived.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                  {site.apiAvailable && noneLayers.length > 0 && (
                    <p className="hint" style={{ marginTop: 8 }}>
                      該当なしと判定：{noneLayers.map((l) => l.label).join("、")}（出典：国土交通省 不動産情報ライブラリ。公表済みデータに限る）
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <fieldset>
            <legend>2. 計画次第で変わること（分かる範囲で）</legend>
            <div className="field-row">
              <SelectField id="workType" label="工事種別" value={plan.workType} options={WORK_TYPES} onChange={(v) => set("workType", v)} />
              <SelectField id="buildingUse" label="建物用途" value={plan.buildingUse} options={BUILDING_USES} onChange={(v) => set("buildingUse", v)} />
              <SelectField id="structure" label="構造" value={plan.structure} options={STRUCTURES} onChange={(v) => set("structure", v)} />
            </div>
            <div className="field-row">
              <NumberField id="floors" label="階数" unit="階" value={plan.floors} onChange={(v) => set("floors", v === null ? null : Math.round(v))} />
              <NumberField id="totalFloorArea" label="延べ面積" unit="㎡" value={plan.totalFloorArea} onChange={(v) => set("totalFloorArea", v)} hint="概算で可" />
              <SelectField id="landCategory" label="現況の地目" value={plan.landCategory} options={LAND_CATEGORIES} onChange={(v) => set("landCategory", v)} hint="登記は調べられないので分かれば" />
            </div>
            <div className="field-row">
              <NumberField id="roadWidth" label="前面道路の幅員" unit="m" value={plan.roadWidth} onChange={(v) => set("roadWidth", v)} hint="現地で分かれば" />
              <NumberField id="frontage" label="接道長さ" unit="m" value={plan.frontage} onChange={(v) => set("frontage", v)} hint="旗竿地は路地の幅" />
              <NumberField id="fillHeight" label="盛土の高さ" unit="m" value={plan.fillHeight} onChange={(v) => set("fillHeight", v)} hint="造成する場合" />
              <NumberField id="demolitionArea" label="解体する建物の床面積" unit="㎡" value={plan.demolitionArea} onChange={(v) => set("demolitionArea", v)} hint="建て替えの場合" />
            </div>
          </fieldset>

          <details open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
            <summary>詳しい条件（自動取得を手で直す・その他の該当事項）</summary>
            <div style={{ marginTop: 12 }}>
              <p className="hint">自動取得の結果が現地の都市計画図と違うときは、ここで選び直してください。手で選んだ値が優先されます。</p>
              <div className="field-row">
                <SelectField id="areaDivision" label="区域区分" value={plan.areaDivision} options={AREA_DIVISIONS} onChange={(v) => set("areaDivision", v)} />
                <SelectField id="zoning" label="用途地域" value={plan.zoning} options={ZONINGS} onChange={(v) => set("zoning", v)} />
                <SelectField id="fireZone" label="防火指定" value={plan.fireZone} options={FIRE_ZONES} onChange={(v) => set("fireZone", v)} />
                <SelectField id="roadType" label="前面道路の種別" value={plan.roadType} options={ROAD_TYPES} onChange={(v) => set("roadType", v)} />
              </div>
              <div className="field-row">
                <NumberField id="siteArea" label="敷地面積" unit="㎡" value={plan.siteArea} onChange={(v) => set("siteArea", v)} />
                <NumberField id="buildingArea" label="建築面積" unit="㎡" value={plan.buildingArea} onChange={(v) => set("buildingArea", v)} />
                <NumberField id="height" label="最高高さ" unit="m" value={plan.height} onChange={(v) => set("height", v)} />
                <NumberField id="contractAmountMan" label="請負金額" unit="万円" value={plan.contractAmountMan} onChange={(v) => set("contractAmountMan", v)} />
              </div>
              <div className="field-row">
                <SelectField id="farmlandBlue" label="農用地区域（青地）か" value={plan.farmlandBlue} options={YES_NO_UNKNOWN} onChange={(v) => set("farmlandBlue", v)} />
                <NumberField id="cutHeight" label="切土の高さ" unit="m" value={plan.cutHeight} onChange={(v) => set("cutHeight", v)} />
                <NumberField id="earthworkArea" label="盛土・切土の面積" unit="㎡" value={plan.earthworkArea} onChange={(v) => set("earthworkArea", v)} />
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
                  土地の資料の貼り付け <span className="hint">登記事項、公図・測量図の要点、重要事項説明書の抜き書きなど</span>
                </label>
                <textarea id="landInfo" maxLength={6000} value={plan.landInfo} onChange={(e) => set("landInfo", e.target.value)} />
              </div>
            </div>
          </details>

          {!siteLookupAvailable && (
            <p className="notice" style={{ marginTop: 16 }}>
              住所からの自動取得（用途地域・区域区分・防火指定・災害区域）には、国土交通省 不動産情報ライブラリの API キー（無料・申請制）が必要です。サーバーの環境変数 REINFOLIB_API_KEY に設定してください。
            </p>
          )}

          {error && <p className="notice">{error}</p>}

          <div className="actions">
            <button type="button" className="btn" onClick={consult} disabled={busy}>
              {busy ? "作成中…" : "法令チェックを実行"}
            </button>
            {busy && <button type="button" className="btn secondary" onClick={() => abortRef.current?.abort()}>中止</button>}
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setPlan(EMPTY_PLAN);
                setSite(null);
                lookedUp.current = "";
                setText("");
                setReport(null);
                setSources([]);
                setLog([]);
              }}
              disabled={busy}
            >
              入力をクリア
            </button>
          </div>
        </form>

        {(text || report || busy) && (
          <div style={{ marginTop: 32 }}>
            <div className="result-head">
              <h2 style={{ margin: 0 }}>エージェントの回答</h2>
              {done && (
                <div className="actions no-print" style={{ marginTop: 0 }}>
                  <button type="button" className="btn small secondary" onClick={copyResult}>根拠付きでコピー</button>
                  <button type="button" className="btn small secondary" onClick={() => window.print()}>印刷</button>
                </div>
              )}
            </div>
            {log.length > 0 && (
              <ul className="log no-print">
                {log.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
            {busy && !text && !report && <p className="spinner">条文・資料を確認中です。2〜4分かかります…</p>}
            {report ? <ReportView report={report} streaming={busy && !reportFinal} /> : text && <MarkdownView markdown={text} />}
            {sources.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>参照した根拠（取得順）</h3>
                <ul className="sources">
                  {sources.map((s) => (
                    <li key={s.url}>
                      <span className={`badge tier-${s.tier}`}>{s.tier}</span>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="sticky side">
        <div className="card">
          <h3 style={{ marginBottom: 2 }}>自動チェック（AI回答の前の下書き）</h3>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            住所から取った地図データと入力内容を、条文照合済みのルールに当てはめた結果です。AI の回答はこれを土台に詳しく書きます。
          </p>
          {findings.length === 0 ? (
            <p>住所と「何を建てたいか」を入れると、ここに論点が出ます。</p>
          ) : (
            <>
              <div className="counts">
                <span><strong>{split.specific.length}</strong>この敷地・計画に固有</span>
                <span><strong>{split.checks.length}</strong>窓口で確認</span>
                <span><strong>{split.routine.length}</strong>毎回の手続き</span>
              </div>

              {agencies.length > 0 && (
                <div className="side-sec">
                  <h4>先に聞きに行く窓口</h4>
                  <ul className="agency-list">
                    {agencies.slice(0, 8).map(({ agency, items }) => (
                      <li key={agency}>
                        <strong>{agency}</strong>
                        <span>{items.map((f) => f.rule.title.split("（")[0]).join("／")}</span>
                      </li>
                    ))}
                  </ul>
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
                      {items.map((f) => <FindingItem key={f.rule.id} f={f} />)}
                    </div>
                  ))}
                </div>
              )}

              {split.checks.length > 0 && (
                <div className="side-sec">
                  <h4>窓口で確認すること（入力不足・条例次第）</h4>
                  {split.checks.map((f) => <FindingItem key={f.rule.id} f={f} />)}
                </div>
              )}

              {split.routine.length > 0 && (
                <details className="routine">
                  <summary>通常の新築で毎回必要な手続き（{split.routine.length}件）</summary>
                  {split.routine.map((f) => <FindingItem key={f.rule.id} f={f} />)}
                </details>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
