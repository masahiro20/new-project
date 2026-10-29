"use client";

import { useEffect, useState } from "react";
import { envelope, fitRange, type EnvelopeInput } from "@/lib/envelope";
import type { PlanInput } from "@/lib/plan";

const SIDE: Record<string, EnvelopeInput["roadSide"]> = { 北: "北", 北東: "北", 北西: "北", 南: "南", 南東: "南", 南西: "南", 東: "東", 西: "西" };
const HEIGHTS = [
  { h: 7, label: "2階建て（約7m）" },
  { h: 10, label: "3階建て（約10m）" },
];

/** 建てられる高さの目安（断面図）。設計初期の検討用。 */
export default function EnvelopeView({
  zoning,
  far,
  roadWidth,
  roadDirection,
  depth,
}: {
  zoning: PlanInput["zoning"];
  far: number | null;
  roadWidth: number | null;
  roadDirection?: string;
  depth?: number;
}) {
  const [w, setW] = useState(roadWidth ?? 4);
  const [a, setA] = useState(1);
  const [d, setD] = useState(depth ?? 15);
  const [side, setSide] = useState<EnvelopeInput["roadSide"]>(SIDE[roadDirection ?? ""] ?? "南");
  const [abs, setAbs] = useState<10 | 12>(10);
  useEffect(() => setW(roadWidth ?? 4), [roadWidth]);
  useEffect(() => setD(depth ?? 15), [depth]);
  useEffect(() => setSide(SIDE[roadDirection ?? ""] ?? "南"), [roadDirection]);

  const e = envelope({ zoning, far: far ?? 200, roadWidth: w, setback: a, depth: d, roadSide: side, absHeight: abs });
  if (!e) return <p className="hint">用途地域が分かると、建てられる高さの目安（断面図）を表示します。</p>;

  const maxH = Math.max(12, Math.min(40, Math.max(...e.points.map((p) => p.h)) + 2));
  const W = 640;
  const H = 260;
  const pad = { l: 34, r: 12, t: 12, b: 28 };
  const total = w + d;
  const sx = (x: number) => pad.l + ((x + w) / total) * (W - pad.l - pad.r);
  const sy = (h: number) => H - pad.b - (Math.min(h, maxH) / maxH) * (H - pad.t - pad.b);
  const poly = [`${sx(a)},${sy(0)}`, ...e.points.map((p) => `${sx(p.x)},${sy(p.h)}`), `${sx(d)},${sy(0)}`].join(" ");
  const low = zoning.includes("低層") || zoning === "田園住居地域";

  return (
    <div className="envelope">
      <div className="envelope-inputs">
        <label>
          前面道路の幅員
          <input type="number" min={1} max={40} step={0.1} value={w} onChange={(ev) => setW(Number(ev.target.value) || 0)} />m{roadWidth === null && <small>（仮定）</small>}
        </label>
        <label>
          道路からの後退
          <input type="number" min={0} max={20} step={0.1} value={a} onChange={(ev) => setA(Number(ev.target.value) || 0)} />m
        </label>
        <label>
          敷地の奥行
          <input type="number" min={3} max={200} step={0.5} value={d} onChange={(ev) => setD(Number(ev.target.value) || 0)} />m{depth === undefined && <small>（仮定）</small>}
        </label>
        <label>
          道路の方位
          <select value={side} onChange={(ev) => setSide(ev.target.value as EnvelopeInput["roadSide"])}>
            {(["南", "北", "東", "西"] as const).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {low && (
          <label>
            絶対高さ
            <select value={abs} onChange={(ev) => setAbs(Number(ev.target.value) as 10 | 12)}>
              <option value={10}>10m</option>
              <option value={12}>12m</option>
            </select>
          </label>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="envelope-svg" role="img" aria-label="建てられる高さの断面図">
        <rect x={sx(-w)} y={sy(0)} width={sx(0) - sx(-w)} height={6} className="env-road" />
        <text x={(sx(-w) + sx(0)) / 2} y={H - 8} textAnchor="middle" className="env-label">
          道路 {w}m
        </text>
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} className="env-ground" />
        <polygon points={poly} className="env-area" />
        <polyline points={e.points.map((p) => `${sx(p.x)},${sy(p.h)}`).join(" ")} className="env-line" />
        {HEIGHTS.map((r) => (
          <g key={r.h}>
            <line x1={sx(a)} x2={sx(d)} y1={sy(r.h)} y2={sy(r.h)} className="env-ref" />
            <text x={sx(d) - 4} y={sy(r.h) - 4} textAnchor="end" className="env-label">
              {r.label}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 30].filter((h) => h <= maxH).map((h) => (
          <text key={h} x={pad.l - 6} y={sy(h) + 4} textAnchor="end" className="env-axis">
            {h}
          </text>
        ))}
        <text x={(sx(0) + sx(d)) / 2} y={H - 8} textAnchor="middle" className="env-label">
          敷地 奥行{d}m（道路境界から）
        </text>
      </svg>
      <ul className="envelope-sum">
        {HEIGHTS.map((r) => {
          const fr = fitRange(e, r.h);
          return (
            <li key={r.h}>
              <b>{r.label}</b>：
              {!fr
                ? "この条件では入らない（高度地区・天空率の検討が必要）"
                : fr.from <= a + 1e-9
                  ? `道路から${a}mの位置から奥へ約${fr.length}mまで入る`
                  : `道路境界から約${Math.ceil(fr.from * 10) / 10}m以上下がれば、そこから奥へ約${fr.length}mまで入る`}
            </li>
          );
        })}
        <li>
          道路斜線：勾配{e.slope}・適用距離{e.applyDistance}m（容積率{far ?? "200（仮定）"}%）。最も低い位置の制限：
          {e.points[0].by} {e.points[0].h}m
        </li>
      </ul>
      <p className="hint">{e.notes.join("。")}。建築基準法55条・56条・別表第三による計画初期の目安です。</p>
    </div>
  );
}
