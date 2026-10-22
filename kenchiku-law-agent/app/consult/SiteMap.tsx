"use client";

import { useState } from "react";

const VIEWS = [
  { key: "wide", label: "案内図（広域）", z: 15, style: "std" },
  { key: "near", label: "周辺", z: 17, style: "std" },
  { key: "photo", label: "航空写真", z: 18, style: "photo" },
] as const;

export const annaiUrl = (lat: number, lon: number, z: number, style: string, w = 1200, h = 800) => `/api/annai?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&z=${z}&style=${style}&w=${w}&h=${h}`;

/** 案内図: GSI map / aerial photo around the site, with a download for each view. */
export default function SiteMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("wide");
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const v = VIEWS.find((x) => x.key === view)!;
  const url = annaiUrl(lat, lon, v.z, v.style);
  return (
    <section className="mapcard">
      <header className="mapcard-head">
        <div>
          <p className="card-kicker">MAP</p>
          <h3>案内図</h3>
        </div>
        <div className="seg" role="tablist" aria-label="地図の種類">
          {VIEWS.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={view === x.key} className={view === x.key ? "is-active" : ""} onClick={() => setView(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
      </header>
      <div className={`mapframe ${loaded[url] ? "is-loaded" : ""}`}>
        <img key={url} src={url} alt={`${label}の${v.label}`} onLoad={() => setLoaded((l) => ({ ...l, [url]: true }))} />
        <span className="pulse" aria-hidden />
        <span className="mapframe-coord">
          {lat.toFixed(5)}°N {lon.toFixed(5)}°E
        </span>
      </div>
      <footer className="mapcard-foot">
        <span className="hint">出典：国土地理院（地理院タイル）。ピンは住所の代表点で、敷地の形・境界は反映していません。</span>
        <a className="btn small ghost" href={url.replace("w=1200&h=800", "w=1600&h=1131")} download={`案内図_${v.label}_${label.slice(0, 30)}.png`}>
          PNGで保存
        </a>
      </footer>
    </section>
  );
}
