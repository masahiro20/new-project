import { catSvg, type Accessory, type Traits } from "@/lib/cat";

type Props = {
  breed?: string;
  traits?: Traits;
  acc?: Accessory;
  uid: string;
  className?: string;
  flip?: boolean;
};

/** 猫イラスト。SVGは lib/cat.ts が固定の選択肢だけから生成する */
export function CatArt({ breed, traits, acc, uid, className, flip }: Props) {
  return (
    <div
      className={`cat-art${className ? ` ${className}` : ""}`}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      dangerouslySetInnerHTML={{ __html: catSvg({ breed, uid, traits, acc }) }}
    />
  );
}
