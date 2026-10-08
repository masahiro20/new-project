"use client";

import { useEffect, useState } from "react";
import { drawCard, type CardData } from "@/lib/card";

/** トップに並べる見本カード。ブラウザで描いて画像にする */
export function SampleCards({ samples }: { samples: CardData[] }) {
  const [urls, setUrls] = useState<(string | null)[]>(samples.map(() => null));
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    (async () => {
      for (let i = 0; i < samples.length; i++) {
        const cv = await drawCard(samples[i]);
        const b: Blob | null = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
        if (!b || !alive) return;
        const u = URL.createObjectURL(b);
        made.push(u);
        setUrls((prev) => prev.map((p, k) => (k === i ? u : p)));
      }
    })().catch(() => {});
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [samples]);

  return (
    <div className="fan" aria-label="カードの見本">
      {samples.map((s, i) => (
        <div key={s.rel.id} className={`fan-card f${i}`}>
          {urls[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[i]!} alt={`見本：${s.name}は「${s.rel.name}」`} />
          ) : (
            <div className="fan-ph" style={{ background: `linear-gradient(160deg, ${s.rel.theme[0]}, ${s.rel.theme[1]})` }} />
          )}
        </div>
      ))}
    </div>
  );
}
