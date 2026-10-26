"use client";

import type { OfficeItem } from "@/lib/officecheck";
import type { Survey } from "@/lib/survey";

/** 役所調査：窓口ごとに聞くこと・地図の見込み・市の公開地図を探すリンク・結果のメモ。 */
export default function OfficeCheckView({ items, survey, set }: { items: OfficeItem[]; survey: Survey; set: (k: keyof Survey, v: string) => void }) {
  const done = items.filter((i) => String(survey[i.memo] ?? "").trim()).length;
  return (
    <div className="office">
      <p className="office-lead">
        道路の種別・幅員・上下水の引込みは、国の公開データでは確定できません。窓口か市の公開地図（指定道路図・道路台帳・下水道台帳）で確かめ、結果を下に書くと、
        <b>土地情報まとめ・法令制限確認書の備考・AIの詳しいチェック</b>に反映されます。
        <span className="office-count">{done}/{items.length} 件 記入済み</span>
      </p>
      <div className="office-grid">
        {items.map((it) => {
          const memo = String(survey[it.memo] ?? "");
          return (
            <section key={it.office} className={`office-card${memo.trim() ? " is-done" : ""}`}>
              <h3>
                {it.office}
                {memo.trim() && <span className="office-done">✓ 記入済み</span>}
              </h3>
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
