"use client";

export type ViewMode = "営業" | "設計" | "すべて";
export const VIEW_KEY = "kenchiku-law-agent:view";

const OPTIONS: { v: ViewMode; label: string; help: string }[] = [
  { v: "営業", label: "営業・スタッフ", help: "基本情報・ひと目でわかる・お客様対応メモ・案内図。専門的な照合は省きます" },
  { v: "設計", label: "設計士", help: "基本情報に加えて、法令の論点・設計条件チェック（防火・構造・省エネ・内装）を条文つきで" },
  { v: "すべて", label: "すべて", help: "全部の項目を表示" },
];

/** 見る人で、出す項目と噛み砕き方を切り替える。土地の基本情報はどの表示でも出す。 */
export default function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const cur = OPTIONS.find((o) => o.v === view)!;
  return (
    <div className="viewswitch" role="group" aria-label="見る人で表示を切り替え">
      <span className="viewswitch-k">見る人</span>
      <div className="viewswitch-opts">
        {OPTIONS.map((o) => (
          <button key={o.v} type="button" className={o.v === view ? "is-on" : ""} aria-pressed={o.v === view} onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
      <span className="hint">{cur.help}</span>
    </div>
  );
}
