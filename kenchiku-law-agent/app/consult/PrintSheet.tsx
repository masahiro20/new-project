"use client";

// The one-page-per-topic list that "PDFで保存" prints. Hidden on screen; when
// printing, it is the only thing on the page. Links do not work on paper, so
// every source gets a number [n] that points to the list at the end.

import { Fragment } from "react";
import { askList, groupFacts, type LandFact } from "@/lib/landsummary";
import type { PlanInput } from "@/lib/plan";
import { CERTAINTY, CERTAINTY_HELP, GRADE_HELP, type PartialReport } from "@/lib/report";
import { SEVERITY_SHORT, citeLabel, citeUrl, type Finding } from "@/lib/rules";
import { short, sortedTasks } from "./ReportView";
import { annaiUrl } from "./SiteMap";
import { LotDrawing, chibanShapes, type LotInfo } from "./LotCard";

type Cite = { label?: string; url?: string };
type Source = { tier: string; title: string; url: string };

export default function PrintSheet({
  plan,
  location,
  facts,
  report,
  findings,
  sources,
  taskDone,
  map,
  lot,
}: {
  plan: PlanInput;
  location: string | null;
  facts: LandFact[];
  report: PartialReport | null;
  findings: Finding[];
  sources: Source[];
  taskDone: Record<number, boolean>;
  map?: { lat: number; lon: number } | null;
  lot?: LotInfo | null;
}) {
  // Numbered source registry, filled in render order.
  const registry: { label: string; url: string }[] = [];
  const ref = (list?: Cite[]) => {
    const items = (list ?? []).filter((c) => c.label?.trim());
    if (items.length === 0) return <span className="ps-none">出典なし</span>;
    return items.map((c, i) => {
      const key = c.url || c.label!;
      let n = registry.findIndex((r) => (r.url || r.label) === key);
      if (n < 0) n = registry.push({ label: c.label!, url: c.url ?? "" }) - 1;
      return (
        <span key={i} className="ps-ref">
          [{n + 1}]{c.label}
          {i < items.length - 1 ? " " : ""}
        </span>
      );
    });
  };
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const tasks = report ? sortedTasks(report) : [];
  const checklist = report?.checklist ?? [];
  const ruleItems = findings.filter((f) => !f.rule.routine);

  return (
    <div className="print-sheet" aria-hidden>
      <header className="ps-head">
        <div>
          <p className="ps-kicker">建築・土地 法令チェック表</p>
          <h1>{plan.address || "（住所未入力）"}</h1>
          <p className="ps-plan">{plan.description}</p>
        </div>
        <dl>
          <dt>作成日</dt>
          <dd>{today}</dd>
          <dt>位置</dt>
          <dd>{location ?? "—"}</dd>
        </dl>
      </header>
      <p className="ps-legend">
        確実性の見方：
        {CERTAINTY.map((c) => (
          <span key={c}>
            <b className={`ps-cert ps-cert-${c}`}>{c}</b>
            {CERTAINTY_HELP[c]}
          </span>
        ))}
        <span>
          <b className="ps-cert ps-cert-入力">入力</b>入力どおりの値（原本で確認）
        </span>
      </p>

      {map && (
        <section className="ps-sec ps-map">
          <h2>案内図</h2>
          <div className="ps-maps">
            <img src={annaiUrl(map.lat, map.lon, 15, "std", 1000, 700)} alt="案内図（広域）" />
            <img src={annaiUrl(map.lat, map.lon, 18, "photo", 1000, 700)} alt="航空写真" />
          </div>
          <p className="ps-sub">左：広域（標準地図）　右：航空写真。出典：国土地理院（地理院タイル）。ピンは住所の代表点。</p>
        </section>
      )}

      {(lot?.kozu?.status === "ok" || lot?.chiban?.status === "ok") && (
        <section className="ps-sec ps-lot">
          <h2>公図（登記所備付地図データ）</h2>
          <div className="ps-lot-body">
            <LotDrawing
              className="ps-lotsvg"
              shapes={lot.kozu?.status === "ok" ? lot.kozu.lots : map && lot.chiban ? chibanShapes(lot.chiban, map.lat, map.lon) : []}
              pin={lot.kozu?.status !== "ok"}
            />
            <div className="ps-sub">
              {lot.kozu?.status === "ok" && lot.kozu.map ? (
                <>
                  <b>
                    {lot.kozu.district} {lot.kozu.query?.chiban}
                  </b>
                  <br />
                  {lot.kozu.map.category}（{lot.kozu.map.kind}）{lot.kozu.map.scale ? ` 1/${lot.kozu.map.scale}` : ""}・{lot.kozu.map.coord}
                  {lot.kozu.map.precision ? `・精度区分 ${lot.kozu.map.precision}` : ""}
                  <br />
                  図上の面積 約{lot.kozu.area}㎡（参考。登記の地積ではない）
                </>
              ) : (
                <>代表点が入る筆：{lot.chiban?.lots[0]?.oaza}{lot.chiban?.lots[0]?.chiban}（推測）</>
              )}
              <br />
              地目・地積・所有者は登記事項証明書で確認。出典：法務省 登記所備付地図データ（G空間情報センター）。境界・地積の証明には使えません。
            </div>
          </div>
        </section>
      )}

      {facts.length > 0 && (
        <section className="ps-sec">
          <h2>土地情報まとめ（1段目）</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "16%" }}>項目</th>
                <th>内容</th>
                <th style={{ width: "9%" }}>確実性</th>
                <th style={{ width: "28%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {groupFacts(facts).map((g) => (
                <Fragment key={g.id}>
                  <tr className="ps-group">
                    <th colSpan={4}>{g.title}</th>
                  </tr>
                  {g.facts.map((f) => (
                    <tr key={f.key}>
                      <th>{f.label}</th>
                      <td>
                        <b>{f.value}</b>
                        {f.sub && <div className="ps-sub">{f.sub}</div>}
                      </td>
                      <td>
                        <b className={`ps-cert ps-cert-${f.certainty}`}>{f.certainty}</b>
                      </td>
                      <td>{f.certainty === "入力" ? "入力値" : ref(f.cites)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {askList(facts).length > 0 && (
            <table className="ps-ask">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>確認先</th>
                  <th>確認すること</th>
                </tr>
              </thead>
              <tbody>
                {askList(facts).map((a) => (
                  <tr key={a.office}>
                    <th>{a.office}</th>
                    <td>{a.items.join("・")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {(report?.answers?.length ?? 0) > 0 && (
        <section className="ps-sec">
          <h2>ご要望・ご質問への回答</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "28%" }}>ご要望・ご質問</th>
                <th>回答</th>
                <th style={{ width: "9%" }}>確実性</th>
                <th style={{ width: "20%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {report!.answers!.map((a, i) => (
                <tr key={i}>
                  <th>{a.question}</th>
                  <td>{a.answer}</td>
                  <td>
                    <b className={`ps-cert ps-cert-${a.certainty ?? "要確認"}`}>{a.certainty ?? "要確認"}</b>
                  </td>
                  <td>{ref(a.evidence ?? [])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.summary && (
        <section className="ps-sec ps-verdict">
          <h2>2段目 法令チェック ― 結論：{report.summary.verdict}</h2>
          <p>{report.summary.headline}</p>
          {report.summary.topRisks && report.summary.topRisks.length > 0 && (
            <ol>
              {report.summary.topRisks.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
          )}
          {report.summary.schedule && <p>工程：{report.summary.schedule}</p>}
          {report.summary.grade && (
            <p>
              総合所見：<b>{report.summary.grade}</b>（{GRADE_HELP[report.summary.grade]}）
            </p>
          )}
          {(report.summary.costImpacts?.length ?? 0) > 0 && (
            <>
              <p className="ps-sub">費用・工期に影響しうること</p>
              <ul>
                {report.summary.costImpacts!.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {(report.summary.customerPoints?.length ?? 0) > 0 && (
            <>
              <p className="ps-sub">お客様への説明ポイント</p>
              <ul>
                {report.summary.customerPoints!.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}


      {checklist.length > 0 && (
        <section className="ps-sec">
          <h2>見落としチェック（12項目）</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "22%" }}>項目</th>
                <th style={{ width: "10%" }}>判定</th>
                <th style={{ width: "9%" }}>確実性</th>
                <th>理由・確認先</th>
                <th style={{ width: "22%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {checklist.map((c, i) => (
                <tr key={i} className={c.status === "該当なし" ? "ps-dim" : ""}>
                  <th>{short(c.item)}</th>
                  <td>
                    <b className={`ps-status ps-status-${c.status}`}>{c.status}</b>
                  </td>
                  <td>
                    <b className={`ps-cert ps-cert-${c.certainty}`}>{c.certainty}</b>
                  </td>
                  <td>{c.note}</td>
                  <td>{ref(c.evidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!report && ruleItems.length > 0 && (
        <section className="ps-sec">
          <h2>自動判定の論点（AIの詳しいチェック前）</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "10%" }}>判定</th>
                <th>論点とやること</th>
                <th style={{ width: "18%" }}>窓口</th>
                <th style={{ width: "24%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {ruleItems.map((f) => (
                <tr key={f.rule.id}>
                  <td>{SEVERITY_SHORT[f.severity]}</td>
                  <td>
                    <b>{f.rule.title}</b>
                    <div className="ps-sub">{f.rule.action}</div>
                  </td>
                  <td>{f.rule.agency}</td>
                  <td>{ref([...f.rule.cites.map((c) => ({ label: citeLabel(c), url: citeUrl(c) })), ...(f.rule.refs ?? []).map((r) => ({ label: `${r.publisher}：${r.label}`, url: r.url }))])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.design && report.design.length > 0 && (
        <section className="ps-sec">
          <h2>設計で注意すること</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>優先</th>
                <th>内容</th>
                <th style={{ width: "9%" }}>確実性</th>
                <th style={{ width: "24%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {report.design.map((d, i) => (
                <tr key={i}>
                  <td>{d.priority}</td>
                  <td>
                    <b>{d.title}</b>
                    <div className="ps-sub">{d.detail}</div>
                  </td>
                  <td>
                    <b className={`ps-cert ps-cert-${d.certainty}`}>{d.certainty}</b>
                  </td>
                  <td>{ref(d.evidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.consultations && report.consultations.length > 0 && (
        <section className="ps-sec">
          <h2>役所・関係機関への事前協議</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "18%" }}>窓口</th>
                <th>協議・確認すること</th>
                <th style={{ width: "16%" }}>持参資料</th>
                <th style={{ width: "10%" }}>時期</th>
                <th style={{ width: "18%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {report.consultations.map((c, i) => (
                <tr key={i}>
                  <th>
                    {i + 1}. {c.agency}
                  </th>
                  <td>
                    <b>{c.purpose}</b>
                    <ul>
                      {(c.items ?? []).map((it, j) => <li key={j}>{it}</li>)}
                    </ul>
                  </td>
                  <td>{c.bring}</td>
                  <td>{c.timing}</td>
                  <td>{ref(c.evidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.procedures && report.procedures.length > 0 && (
        <section className="ps-sec">
          <h2>手続きの流れ</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "4%" }}>#</th>
                <th>手続き</th>
                <th style={{ width: "9%" }}>確実性</th>
                <th style={{ width: "16%" }}>時期</th>
                <th style={{ width: "12%" }}>期間</th>
                <th style={{ width: "14%" }}>提出先</th>
                <th style={{ width: "18%" }}>出典</th>
              </tr>
            </thead>
            <tbody>
              {report.procedures.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{p.step}</b>
                  </td>
                  <td>
                    <b className={`ps-cert ps-cert-${p.certainty}`}>{p.certainty}</b>
                  </td>
                  <td>{p.timing}</td>
                  <td>{p.duration}</td>
                  <td>{p.agency}</td>
                  <td>{ref(p.evidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tasks.length > 0 && (
        <section className="ps-sec">
          <h2>タスク一覧</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "5%" }}>済</th>
                <th style={{ width: "12%" }}>時期</th>
                <th style={{ width: "17%" }}>担当</th>
                <th>やること</th>
                <th style={{ width: "22%" }}>相手先</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.i}>
                  <td className="ps-box">{taskDone[t.i] ? "☑" : "☐"}</td>
                  <td>{t.when}</td>
                  <td>{t.role}</td>
                  <td>{t.task}</td>
                  <td>{t.agency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.questions && report.questions.length > 0 && (
        <section className="ps-sec">
          <h2>確認したい質問</h2>
          <table>
            <tbody>
              {report.questions.map((q, i) => (
                <tr key={i}>
                  <th style={{ width: "16%" }}>{q.to}</th>
                  <td>{q.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.documents && report.documents.length > 0 && (
        <section className="ps-sec">
          <h2>資料から読み取ったこと</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "24%" }}>資料</th>
                <th>読み取った事実</th>
                <th style={{ width: "32%" }}>気になる点・食い違い</th>
              </tr>
            </thead>
            <tbody>
              {report.documents.map((d, i) => (
                <tr key={i}>
                  <th>
                    {d.name}
                    <div className="ps-sub">{d.kind}</div>
                  </th>
                  <td>
                    <ul>
                      {(d.facts ?? []).map((f, j) => <li key={j}>{f}</li>)}
                    </ul>
                  </td>
                  <td>
                    <ul>
                      {(d.concerns ?? []).map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report?.assumptions && report.assumptions.length > 0 && (
        <section className="ps-sec">
          <h2>前提にしたこと・推測で置いたこと</h2>
          <ul>
            {report.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      <section className="ps-sec ps-sources">
        <h2>出典一覧</h2>
        <ol>
          {registry.map((r, i) => (
            <li key={i}>
              {r.label}
              {r.url ? <span className="ps-url"> {r.url}</span> : <span className="ps-url">（添付資料）</span>}
            </li>
          ))}
        </ol>
        {sources.length > 0 && (
          <>
            <h3>AIが調べた資料（{sources.length}件）</h3>
            <ul>
              {sources.map((s) => (
                <li key={s.url}>
                  【{s.tier}】{s.title}
                  <span className="ps-url"> {s.url}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="ps-foot">
        建築法令エージェント（社内用）で作成。法令の現行条文（e-Gov法令検索）と国・自治体の公的資料をもとにした検討の出発点です。地図データは住所の代表点で判定しています。最終判断は所管の窓口への確認と建築士の判断で行ってください。
      </footer>
    </div>
  );
}
