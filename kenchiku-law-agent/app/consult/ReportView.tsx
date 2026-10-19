"use client";

import { useState } from "react";
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

function EvidenceLinks({ list }: { list?: Partial<Evidence>[] }) {
  if (!list?.length) return null;
  return (
    <p className="ev">
      {list.map((e, i) =>
        e.url ? (
          <a key={i} href={e.url} target="_blank" rel="noopener noreferrer">
            <span className={`badge tier-${sourceTier(e.url)}`}>{sourceTier(e.url)}</span>
            {e.label}
          </a>
        ) : (
          <span key={i}>{e.label}</span>
        ),
      )}
    </p>
  );
}

const NAV = [
  ["r-design", "設計で注意すること"],
  ["r-consult", "役所への事前協議"],
  ["r-steps", "手続きの流れ"],
  ["r-check", "見落としチェック"],
  ["r-questions", "確認したい質問"],
  ["r-actions", "担当別アクション"],
] as const;

export default function ReportView({ report, streaming }: { report: PartialReport; streaming: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const s = report.summary;
  const tone = s?.verdict ? (VERDICT_TONE[s.verdict] ?? "info") : "info";
  const checklist = report.checklist ?? [];
  const flagged = checklist.filter((c) => c.status === "該当" || c.status === "可能性あり");

  return (
    <div className="report">
      {s && (
        <div className={`verdict tone-${tone}`}>
          <p className="verdict-label">結論</p>
          <h2>{s.verdict ?? "…"}</h2>
          {s.headline && <p className="verdict-headline">{s.headline}</p>}
          {s.topRisks && s.topRisks.length > 0 && (
            <ol className="risks">
              {s.topRisks.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
          )}
          {s.schedule && (
            <p className="schedule">
              <strong>工程への影響</strong>　{s.schedule}
            </p>
          )}
        </div>
      )}

      <nav className="report-nav no-print" aria-label="回答の目次">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      {flagged.length > 0 && (
        <div className="flagbar">
          <strong>見落とし注意：</strong>
          {flagged.map((c, i) => (
            <span key={i} className={`pill tone-${STATUS_TONE[c.status ?? ""] ?? "info"}`}>{(c.item ?? "").split("（")[0]}</span>
          ))}
        </div>
      )}

      {report.design && report.design.length > 0 && (
        <section id="r-design" className="rsec">
          <h3>設計で注意すること</h3>
          <div className="cards">
            {report.design.map((d, i) => (
              <article key={i} className={`dcard prio-${d.priority ?? "中"}`}>
                <h4>
                  <span className={`badge prio prio-${d.priority ?? "中"}`}>{d.priority ? `優先度 ${d.priority}` : "…"}</span>
                  {d.title}
                </h4>
                <p>{d.detail}</p>
                <EvidenceLinks list={d.evidence} />
              </article>
            ))}
          </div>
        </section>
      )}

      {report.consultations && report.consultations.length > 0 && (
        <section id="r-consult" className="rsec">
          <h3>役所・関係機関への事前協議リスト</h3>
          <p className="hint">チェックはこのブラウザ上のメモです（保存されません）。</p>
          <div className="cards">
            {report.consultations.map((c, i) => (
              <article key={i} className="ccard">
                <header>
                  <h4>{c.agency}</h4>
                  {c.timing && <span className="chip">{c.timing}</span>}
                </header>
                {c.purpose && <p className="purpose">{c.purpose}</p>}
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
                    <strong>持参資料</strong>　{c.bring}
                  </p>
                )}
                <EvidenceLinks list={c.evidence} />
              </article>
            ))}
          </div>
        </section>
      )}

      {report.procedures && report.procedures.length > 0 && (
        <section id="r-steps" className="rsec">
          <h3>手続きの流れ</h3>
          <ol className="timeline">
            {report.procedures.map((p, i) => (
              <li key={i}>
                <div className="tl-head">
                  <strong>{p.step}</strong>
                  {p.agency && <span className="hint">　提出先：{p.agency}</span>}
                </div>
                <div className="tl-meta">
                  {p.timing && <span className="chip">時期：{p.timing}</span>}
                  {p.duration && <span className="chip">期間：{p.duration}</span>}
                </div>
                <EvidenceLinks list={p.evidence} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {checklist.length > 0 && (
        <section id="r-check" className="rsec">
          <h3>見落としチェック</h3>
          <div className="table-wrap">
            <table className="checktable">
              <thead>
                <tr>
                  <th>項目</th>
                  <th style={{ width: "7.5em" }}>判定</th>
                  <th>メモ</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((c, i) => (
                  <tr key={i} className={c.status === "該当なし" ? "dim" : ""}>
                    <td>{c.item}</td>
                    <td>{c.status && <span className={`pill tone-${STATUS_TONE[c.status] ?? "info"}`}>{c.status}</span>}</td>
                    <td>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.questions && report.questions.length > 0 && (
        <section id="r-questions" className="rsec">
          <h3>確認したい質問</h3>
          {(["施主", "土地の売主・仲介", "社内", "役所"] as const).map((to) => {
            const qs = report.questions!.filter((q) => q.to === to);
            if (qs.length === 0) return null;
            return (
              <div key={to} className="qgroup">
                <h4>{to}へ</h4>
                <ul>
                  {qs.map((q, i) => <li key={i}>{q.question}</li>)}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {report.actions && report.actions.length > 0 && (
        <section id="r-actions" className="rsec">
          <h3>担当別の次のアクション</h3>
          <div className="roles-grid">
            {report.actions.map((a, i) => (
              <div key={i} className="rolecard">
                <h4>{a.role}</h4>
                <ul>
                  {(a.items ?? []).map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.assumptions && report.assumptions.length > 0 && (
        <section className="rsec">
          <h3>前提・未確認</h3>
          <ul className="assume">
            {report.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      {streaming && <p className="spinner">続きを書いています…</p>}
    </div>
  );
}
