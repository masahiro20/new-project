"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ViewMode } from "./ViewSwitch";
import { GRADE_HELP, ROLES, TASK_WHEN, whenIndex, type PartialReport } from "@/lib/report";
import { CertaintyBadge, CertaintyLegend, Sources } from "./Certainty";
import CountUp from "../components/CountUp";

const VERDICT_TONE: Record<string, string> = {
  通常の手続きで建築可能: "ok",
  条件付きで建築可能: "warn",
  "許可・協議が前提": "warn",
  建築が難しい可能性: "danger",
  情報不足で判断保留: "info",
};
export const STATUS_TONE: Record<string, string> = { 該当: "danger", 可能性あり: "warn", 要確認: "info", 該当なし: "muted" };
const STATUS_ORDER = ["該当", "可能性あり", "要確認", "該当なし"];
const PRIO_TONE: Record<string, string> = { 高: "danger", 中: "warn", 低: "info" };
const ASK_TO = ["施主", "土地の売主・仲介", "社内", "役所"] as const;

export const short = (s = "") => s.split("（")[0];

/** Click-to-open row. Collapsed bodies stay in the DOM. */
function Fold({ head, children, defaultOpen = false, className = "" }: { head: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`fold ${open ? "is-open" : ""} ${className}`}>
      <button type="button" className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fold-main">{head}</span>
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`fold-body ${open ? "" : "is-collapsed"}`}>{children}</div>
    </div>
  );
}

type TabKey = "check" | "docs" | "design" | "consult" | "steps" | "tasks" | "questions";

export function sortedTasks(report: PartialReport) {
  return (report.tasks ?? []).map((t, i) => ({ ...t, i })).sort((a, b) => whenIndex(a.when) - whenIndex(b.when));
}

export default function ReportView({
  view = "すべて",
  report,
  streaming,
  sourceCounts,
  taskDone,
  onToggleTask,
}: {
  view?: ViewMode;
  report: PartialReport;
  streaming: boolean;
  sourceCounts?: Record<string, number>;
  taskDone: Record<number, boolean>;
  onToggleTask: (i: number) => void;
}) {
  const [tab, setTab] = useState<TabKey | null>(null);
  const [role, setRole] = useState<(typeof ROLES)[number] | "すべて">("すべて");
  // The viewer picks which tabs matter and whose tasks come first.
  useEffect(() => {
    setRole(view === "営業" ? "営業" : view === "設計" ? "設計" : "すべて");
    setTab(null);
  }, [view]);
  const s = report.summary;
  const tone = s?.verdict ? (VERDICT_TONE[s.verdict] ?? "info") : "info";

  const checklist = [...(report.checklist ?? [])].sort((a, b) => STATUS_ORDER.indexOf(a.status ?? "") - STATUS_ORDER.indexOf(b.status ?? ""));
  const shownChecks = checklist.filter((c) => c.status !== "該当なし");
  const noneChecks = checklist.filter((c) => c.status === "該当なし");
  const tasks = sortedTasks(report);
  const doneCount = tasks.filter((t) => taskDone[t.i]).length;
  const counts = {
    check: checklist.length,
    docs: report.documents?.length ?? 0,
    design: report.design?.length ?? 0,
    consult: report.consultations?.length ?? 0,
    steps: report.procedures?.length ?? 0,
    tasks: tasks.length,
    questions: report.questions?.length ?? 0,
  };
  const allTabs: { key: TabKey; label: string; n: number }[] = [
    { key: "check", label: "見落としチェック", n: counts.check },
    ...(counts.docs > 0 ? [{ key: "docs" as TabKey, label: "資料の読み取り", n: counts.docs }] : []),
    { key: "design", label: "設計の注意", n: counts.design },
    { key: "consult", label: "役所への事前協議", n: counts.consult },
    { key: "steps", label: "手続き", n: counts.steps },
    { key: "tasks", label: "タスク", n: counts.tasks },
    { key: "questions", label: "確認したい質問", n: counts.questions },
  ];
  const VIEW_TABS: Record<ViewMode, TabKey[]> = {
    営業: ["questions", "steps", "tasks", "consult", "docs"],
    設計: ["design", "check", "consult", "steps", "tasks", "docs", "questions"],
    すべて: ["check", "docs", "design", "consult", "steps", "tasks", "questions"],
  };
  const tabs = VIEW_TABS[view].map((k) => allTabs.find((t) => t.key === k)).filter((t): t is (typeof allTabs)[number] => Boolean(t));
  const active: TabKey = tab ?? tabs.find((t) => t.n > 0)?.key ?? "check";
  const panel = (k: TabKey) => `tabpanel ${active === k ? "" : "is-hidden"}`;
  const hits = checklist.filter((c) => c.status === "該当").length;
  const maybe = checklist.filter((c) => c.status === "可能性あり").length;
  const shownTasks = tasks.filter((t) => role === "すべて" || t.role === role);

  return (
    <div className="report">
      {s && (
        <section className={`hero tone-${tone}`}>
          <div className="hero-top">
            <span className="hero-label">VERDICT／結論</span>
            <h2 className="stamp" key={s.verdict ?? ""}>
              {s.verdict ?? "…"}
            </h2>
            {s.grade && (
              <span className={`hero-grade grade-${s.grade}`} title={GRADE_HELP[s.grade]}>
                <small>総合所見</small>
                {s.grade}
              </span>
            )}
          </div>
          {s.headline && <p className="hero-headline">{s.headline}</p>}
          {s.topRisks && s.topRisks.length > 0 && (
            <ol className="hero-risks">
              {s.topRisks.map((r, i) => (
                <li key={i}>
                  <span className="num">{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          )}
          {s.schedule && (
            <p className="hero-schedule">
              <span className="pill tone-info">工程</span>
              {s.schedule}
            </p>
          )}
          {((s.costImpacts?.length ?? 0) > 0 || (s.customerPoints?.length ?? 0) > 0) && (
            <div className="hero-cols">
              {(s.costImpacts?.length ?? 0) > 0 && (
                <div>
                  <p className="hero-col-title">費用・工期に影響しうること</p>
                  <ul>
                    {s.costImpacts!.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(s.customerPoints?.length ?? 0) > 0 && (
                <div>
                  <p className="hero-col-title">お客様への説明ポイント</p>
                  <ul>
                    {s.customerPoints!.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {(report.answers?.length ?? 0) > 0 && (
        <section className="answers" aria-label="AIに見てほしいことへの回答">
          <h3>ご要望・ご質問への回答</h3>
          <ol>
            {report.answers!.map((a, i) => (
              <li key={i}>
                <p className="answer-q">
                  <span aria-hidden>Q</span>
                  {a.question}
                  {a.certainty && <CertaintyBadge value={a.certainty} />}
                </p>
                <p className="answer-a">{a.answer}</p>
                {!streaming && <Sources list={a.evidence} />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {view !== "営業" && (checklist.length > 0 || counts.consult > 0) && (
        <div className="kpis">
          <button type="button" className="kpi tone-danger" onClick={() => setTab("check")}>
            <strong>{streaming ? hits : <CountUp to={hits} />}</strong>
            <span>該当する論点</span>
          </button>
          <button type="button" className="kpi tone-warn" onClick={() => setTab("check")}>
            <strong>{streaming ? maybe : <CountUp to={maybe} />}</strong>
            <span>可能性あり</span>
          </button>
          <button type="button" className="kpi tone-info" onClick={() => setTab("consult")}>
            <strong>{streaming ? counts.consult : <CountUp to={counts.consult} />}</strong>
            <span>事前協議の窓口</span>
          </button>
          <button type="button" className="kpi tone-ok" onClick={() => setTab("tasks")}>
            <strong>
              {doneCount}/{counts.tasks}
            </strong>
            <span>タスク完了</span>
          </button>
        </div>
      )}

      <CertaintyLegend compact />

      <div className="tabs" role="tablist" aria-label="回答の内容">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={`tab ${active === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)} disabled={t.n === 0}>
            {t.label}
            {t.n > 0 && <span className="tab-n">{t.n}</span>}
          </button>
        ))}
      </div>

      {/* 見落としチェック */}
      <section className={panel("check")}>
        <div className="checkgrid">
          {shownChecks.map((c, i) => (
            <div key={i} className={`checktile tone-${STATUS_TONE[c.status ?? ""] ?? "info"}`}>
              <div className="checktile-head">
                <span className={`pill tone-${STATUS_TONE[c.status ?? ""] ?? "info"}`}>{c.status ?? "…"}</span>
                <CertaintyBadge value={c.certainty} />
              </div>
              <strong className="checktile-title">{short(c.item)}</strong>
              {c.note && <p>{c.note}</p>}
              {!streaming && <Sources list={c.evidence} />}
            </div>
          ))}
        </div>
        {noneChecks.length > 0 && (
          <Fold className="nonefold" head={<span className="fold-title muted">該当なし（{noneChecks.length}項目）：{noneChecks.map((c) => short(c.item)).join("・")}</span>}>
            <ul className="nonelist">
              {noneChecks.map((c, i) => (
                <li key={i}>
                  <strong>{short(c.item)}</strong> <CertaintyBadge value={c.certainty} />
                  <span>{c.note}</span>
                  <Sources list={c.evidence} />
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </section>

      {/* 資料の読み取り */}
      {counts.docs > 0 && (
        <section className={panel("docs")}>
          <p className="panel-hint">資料に書いてあることを「読み取った事実」、法令上気になる点や食い違いを ⚠ で示します。</p>
          <div className="docgrid">
            {report.documents?.map((d, i) => (
              <article key={i} className="doccard">
                <header>
                  <span className="pill tone-info">{d.kind ?? "資料"}</span>
                  <strong title={d.name}>{d.name}</strong>
                </header>
                {d.facts && d.facts.length > 0 && (
                  <ul className="docfacts">
                    {d.facts.map((f, j) => <li key={j}>{f}</li>)}
                  </ul>
                )}
                {d.concerns && d.concerns.length > 0 && (
                  <ul className="docconcerns">
                    {d.concerns.map((c, j) => <li key={j}>{c}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 設計の注意 */}
      <section className={panel("design")}>
        <p className="panel-hint">優先度の高い順。押すと詳しい内容と出典を表示します。</p>
        {report.design?.map((d, i) => (
          <Fold
            key={i}
            defaultOpen={i === 0}
            head={
              <>
                <span className={`prio tone-${PRIO_TONE[d.priority ?? ""] ?? "info"}`}>{d.priority ?? "…"}</span>
                <span className="fold-title">{d.title}</span>
                <CertaintyBadge value={d.certainty} />
              </>
            }
          >
            <p>{d.detail}</p>
            <Sources list={d.evidence} />
          </Fold>
        ))}
      </section>

      {/* 役所への事前協議 */}
      <section className={panel("consult")}>
        <p className="panel-hint">上から順に回るのがおすすめです。押すと確認項目・持参資料・出典を表示します。</p>
        {report.consultations?.map((c, i) => (
          <Fold
            key={i}
            className="consult"
            head={
              <>
                <span className="step-no">{i + 1}</span>
                <span className="consult-main">
                  <strong>{c.agency}</strong>
                  <span className="consult-purpose">{c.purpose}</span>
                  <span className="consult-meta">
                    {c.timing && <span className="pill tone-info wrap">{c.timing}</span>}
                    {(c.items?.length ?? 0) > 0 && <span className="pill tone-muted">確認 {c.items?.length}項目</span>}
                  </span>
                </span>
              </>
            }
          >
            {c.items && c.items.length > 0 && (
              <ul className="todo plain">
                {c.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            )}
            {c.bring && (
              <p className="bring">
                <span className="pill tone-muted">持参</span>
                {c.bring}
              </p>
            )}
            <Sources list={c.evidence} />
          </Fold>
        ))}
      </section>

      {/* 手続きの流れ */}
      <section className={panel("steps")}>
        <ol className="stepper">
          {report.procedures?.map((p, i) => (
            <li key={i}>
              <span className="step-dot">{i + 1}</span>
              <div className="step-body">
                <strong>{p.step}</strong> <CertaintyBadge value={p.certainty} />
                <div className="step-meta">
                  {p.timing && <span className="pill tone-info">{p.timing}</span>}
                  {p.duration && <span className="pill tone-muted">{p.duration}</span>}
                  {p.agency && <span className="step-agency">{p.agency}</span>}
                </div>
                <Sources list={p.evidence} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* タスク */}
      <section className={panel("tasks")}>
        <div className="task-head">
          <div className="segmented" role="radiogroup" aria-label="担当">
            {(["すべて", ...ROLES] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "is-active" : ""} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
          <span className="task-progress">
            <span className="bar">
              <span style={{ width: `${counts.tasks ? (doneCount / counts.tasks) * 100 : 0}%` }} />
            </span>
            {doneCount}/{counts.tasks} 完了
          </span>
        </div>
        <p className="panel-hint">チェックはこの端末に保存されます。「タスクをCSV」で表計算ソフトに、「PDFで保存」で一覧表にできます。</p>
        {TASK_WHEN.filter((w) => shownTasks.some((t) => t.when === w)).map((w) => (
          <div key={w} className="taskgroup">
            <h4>{w}</h4>
            <ul className="tasklist">
              {shownTasks
                .filter((t) => t.when === w)
                .map((t) => (
                  <li key={t.i} className={taskDone[t.i] ? "is-done" : ""}>
                    <label>
                      <input type="checkbox" checked={!!taskDone[t.i]} onChange={() => onToggleTask(t.i)} />
                      <span className="task-text">{t.task}</span>
                    </label>
                    <span className="task-meta">
                      {t.role && <span className="pill tone-info">{t.role}</span>}
                      {t.agency && <span className="task-agency">{t.agency}</span>}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {shownTasks.length === 0 && <p className="panel-hint">この担当のタスクはありません。</p>}
      </section>

      {/* 質問 */}
      <section className={panel("questions")}>
        <div className="qcols">
          {ASK_TO.map((to) => {
            const qs = (report.questions ?? []).filter((q) => q.to === to);
            if (qs.length === 0) return null;
            return (
              <div key={to} className="qcol">
                <h4>{to}に聞く</h4>
                <ul>
                  {qs.map((q, i) => <li key={i}>{q.question}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {report.assumptions && report.assumptions.length > 0 && (
        <Fold className="assume" head={<span className="fold-title muted">前提にしたこと・推測で置いたこと（{report.assumptions.length}件）</span>}>
          <ul>
            {report.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </Fold>
      )}

      {sourceCounts && (
        <p className="trust">
          この回答で参照した出典：<span className="evchip tier-条文">条文 {sourceCounts["条文"] ?? 0}</span>
          <span className="evchip tier-公的">公的資料 {sourceCounts["公的"] ?? 0}</span>
          <span className="evchip tier-参考">参考 {sourceCounts["参考"] ?? 0}</span>
          AIが調べてまとめた内容です。「確定」も出典リンクで確かめ、最終判断は窓口と建築士で行ってください。
        </p>
      )}

      {streaming && <p className="spinner">続きを書いています…</p>}
    </div>
  );
}
