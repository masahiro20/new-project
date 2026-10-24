"use client";

import { SITE_STEPS, type SiteStepId } from "@/lib/site";

/**
 * 住所の読み込み中の表示。AIの詳しいチェックと同じレーダーと経過時間で、
 * サーバーから届いた順に各データの行へ ✓ を付ける（見せかけではなく実際の取得状況）。
 */
export default function SiteProgress({ done, seconds }: { done: SiteStepId[]; seconds: number }) {
  const current = SITE_STEPS.find((s) => !done.includes(s.id));
  return (
    <div className="runprogress site-progress" role="status" aria-live="polite">
      <div className="radar big" aria-hidden>
        <span className="sweep" />
        <span className="blip b1" />
        <span className="blip b2" />
        <span className="blip b3" />
        <strong className="radar-time">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </strong>
      </div>
      <div className="runprogress-body">
        <div className="runprogress-top">
          <span className="dot-live" aria-hidden />
          <strong>{current ? `${current.label}を読み込んでいます…` : "土地情報をまとめています…"}</strong>
        </div>
        <div className="bar">
          <span style={{ width: `${Math.max(6, (done.length / SITE_STEPS.length) * 100)}%` }} />
        </div>
        <ol className="phases site-steps">
          {SITE_STEPS.map((s) => (
            <li key={s.id} className={done.includes(s.id) ? "is-done" : s.id === current?.id ? "is-current" : "is-wait"}>
              {s.label}
              <small>{s.source}</small>
            </li>
          ))}
        </ol>
        <p className="hint runlog">国の公開データを住所の地点で照合しています。ふつうは10〜20秒ほどです。</p>
      </div>
    </div>
  );
}
