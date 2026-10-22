"use client";

import { useEffect, useState } from "react";
import type { ChibanResult } from "@/lib/chiban";
import type { KozuResult } from "@/lib/kozu";

export type LotInfo = { kozu: KozuResult | null; chiban: ChibanResult | null };

const LINKS = [
  { label: "登記情報提供サービス", sub: "地目・地積・所有者（全部事項）と公図をPDFで。1件300円台", url: "https://www1.touki.or.jp/" },
  { label: "かんたん証明書請求", sub: "登記事項証明書を郵送で（ローン・申請の提出用）", url: "https://www.touki-kyoutaku-online.moj.go.jp/" },
  { label: "eMAFF農地ナビ", sub: "農地なら地番・地目・面積・農振区分を無料で", url: "https://map.maff.go.jp/" },
];

type Shape = { chiban: string; ring: [number, number][]; main: boolean };

/** Lots in metres around the origin (x east, y south), drawn like a 公図. */
export function LotDrawing({ shapes, pin = false, className = "lotsvg" }: { shapes: Shape[]; pin?: boolean; className?: string }) {
  if (shapes.length === 0) return null;
  const main = shapes.find((s) => s.main) ?? shapes[0];
  const span = Math.max(...main.ring.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))), 12);
  // Frame: everything drawn, but no further than ~2.5x the main lot from it.
  const limit = Math.min(Math.max(span * 2.6, 30), 60);
  const pts = shapes.flatMap((s) => s.ring).filter(([x, y]) => Math.abs(x) <= limit && Math.abs(y) <= limit);
  const minX = Math.min(...pts.map((p) => p[0]), -span) - 2;
  const maxX = Math.max(...pts.map((p) => p[0]), span) + 2;
  const minY = Math.min(...pts.map((p) => p[1]), -span) - 2;
  const maxY = Math.max(...pts.map((p) => p[1]), span) + 2;
  const w = maxX - minX;
  const h = maxY - minY;
  const font = Math.max(w, h) / 44;
  return (
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} className={className} role="img" aria-label="地番図">
      <defs>
        <clipPath id="lotclip">
          <rect x={minX} y={minY} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath="url(#lotclip)">
        {shapes.map((s, i) => (
          <polygon key={i} pathLength={1} className={s.main ? "lot is-main" : /^(道|水|里|堤|溝)/.test(s.chiban) ? "lot is-public" : "lot"} points={s.ring.map(([x, y]) => `${x},${y}`).join(" ")} style={{ animationDelay: `${Math.min(i, 40) * 18}ms` }} />
        ))}
        {shapes.map((s, i) => {
          const xs = s.ring.map((p) => p[0]);
          const ys = s.ring.map((p) => p[1]);
          const w = Math.max(...xs) - Math.min(...xs);
          const h = Math.max(...ys) - Math.min(...ys);
          const size = s.main ? font * 1.35 : font;
          if (!s.main && (w < size * (s.chiban.length * 0.6 + 0.4) || h < size * 1.1)) return null;
          const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
          const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
          return (
            <text key={`t${i}`} x={cx} y={cy} className={s.main ? "lot-label is-main" : "lot-label"} fontSize={size} textAnchor="middle" dominantBaseline="middle">
              {s.chiban}
            </text>
          );
        })}
      </g>
      {pin && (
        <>
          <circle cx="0" cy="0" r={font * 0.5} className="lot-pin" />
          <circle cx="0" cy="0" r={font * 1.3} className="lot-pin-ring" />
        </>
      )}
    </svg>
  );
}

/** Point-based lots (公共座標) to the same metre frame. */
export function chibanShapes(r: ChibanResult, lat: number, lon: number): Shape[] {
  const mx = 111_320 * Math.cos((lat * Math.PI) / 180);
  return r.lots.map((l) => ({ chiban: l.chiban, main: l.contains, ring: l.ring.map(([x, y]) => [(x - lon) * mx, -(y - lat) * 111_320] as [number, number]) }));
}

export default function LotCard({ address, lat, lon, accessKey, onInfo }: { address: string; lat: number; lon: number; accessKey: string; onInfo?: (info: LotInfo | null) => void }) {
  const [info, setInfo] = useState<LotInfo | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setInfo(null);
    setError(null);
    fetch(`/api/lot?address=${encodeURIComponent(address)}&lat=${lat}&lon=${lon}`, { headers: accessKey ? { "x-access-key": accessKey } : {} })
      .then((r) => r.json())
      .then((d: LotInfo & { error?: string }) => {
        if (!alive) return;
        if (d.error) {
          setError(d.error);
          onInfo?.(null);
          return;
        }
        setInfo(d);
        onInfo?.(d);
      })
      .catch(() => alive && setError("通信エラーで公図データを取得できませんでした。"))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, lat, lon, accessKey]);

  const kozu = info?.kozu?.status === "ok" ? info.kozu : null;
  const chiban = !kozu && info?.chiban?.status === "ok" ? info.chiban : null;
  const shapes: Shape[] = kozu ? kozu.lots : chiban ? chibanShapes(chiban, lat, lon) : [];
  const mainLot = kozu ? `${kozu.district ?? ""} ${kozu.query?.chiban ?? ""}` : chiban ? `${chiban.lots[0].oaza}${chiban.lots[0].chiban}` : null;
  const publicLots = shapes.filter((s) => !s.main && /^(道|水|里|堤|溝)/.test(s.chiban)).map((s) => s.chiban);
  const messages = [info?.kozu && info.kozu.status !== "ok" ? info.kozu.message : "", info?.chiban && info.chiban.status !== "ok" ? info.chiban.message : ""].filter(Boolean);

  return (
    <figure className="plate plate-lot">
      <div className="plate-head">
        <span className="plate-no">Fig. 2</span>
        <h3>公図</h3>
        {mainLot && (
          <span className={`cert ${kozu ? "cert-確定" : "cert-推測"}`}>
            <span aria-hidden>{kozu ? "✓" : "?"}</span>
            {kozu ? "地番で照合" : "推測"}
          </span>
        )}
      </div>
      <div className="lot-figure">
        {busy && (
          <div className="scanning">
            <span className="radar" aria-hidden />
            <p>法務省の登記所備付地図データを照合しています…</p>
          </div>
        )}
        {!busy && shapes.length > 0 && <LotDrawing shapes={shapes} pin={!kozu} />}
        {!busy && shapes.length === 0 && <p className="lot-empty">{error ?? (messages.join(" ") || "データがありません。")}</p>}
        {mainLot && <span className="lot-tag">{mainLot}</span>}
      </div>
      <dl className="lot-facts">
        {kozu?.map && (
          <>
            <dt>図面</dt>
            <dd>
              {kozu.map.category}（{kozu.map.kind}）{kozu.map.scale ? `・1/${kozu.map.scale}` : ""}
            </dd>
            <dt>座標</dt>
            <dd>
              {kozu.map.coord}
              {kozu.map.precision ? `・精度区分 ${kozu.map.precision}` : ""}
            </dd>
            <dt>図上の面積</dt>
            <dd>
              約{kozu.area}㎡ <small>参考（登記の地積ではない）</small>
            </dd>
            {publicLots.length > 0 && (
              <>
                <dt>道・水路</dt>
                <dd>{publicLots.join("、")}</dd>
              </>
            )}
          </>
        )}
        {chiban && (
          <>
            <dt>地番</dt>
            <dd>公共座標の地図から代表点で推定</dd>
          </>
        )}
        <dt>地目・地積・所有者</dt>
        <dd>
          登記簿で確認 —{" "}
          {LINKS.map((l, i) => (
            <span key={l.url}>
              {i > 0 && "・"}
              <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.sub}>
                {l.label}
              </a>
            </span>
          ))}
        </dd>
      </dl>
      <figcaption>
        <span>
          出典：法務省 登記所備付地図データ（G空間情報センター{kozu?.dataset?.year ? `・${kozu.dataset.year}年版` : info?.chiban?.dataset?.year ? `・${info.chiban.dataset.year}年版` : ""}）。
          {kozu ? (kozu.map?.coord === "任意座標系" ? "任意座標の図面のため位置・方位・寸法は目安。" : "") : "代表点での判定。"}
          境界・地積の証明には使えません。
        </span>
      </figcaption>
    </figure>
  );
}
