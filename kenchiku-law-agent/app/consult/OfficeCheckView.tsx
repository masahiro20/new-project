"use client";

import { useEffect, useState } from "react";
import type { OfficeItem, municipalContext } from "@/lib/officecheck";
import type { Survey } from "@/lib/survey";

/** 役所調査：窓口ごとに聞くこと・地図の見込み・市の公開地図を探すリンク・結果のメモ。 */
export default function OfficeCheckView({
  items,
  survey,
  set,
  muni,
  share,
}: {
  items: OfficeItem[];
  survey: Survey;
  set: (k: keyof Survey, v: string) => void;
  muni?: ReturnType<typeof municipalContext>;
  /** 社内共有（サーバーの非公開ストア）に使う位置とアクセスキー。 */
  share?: { address: string; city: string; lat: number | null; lon: number | null; accessKey: string };
}) {
  const shared = useSharedNotes(share, items, survey, set);
  const done = items.filter((i) => String(survey[i.memo] ?? "").trim()).length;
  return (
    <div className="office">
      <p className="office-lead">
        道路の種別・幅員・上下水の引込みは、国の公開データでは確定できません。窓口か市の公開地図（指定道路図・道路台帳・下水道台帳）で確かめ、結果を下に書くと、
        <b>土地情報まとめ・法令制限確認書の備考・AIの詳しいチェック</b>に反映されます。
        <span className="office-count">{done}/{items.length} 件 記入済み</span>
      </p>
      {muni && (
        <dl className="office-muni">
          <div>
            <dt>{muni.city}の建築確認（特定行政庁）</dt>
            <dd>{muni.tokutei}</dd>
          </div>
          {muni.planMap && (
            <div>
              <dt>都市計画の公開地図</dt>
              <dd>
                <a href={muni.planMap.url} target="_blank" rel="noopener noreferrer">
                  {muni.planMap.label} ↗
                </a>
              </dd>
            </div>
          )}
          <p className="hint">窓口・公開地図は{muni.verifiedAt.replace(/-/g, "/")}に各市の公式ページで確認。担当課や電話番号は変わることがあります。</p>
        </dl>
      )}
      {shared.available && (
        <div className="office-share">
          <div className="office-share-row">
            <strong>社内共有</strong>
            <span className="hint">
              {shared.own ? `共有済み（${new Date(shared.own.updatedAt).toLocaleDateString("ja-JP")}${shared.own.by ? `・${shared.own.by}` : ""}）` : "まだ共有されていません"}
              {shared.filled > 0 && `。共有の結果を${shared.filled}件読み込みました`}
            </span>
            <input type="text" className="office-by" value={shared.by} maxLength={40} placeholder="記入者（任意）" onChange={(e) => shared.setBy(e.target.value)} />
            <button type="button" className="btn small" onClick={shared.save} disabled={shared.busy || done === 0}>
              {shared.busy ? "保存中…" : "調査結果を社内に共有"}
            </button>
          </div>
          {shared.message && <p className="hint">{shared.message}</p>}
          {shared.nearby.length > 0 && (
            <details className="office-nearby" open>
              <summary>近くの調査結果（{shared.nearby.length}件・半径200m）— 同じ道路・同じ本管の可能性</summary>
              <ul>
                {shared.nearby.map((n) => (
                  <li key={n.key}>
                    <b>
                      約{n.meters}m先（{n.address.replace(/^.*?[市町村区]/, "").replace(/[-－]\d+$/, "")}付近）
                    </b>
                    <span>{n.summary}</span>
                    <small>{new Date(n.updatedAt).toLocaleDateString("ja-JP")}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="hint">共有するのは道路・上下水・ガスの調査メモと位置だけです。お客様の情報は送りません。</p>
        </div>
      )}
      <div className="office-grid">
        {items.map((it) => {
          const memo = String(survey[it.memo] ?? "");
          return (
            <section key={it.office} className={`office-card${memo.trim() ? " is-done" : ""}`}>
              <h3>
                {it.office}
                {memo.trim() && <span className="office-done">✓ 記入済み</span>}
              </h3>
              {(it.phone || it.online !== undefined) && (
                <p className="office-meta">
                  {it.phone && <span>☎ {it.phone}</span>}
                  {it.online !== undefined && it.online !== null && <span className={it.online ? "on" : "off"}>{it.online ? "ネットで見られる" : "窓口で確認"}</span>}
                </p>
              )}
              {it.note && <p className="office-note">{it.note}</p>}
              <p className="office-k">聞くこと</p>
              <ol className="office-q">
                {it.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
              {it.hints.length > 0 && (
                <>
                  <p className="office-k">
                    地図・データからの見込み<span className="cert cert-推測">推測</span>
                  </p>
                  <ul className="office-hints">
                    {it.hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="office-links">
                {it.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label} ↗
                  </a>
                ))}
              </p>
              <label className="office-memo">
                <span>確かめた結果</span>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={memo}
                  placeholder={it.example}
                  onChange={(e) => set(it.memo, e.target.value)}
                />
              </label>
            </section>
          );
        })}
      </div>
      <p className="hint">メモはこの端末に住所ごとに保存されます。公開地図は「参考図」の扱いが多いので、確定は窓口の回答・台帳の写しで。</p>
    </div>
  );
}

type Shared = { address: string; by: string; updatedAt: string; notes: Partial<Record<OfficeItem["memo"], string>> };
type Nearby = { key: string; address: string; meters: number; summary: string; updatedAt: string };

/** 共有メモの読み込み（空欄だけ埋める）と保存。 */
function useSharedNotes(
  share: { address: string; city: string; lat: number | null; lon: number | null; accessKey: string } | undefined,
  items: OfficeItem[],
  survey: Survey,
  set: (k: keyof Survey, v: string) => void,
) {
  const [available, setAvailable] = useState(false);
  const [own, setOwn] = useState<Shared | null>(null);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [filled, setFilled] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [by, setByState] = useState("");
  const headers = share?.accessKey ? { "x-access-key": share.accessKey } : undefined;

  useEffect(() => {
    try {
      setByState(localStorage.getItem("kenchiku-law-agent:notes-by") ?? "");
    } catch {
      // storage blocked
    }
  }, []);

  useEffect(() => {
    if (!share || share.address.trim().length < 3) return;
    let alive = true;
    const q = new URLSearchParams({ address: share.address, city: share.city, ...(share.lat !== null && share.lon !== null ? { lat: String(share.lat), lon: String(share.lon) } : {}) });
    fetch(`/api/notes?${q}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available: boolean; own: Shared | null; nearby: Nearby[] } | null) => {
        if (!alive || !d) return;
        setAvailable(d.available);
        setOwn(d.own);
        setNearby(d.nearby ?? []);
        let n = 0;
        for (const it of items) {
          const v = d.own?.notes[it.memo]?.trim();
          if (v && !String(survey[it.memo] ?? "").trim()) {
            set(it.memo, v);
            n++;
          }
        }
        setFilled(n);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.address, share?.lat, share?.lon]);

  async function save() {
    if (!share) return;
    setBusy(true);
    setMessage(null);
    try {
      const notes = Object.fromEntries(items.map((it) => [it.memo, String(survey[it.memo] ?? "")]));
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify({ address: share.address, city: share.city, lat: share.lat, lon: share.lon, notes, by }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(d.error ?? "保存に失敗しました。");
      else {
        setOwn(d.saved);
        setMessage("社内に共有しました。この住所や近くの住所を調べた人に表示されます。");
      }
    } catch {
      setMessage("通信エラーで保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const setBy = (v: string) => {
    setByState(v);
    try {
      localStorage.setItem("kenchiku-law-agent:notes-by", v);
    } catch {
      // storage blocked
    }
  };
  return { available, own, nearby, filled, busy, message, by, setBy, save };
}
