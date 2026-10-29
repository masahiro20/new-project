"use client";

import { useEffect, useState } from "react";
import { ACCURACY_COLUMNS } from "@/lib/accuracy-columns";

type Field = { field: string; expected: string; tool: string; verdict: "一致" | "不一致" | "判定なし" | "正解なし" };
type Result = { address: string; fields: Field[]; error?: string };
type Summary = { field: string; hit: number; miss: number; none: number; rate: number | null };

const EXAMPLE = `${ACCURACY_COLUMNS.join(",")}
愛知県〇〇市〇〇町1-2,市街化区域,第一種住居地域,準防火地域,60%,200%,4.0,8.2,下水道,都市ガス`;

export default function AccuracyClient() {
  const [csv, setCsv] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  useEffect(() => {
    try {
      setKey(localStorage.getItem("kenchiku-law-agent:access") ?? "");
    } catch {
      // storage blocked
    }
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/accuracy", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-access-key": key } : {}) }, body: JSON.stringify({ csv }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? `実行できませんでした（${res.status}）`);
      else {
        setResults(d.results);
        setSummary(d.summary);
      }
    } catch {
      setError("通信エラーで実行できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="accuracy">
      <p className="hint">
        1行1件のCSV（Excelからコピーして貼り付けでも可）。列：{ACCURACY_COLUMNS.join("・")}。分かる列だけで構いません（空欄は比べません）。お客様の名前は不要です。1回20件まで、1件あたり数秒かかります。
      </p>
      <textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={EXAMPLE} />
      <div className="accuracy-run">
        <button type="button" className="btn" onClick={run} disabled={busy || csv.trim().length < 5}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden />
              照合しています
            </>
          ) : (
            "答え合わせを実行"
          )}
        </button>
        {!key && <span className="hint">アクセスキーは「土地を調べる」画面で一度入れると、ここでも使われます。</span>}
      </div>
      {error && <p className="notice">{error}</p>}
      {summary.length > 0 && (
        <>
          <h2>項目ごとの正答率</h2>
          <table className="accuracy-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>正答率</th>
                <th>一致</th>
                <th>不一致</th>
                <th>ツールが判定できず</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.field}>
                  <th>{s.field}</th>
                  <td className={s.rate === null ? "" : s.rate >= 90 ? "good" : s.rate >= 70 ? "mid" : "bad"}>{s.rate === null ? "—" : `${s.rate}%`}</td>
                  <td>{s.hit}</td>
                  <td>{s.miss}</td>
                  <td>{s.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>案件ごとの内訳</h2>
          {results.map((r, i) => (
            <details key={i} className="accuracy-case" open={r.fields.some((f) => f.verdict === "不一致")}>
              <summary>
                {r.address}
                {r.error ? `（エラー：${r.error}）` : `　不一致 ${r.fields.filter((f) => f.verdict === "不一致").length}件`}
              </summary>
              <table className="accuracy-table">
                <tbody>
                  {r.fields
                    .filter((f) => f.verdict !== "正解なし")
                    .map((f) => (
                      <tr key={f.field} className={`v-${f.verdict}`}>
                        <th>{f.field}</th>
                        <td>正解：{f.expected}</td>
                        <td>ツール：{f.tool}</td>
                        <td>{f.verdict}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
