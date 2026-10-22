"use client";

import { useEffect, useState } from "react";
import type { ChibanResult, Lot } from "@/lib/chiban";

const LINKS = [
  { label: "登記情報提供サービス", sub: "地目・地積・所有者（全部事項）と公図をPDFで。1件300円台", url: "https://www1.touki.or.jp/" },
  { label: "かんたん証明書請求", sub: "登記事項証明書を郵送で（ローン・申請の提出用）", url: "https://www.touki-kyoutaku-online.moj.go.jp/" },
  { label: "eMAFF農地ナビ", sub: "農地なら地番・地目・面積・農振区分を無料で", url: "https://map.maff.go.jp/" },
  { label: "MAPPLE法務局地図ビューア", sub: "公図区域もおおよその位置で地図を閲覧", url: "https://biz.mapple.com/registrymap/" },
];

/** Draws the lots around the point like a 公図: outlines, 地番 labels, the lot under the pin filled. */
function LotSvg({ lots, lat, lon }: { lots: Lot[]; lat: number; lon: number }) {
  const mx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const my = 111_320;
  const pts = lots.flatMap((l) => l.ring.map(([x, y]) => [(x - lon) * mx, -(y - lat) * my]));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 6;
  const minX = Math.max(Math.min(...xs), -80) - pad;
  const maxX = Math.min(Math.max(...xs), 80) + pad;
  const minY = Math.max(Math.min(...ys), -60) - pad;
  const maxY = Math.min(Math.max(...ys), 60) + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const label = (l: Lot) => {
    const c = l.ring.reduce((a, [x, y]) => [a[0] + (x - lon) * mx, a[1] - (y - lat) * my], [0, 0]).map((v) => v / l.ring.length);
    return { x: c[0], y: c[1] };
  };
  const font = Math.max(w, h) / 46;
  return (
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="lotsvg" role="img" aria-label="周辺の地番図">
      <defs>
        <clipPath id="lotclip">
          <rect x={minX} y={minY} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath="url(#lotclip)">
        {lots.map((l, i) => (
          <polygon key={i} className={l.contains ? "lot is-main" : "lot"} points={l.ring.map(([x, y]) => `${(x - lon) * mx},${-(y - lat) * my}`).join(" ")} style={{ animationDelay: `${Math.min(i, 40) * 18}ms` }} />
        ))}
        {lots.map((l, i) => {
          const c = label(l);
          // Skip labels that would not fit inside small lots (except the one under the pin).
          const lx = l.ring.map(([x]) => (x - lon) * mx);
          const ly = l.ring.map(([, y]) => (y - lat) * my);
          const fits = Math.max(...lx) - Math.min(...lx) > font * (l.chiban.length * 0.62 + 0.4) && Math.max(...ly) - Math.min(...ly) > font * 1.1;
          if (!l.contains && !fits) return null;
          return (
            <text key={`t${i}`} x={c.x} y={c.y} className={l.contains ? "lot-label is-main" : "lot-label"} fontSize={l.contains ? font * 1.3 : font} textAnchor="middle" dominantBaseline="middle">
              {l.chiban}
            </text>
          );
        })}
      </g>
      <circle cx="0" cy="0" r={font * 0.55} className="lot-pin" />
      <circle cx="0" cy="0" r={font * 1.4} className="lot-pin-ring" />
    </svg>
  );
}

export default function LotCard({ lat, lon, accessKey, onLot }: { lat: number; lon: number; accessKey: string; onLot?: (label: string | null) => void }) {
  const [data, setData] = useState<ChibanResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setData(null);
    fetch(`/api/chiban?lat=${lat}&lon=${lon}`, { headers: accessKey ? { "x-access-key": accessKey } : {} })
      .then((r) => r.json())
      .then((d: ChibanResult & { error?: string }) => {
        if (!alive) return;
        const result: ChibanResult = d.error ? { status: "error", muniCd: null, townName: null, dataset: null, lots: [], message: d.error } : d;
        setData(result);
        const main = result.status === "ok" ? result.lots.find((l) => l.contains) : undefined;
        onLot?.(main ? `${main.oaza}${main.chiban}` : null);
      })
      .catch(() => alive && setData({ status: "error", muniCd: null, townName: null, dataset: null, lots: [], message: "通信エラーで地番図を取得できませんでした。" }))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, accessKey]);

  const main = data?.status === "ok" ? data.lots[0] : null;

  return (
    <section className="lotcard">
      <header className="lotcard-head">
        <div>
          <p className="card-kicker">登記・公図の手がかり</p>
          <h3>地番図</h3>
        </div>
        {main && (
          <div className="lot-main">
            <span className="cert cert-推測">
              <span aria-hidden>?</span>推測
            </span>
            <strong>
              {main.oaza}
              {main.chiban}
            </strong>
            <small>{main.contains ? "住所の代表点が入る筆" : `代表点から約${main.distance}m の筆`}</small>
          </div>
        )}
      </header>

      <div className="lot-body">
        <div className="lot-figure">
          {busy && (
            <div className="scanning">
              <span className="radar" aria-hidden />
              <p>法務省の地図データ（登記所備付地図）を照合しています…</p>
            </div>
          )}
          {!busy && data?.status === "ok" && <LotSvg lots={data.lots} lat={lat} lon={lon} />}
          {!busy && data && data.status !== "ok" && <p className="lot-empty">{data.message}</p>}
        </div>

        <div className="lot-side">
          <dl className="lot-facts">
            <dt>地番・筆の形</dt>
            <dd>{data?.status === "ok" ? "法務省の地図データから表示" : busy ? "照合中" : "この場所はデータなし"}</dd>
            <dt>地目・地積</dt>
            <dd>登記簿で確認（農地は農地ナビでも可）</dd>
            <dt>所有者</dt>
            <dd>登記簿（全部事項・所有者事項）で確認</dd>
          </dl>
          <ul className="lot-links">
            {LINKS.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                  <small>{l.sub}</small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="hint lot-note">
        出典：法務省 登記所備付地図データ（G空間情報センター、(一社)社会基盤情報流通推進協議会による変換{data?.dataset?.year ? `・${data.dataset.year}年版` : ""}）。公共座標の地図だけを収録しており、公図そのものではありません。境界・地番の証明には使えないため、登記事項証明書と公図で確かめてください。
      </p>
    </section>
  );
}
