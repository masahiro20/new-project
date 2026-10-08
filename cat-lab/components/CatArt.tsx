import { catSvg, type Accessory, type Face, type Traits } from "@/lib/cat";

type Props = {
  breed?: string;
  face?: Face;
  acc?: Accessory;
  traits?: Traits;
  uid: string;
  className?: string;
  flip?: boolean;
};

/** 猫イラスト。SVGは lib/cat.ts が固定の選択肢だけから生成する */
export function CatArt({ breed, face, acc, traits, uid, className, flip }: Props) {
  return (
    <div
      className={`cat-art${className ? ` ${className}` : ""}`}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      dangerouslySetInnerHTML={{ __html: catSvg({ breed, uid, face, acc, traits }) }}
    />
  );
}
