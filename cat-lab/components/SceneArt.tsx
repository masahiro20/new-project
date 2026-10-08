import type { Traits } from "@/lib/cat";
import type { HumanOpts } from "@/lib/human";
import { sceneSvg, type RelationId } from "@/lib/scenes";

type Props = {
  rel: RelationId;
  variant: number;
  breed: string;
  traits: Traits;
  human: HumanOpts;
  uid: string;
  catLine?: string;
  humanLine?: string;
  className?: string;
};

/** 関係のイラスト。吹き出しの文字はHTMLで重ねる（SVGに入力文字列を入れないため） */
export function SceneArt({ rel, variant, breed, traits, human, uid, catLine, humanLine, className }: Props) {
  const sc = sceneSvg(rel, variant, { breed, traits, human, uid });
  return (
    <div className={`scene${className ? ` ${className}` : ""}`}>
      <div className="scene-svg" dangerouslySetInnerHTML={{ __html: sc.svg }} />
      {sc.bubbles.map((b) => {
        const text = b.who === "cat" ? catLine : humanLine;
        if (!text) return null;
        return (
          <p
            key={b.who}
            className={`sb ${b.who} t-${b.tail}`}
            style={{ left: `${((b.x - b.w / 2) / 400) * 100}%`, top: `${(b.y / 400) * 100}%`, width: `${(b.w / 400) * 100}%` }}
          >
            {text}
          </p>
        );
      })}
    </div>
  );
}
