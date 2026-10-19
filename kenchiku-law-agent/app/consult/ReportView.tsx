"use client";

import { useState, type ReactNode } from "react";
import type { Evidence, PartialReport } from "@/lib/report";
import { sourceTier } from "@/lib/tier";

const VERDICT_TONE: Record<string, string> = {
  通常の手続きで建築可能: "ok",
  条件付きで建築可能: "warn",
  "許可・協議が前提": "warn",
  建築が難しい可能性: "danger",
  情報不足で判断保留: "info",
};
const STATUS_TONE: Record<string, string> = { 該当: "danger", 可能性あり: "warn", 要確認: "info", 該当なし: "muted" };
const STATUS_ORDER = ["該当", "可能性あり", "要確認", "該当なし"];
const PRIO_TONE: Record<string, string> = { 高: "danger", 中: "warn", 低: "info" };
const ROLES = ["設計", "コーディネーター", "施工", "営業"] as const;
const ASK_TO = ["施主", "土地の売主・仲介", "社内", "役所"] as const;

const short = (s = "") => s.split("（")[0];

function EvidenceChips({ list }: { list?: Partial<Evidence>[] }) {
  if (!list?.length) return null;
  return (
    <div className="ev">
      <span className="ev-label">根拠</span>
      {list.map((e, i) =>
        e.url ? (
          <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" title={e.label} className={`evchip tier-${sourceTier(e.url)}`}>
            {e.label}
          </a>
        ) : (
          <span key={i} className="evchip tier-参考" title={e.label}>{e.label}</span>
        ),
      )}
    </div>
  );
}

/** Click-to-open row. Collapsed bodies stay in the DOM so printing shows everything. */
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

type TabKey = "check" | "design" | "consult" | "steps" | "questions" | "actions";

export default function ReportView({ report, streaming, sourceCounts }: { report: PartialReport; streaming: boolean; sourceCounts?: Record<string, number> }) {
  const [tab, setTab] = useState<TabKey | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState<(typeof ROLES)[number]>("設計");
  const s = report.summary;
  const tone = s?.verdict ? (VERDICT_TONE[s.verdict] ?? "info") : "info";

  const checklist = [...(report.checklist ?? [])].sort((a, b) => STATUS_ORDER.indexOf(a.status ?? "") - STATUS_ORDER.indexOf(b.status ?? ""));
  const shownChecks = checklist.filter((c) => c.status !== "該当なし");
  const noneChecks = checklist.filter((c) => c.status === "該当なし");
  const counts = {
    check: checklist.length,
    design: report.design?.length ?? 0,
    consult: report.consultations?.length ?? 0,
    steps: report.procedures?.length ?? 0,
    questions: report.questions?.length ?? 0,
    actions: report.actions?.length ?? 0,
  };
  const tabs: { key: TabKey; label: string; n: number }[] = [
    { key: "check", label: "見落としチェック", n: counts.check },
    { key: "design", label: "設計の注意", n: counts.design },
    { key: "consult", label: "役所への事前協議", n: counts.consult },
    { key: "steps", label: "手続きの流れ", n: counts.steps },
    { key: "questions", label: "確認したい質問", n: counts.questions },
    { key: "actions", label: "担当別", n: counts.actions },
  ];
  const active: TabKey = tab ?? tabs.find((t) => t.n > 0)?.key ?? "check";
  const panel = (k: TabKey) => `tabpanel ${active === k ? "" : "is-hidden"}`;
  const hits = checklist.filter((c) => c.status === "該当").length;
  const maybe = checklist.filter((c) => c.status === "可能性あり").length;

  return (
    <div className="report">
      {s && (
        <section className={`hero tone-${tone}`}>
          <div className="hero-top">
            <span className="hero-label">結論</span>
            <h2>{s.verdict ?? "…"}</h2>
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
        </section>
      )}

      {(checklist.length > 0 || counts.consult > 0) && (
        <div className="kpis">
          <div className="kpi tone-danger">
            <strong>{hits}</strong>
            <span>該当する論点</span>
          </div>
          <div className="kpi tone-warn">
            <strong>{maybe}</strong>
            <span>可能性あり</span>
          </div>
          <div className="kpi tone-info">
            <strong>{counts.consult}</strong>
            <span>事前協議の窓口</span>
          </div>
          <div className="kpi tone-muted">
            <strong>{counts.steps}</strong>
            <span>必要な手続き</span>
          </div>
        </div>
      )}

      <div className="tabs no-print" role="tablist" aria-label="回答の内容">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={`tab ${active === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)} disabled={t.n === 0}>
            {t.label}
            {t.n > 0 && <span className="tab-n">{t.n}</span>}
          </button>
        ))}
      </div>

      {/* 見落としチェック */}
      <section className={panel("check")}>
        <h3 className="print-only">見落としチェック</h3>
        <div className="checkgrid">
          {shownChecks.map((c, i) => (
            <div key={i} className={`checktile tone-${STATUS_TONE[c.status ?? ""] ?? "info"}`}>
              <div className="checktile-head">
                <span className={`pill tone-${STATUS_TONE[c.status ?? ""] ?? "info"}`}>{c.status ?? "…"}</span>
                <strong>{short(c.item)}</strong>
              </div>
              {c.note && <p>{c.note}</p>}
            </div>
          ))}
        </div>
        {noneChecks.length > 0 && (
          <p className="nonechecks">
            <span className="pill tone-muted">該当なし</span>
            {noneChecks.map((c) => short(c.item)).join("・")}
          </p>
        )}
      </section>

      {/* 設計の注意 */}
      <section className={panel("design")}>
        <h3 className="print-only">設計で注意すること</h3>
        <p className="panel-hint">クリックで詳しい内容と根拠を表示します。</p>
        {report.design?.map((d, i) => (
          <Fold
            key={i}
            head={
              <>
                <span className={`prio tone-${PRIO_TONE[d.priority ?? ""] ?? "info"}`}>{d.priority ?? "…"}</span>
                <span className="fold-title">{d.title}</span>
              </>
            }
          >
            <p>{d.detail}</p>
            <EvidenceChips list={d.evidence} />
          </Fold>
        ))}
      </section>

      {/* 役所への事前協議 */}
      <section className={panel("consult")}>
        <h3 className="print-only">役所・関係機関への事前協議リスト</h3>
        <p className="panel-hint">上から順に回るのがおすすめです。チェックは画面上のメモです（保存されません）。</p>
        <div className="consults">
          {report.consultations?.map((c, i) => {
            const total = c.items?.length ?? 0;
            const checked = (c.items ?? []).filter((_, j) => done[`${i}:${j}`]).length;
            return (
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
                        {total > 0 && (
                          <span className="pill tone-muted">
                            確認 {checked}/{total}
                          </span>
                        )}
                      </span>
                    </span>
                  </>
                }
              >
                {c.items && c.items.length > 0 && (
                  <ul className="todo">
                    {c.items.map((it, j) => {
                      const key = `${i}:${j}`;
                      return (
                        <li key={j}>
                          <label>
                            <input type="checkbox" checked={!!done[key]} onChange={() => setDone((d) => ({ ...d, [key]: !d[key] }))} />
                            <span className={done[key] ? "struck" : ""}>{it}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {c.bring && (
                  <p className="bring">
                    <span className="pill tone-muted">持参</span>
                    {c.bring}
                  </p>
                )}
                <EvidenceChips list={c.evidence} />
              </Fold>
            );
          })}
        </div>
      </section>

      {/* 手続きの流れ */}
      <section className={panel("steps")}>
        <h3 className="print-only">手続きの流れ</h3>
        <ol className="stepper">
          {report.procedures?.map((p, i) => (
            <li key={i}>
              <span className="step-dot">{i + 1}</span>
              <div className="step-body">
                <strong>{p.step}</strong>
                <div className="step-meta">
                  {p.timing && <span className="pill tone-info">{p.timing}</span>}
                  {p.duration && <span className="pill tone-muted">{p.duration}</span>}
                  {p.agency && <span className="step-agency">{p.agency}</span>}
                </div>
                <EvidenceChips list={p.evidence} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 質問 */}
      <section className={panel("questions")}>
        <h3 className="print-only">確認したい質問</h3>
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

      {/* 担当別 */}
      <section className={panel("actions")}>
        <h3 className="print-only">担当別の次のアクション</h3>
        <div className="segmented no-print" role="radiogroup" aria-label="担当">
          {ROLES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "is-active" : ""} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
        </div>
        {report.actions?.map((a, i) => (
          <div key={i} className={`roleblock ${a.role === role ? "" : "is-hidden"}`}>
            <h4 className="print-only">{a.role}</h4>
            <ul className="todo plain">
              {(a.items ?? []).map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          </div>
        ))}
      </section>

      {report.assumptions && report.assumptions.length > 0 && (
        <Fold className="assume" head={<span className="fold-title muted">前提にしたこと・未確認のこと（{report.assumptions.length}件）</span>}>
          <ul>
            {report.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </Fold>
      )}

      {sourceCounts && (
        <p className="trust">
          この回答の根拠：<span className="evchip tier-条文">条文 {sourceCounts["条文"] ?? 0}</span>
          <span className="evchip tier-公的">公的資料 {sourceCounts["公的"] ?? 0}</span>
          <span className="evchip tier-参考">参考 {sourceCounts["参考"] ?? 0}</span>
          AIが調べてまとめた内容です。数値・期限は根拠リンクで確かめ、最終判断は窓口で確認してください。
        </p>
      )}

      {streaming && <p className="spinner">続きを書いています…</p>}
    </div>
  );
}
