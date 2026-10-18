"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownView from "@/app/MarkdownView";
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
  type PlanInput,
} from "@/lib/plan";
import { SEVERITY_LABEL, citeLabel, citeUrl, groupByCategory, runRules } from "@/lib/rules";

const STORAGE_KEY = "kenchiku-law-agent:plan";
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

function SelectField<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function ConsultClient({ accessRequired }: { accessRequired: boolean }) {
  const [plan, setPlan] = useState<PlanInput>(EMPTY_PLAN);
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

  const findings = useMemo(() => (plan.description.trim().length >= 5 || plan.landInfo ? runRules(plan) : []), [plan]);
  const grouped = useMemo(() => groupByCategory(findings), [findings]);

  async function consult() {
    if (plan.description.trim().length < 5) {
      setError("計画の概要を入力してください。");
      return;
    }
    setError(null);
    setText("");
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
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessKey ? { "x-access-key": accessKey } : {}) },
        body: JSON.stringify(plan),
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
          if (ev.type === "text") {
            acc += ev.delta;
            setText(acc);
          } else if (ev.type === "status" || ev.type === "tool") {
            setLog((l) => [...l, ev.type === "status" ? ev.text : ev.summary]);
          } else if (ev.type === "source") {
            setSources((s) => (s.some((x) => x.url === ev.url) ? s : [...s, { tier: ev.tier, title: ev.title, url: ev.url }]));
          } else if (ev.type === "error") {
            setError(ev.message);
          } else if (ev.type === "done") {
            setDone(true);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copyResult() {
    const src = sources.map((s) => `- 【${s.tier}】${s.title} ${s.url}`).join("\n");
    await navigator.clipboard.writeText(`${text}\n\n---\n参照した根拠\n${src}`);
  }

  return (
    <div className="layout">
      <div>
        <form onSubmit={(e) => e.preventDefault()} className="no-print">
          <fieldset>
            <legend>計画の概要</legend>
            <div className="field">
              <label htmlFor="description">
                どんな計画か <span className="hint">自由記述。例：市街化区域の畑を購入し、木造2階建て延べ面積110㎡の専用住宅を建てたい。前面は幅員4mの市道、接道6m。</span>
              </label>
              <textarea id="description" maxLength={4000} value={plan.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="landInfo">
                土地の情報 <span className="hint">登記事項（地目・面積）、公図・測量図の要点、都市計画情報の画面の文字、重要事項説明書の抜き書きなどを貼り付け</span>
              </label>
              <textarea id="landInfo" maxLength={6000} value={plan.landInfo} onChange={(e) => set("landInfo", e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="location">所在地 <span className="hint">市区町村まで（条例検索に使います）</span></label>
                <input id="location" type="text" maxLength={120} value={plan.location} onChange={(e) => set("location", e.target.value)} placeholder="例：静岡県浜松市中央区" />
              </div>
              <SelectField id="workType" label="工事種別" value={plan.workType} options={WORK_TYPES} onChange={(v) => set("workType", v)} />
            </div>
          </fieldset>

          <fieldset>
            <legend>都市計画・敷地</legend>
            <div className="field-row">
              <SelectField id="areaDivision" label="区域区分" value={plan.areaDivision} options={AREA_DIVISIONS} onChange={(v) => set("areaDivision", v)} />
              <SelectField id="zoning" label="用途地域" value={plan.zoning} options={ZONINGS} onChange={(v) => set("zoning", v)} />
              <SelectField id="fireZone" label="防火指定" value={plan.fireZone} options={FIRE_ZONES} onChange={(v) => set("fireZone", v)} />
            </div>
            <div className="field-row">
              <NumberField id="siteArea" label="敷地面積" unit="㎡" value={plan.siteArea} onChange={(v) => set("siteArea", v)} />
              <SelectField id="roadType" label="前面道路の種別" value={plan.roadType} options={ROAD_TYPES} onChange={(v) => set("roadType", v)} />
              <NumberField id="roadWidth" label="前面道路の幅員" unit="m" value={plan.roadWidth} onChange={(v) => set("roadWidth", v)} />
              <NumberField id="frontage" label="接道長さ" unit="m" value={plan.frontage} onChange={(v) => set("frontage", v)} hint="旗竿地は路地の幅" />
            </div>
            <div className="field-row">
              <SelectField id="landCategory" label="地目（現況）" value={plan.landCategory} options={LAND_CATEGORIES} onChange={(v) => set("landCategory", v)} />
              <SelectField id="farmlandBlue" label="農用地区域（青地）か" value={plan.farmlandBlue} options={YES_NO_UNKNOWN} onChange={(v) => set("farmlandBlue", v)} />
            </div>
            <div className="field">
              <label>該当する区域・指定 <span className="hint">ハザードマップ・都市計画情報で確認したものにチェック。未確認なら空欄のまま</span></label>
              <div className="check-grid">
                {HAZARDS.map((h) => (
                  <label key={h}>
                    <input type="checkbox" checked={plan.hazards.includes(h)} onChange={() => toggle("hazards", h)} /> {h}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>建物</legend>
            <div className="field-row">
              <SelectField id="buildingUse" label="建物用途" value={plan.buildingUse} options={BUILDING_USES} onChange={(v) => set("buildingUse", v)} />
              <SelectField id="structure" label="構造" value={plan.structure} options={STRUCTURES} onChange={(v) => set("structure", v)} />
              <NumberField id="floors" label="階数（地階を除く）" unit="階" value={plan.floors} onChange={(v) => set("floors", v === null ? null : Math.round(v))} />
              <NumberField id="height" label="最高高さ" unit="m" value={plan.height} onChange={(v) => set("height", v)} />
            </div>
            <div className="field-row">
              <NumberField id="totalFloorArea" label="延べ面積" unit="㎡" value={plan.totalFloorArea} onChange={(v) => set("totalFloorArea", v)} />
              <NumberField id="buildingArea" label="建築面積" unit="㎡" value={plan.buildingArea} onChange={(v) => set("buildingArea", v)} />
              <NumberField id="contractAmountMan" label="請負金額（概算）" unit="万円" value={plan.contractAmountMan} onChange={(v) => set("contractAmountMan", v)} />
            </div>
          </fieldset>

          <fieldset>
            <legend>造成・解体・その他</legend>
            <div className="field-row">
              <NumberField id="fillHeight" label="盛土の高さ" unit="m" value={plan.fillHeight} onChange={(v) => set("fillHeight", v)} />
              <NumberField id="cutHeight" label="切土の高さ" unit="m" value={plan.cutHeight} onChange={(v) => set("cutHeight", v)} />
              <NumberField id="earthworkArea" label="盛土・切土の面積" unit="㎡" value={plan.earthworkArea} onChange={(v) => set("earthworkArea", v)} />
              <NumberField id="demolitionArea" label="解体する建物の床面積" unit="㎡" value={plan.demolitionArea} onChange={(v) => set("demolitionArea", v)} />
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
          </fieldset>

          {accessRequired && (
            <div className="field">
              <label htmlFor="accessKey">アクセスキー <span className="hint">社内で共有されているキー</span></label>
              <input id="accessKey" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
            </div>
          )}

          {error && <p className="notice">{error}</p>}

          <div className="actions">
            <button type="button" className="btn" onClick={consult} disabled={busy}>
              {busy ? "作成中…" : "エージェントに深掘りさせる"}
            </button>
            {busy && <button type="button" className="btn secondary" onClick={stop}>中止</button>}
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setPlan(EMPTY_PLAN);
                setText("");
                setSources([]);
                setLog([]);
              }}
              disabled={busy}
            >
              入力をクリア
            </button>
          </div>
        </form>

        {(text || busy) && (
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
            {busy && !text && <p className="spinner">条文・資料を確認中です。1〜3分かかることがあります…</p>}
            {text && <MarkdownView markdown={text} />}
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

      <aside className="sticky">
        <div className="card">
          <h3>即時ルールチェック {findings.length > 0 && <span className="hint">（{findings.length}件）</span>}</h3>
          {findings.length === 0 ? (
            <p>計画の概要を入力すると、該当しうる法令・手続きがここに表示されます。</p>
          ) : (
            grouped.map(({ category, items }) => (
              <details key={category} open={category === "まず確認すること" || items.some((f) => f.severity === "required")}>
                <summary>
                  {category} <span className="hint">（{items.length}）</span>
                </summary>
                {items.map(({ rule, severity }) => (
                  <div className="finding" key={rule.id}>
                    <h4>
                      <span className={`badge ${severity}`}>{SEVERITY_LABEL[severity].split("（")[0]}</span>
                      {rule.title}
                    </h4>
                    <p>{rule.summary}</p>
                    <p><strong>対応：</strong>{rule.action}</p>
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
                ))}
              </details>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
