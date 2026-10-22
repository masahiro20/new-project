"use client";

import { useEffect, useMemo, useState } from "react";

// Background "footage" for the hero: real aerial photographs (国土地理院 シームレス空中写真)
// of places around the 東海 area, cut every few seconds like a reel, with a slow push-in,
// contour lines, a sweeping scan line and a survey reticle on top. Pure CSS motion;
// with prefers-reduced-motion it shows the first frame only.

const SCENES = [
  { name: "GIFU / 金華山", lat: 35.4339, lon: 136.7819 },
  { name: "KOMAKI / 小牧山", lat: 35.2923, lon: 136.9126 },
  { name: "NAGOYA / 名古屋城", lat: 35.1856, lon: 136.8996 },
  { name: "INUYAMA / 犬山", lat: 35.3884, lon: 136.9393 },
];
const CUT_MS = 5200;

const src = (s: (typeof SCENES)[number]) => `/api/annai?lat=${s.lat}&lon=${s.lon}&z=16&style=photo&bare=1&fmt=jpg&w=1600&h=1000`;

/** Concentric, gently distorted rings: a topographic map look without any data. */
function contours(): string[] {
  const out: string[] = [];
  const cx = 820;
  const cy = 430;
  for (let k = 1; k <= 9; k++) {
    const r = 60 + k * 62;
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const wobble = 1 + 0.09 * Math.sin(a * 3 + k * 0.7) + 0.05 * Math.sin(a * 5 - k) + 0.03 * Math.cos(a * 7 + k * 1.3);
      pts.push(`${(cx + Math.cos(a) * r * wobble * 1.35).toFixed(1)},${(cy + Math.sin(a) * r * wobble).toFixed(1)}`);
    }
    out.push(`M${pts.join(" L")} Z`);
  }
  return out;
}

function useScramble(value: string, key: number): string {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let n = 0;
    const t = setInterval(() => {
      n++;
      setShown(value.replace(/\d/g, (d, i) => (n > 10 + i / 2 ? d : String(Math.floor(Math.random() * 10)))));
      if (n > 22) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [value, key]);
  return shown;
}

export default function AerialReel() {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState<number[]>([0, 1]);
  const paths = useMemo(contours, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setI((v) => {
        const next = (v + 1) % SCENES.length;
        setMounted((m) => Array.from(new Set([...m, next, (next + 1) % SCENES.length])));
        return next;
      });
    }, CUT_MS);
    return () => clearInterval(t);
  }, []);

  const s = SCENES[i];
  const coords = useScramble(`${s.lat.toFixed(4)}°N  ${s.lon.toFixed(4)}°E`, i);

  return (
    <div className="reel" aria-hidden>
      {SCENES.map((sc, k) =>
        mounted.includes(k) ? <img key={sc.name} className={`reel-img ${k === i ? "is-on" : ""}`} src={src(sc)} alt="" decoding="async" /> : null,
      )}
      <div className="reel-shade" />
      <svg className="reel-contours" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {paths.map((d, k) => (
          <path key={k} d={d} style={{ animationDelay: `${k * -1.3}s` }} />
        ))}
      </svg>
      <div className="reel-grid" />
      <div className="reel-scan" />
      <div className="reel-flash" key={`f${i}`} />
      <div className="reticle">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="cross" />
      </div>
      <div className="reel-hud">
        <span className="rec">● REC</span>
        <span>
          SCENE {String(i + 1).padStart(2, "0")}/{String(SCENES.length).padStart(2, "0")}
        </span>
        <strong key={s.name}>{s.name}</strong>
        <span className="coords">{coords}</span>
        <span className="src">航空写真：国土地理院</span>
      </div>
      <div className="reel-progress">
        {SCENES.map((sc, k) => (
          <span key={sc.name} className={k === i ? "is-on" : k < i ? "is-done" : ""} />
        ))}
      </div>
    </div>
  );
}
