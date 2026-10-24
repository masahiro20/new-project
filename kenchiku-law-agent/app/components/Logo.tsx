/** ホームランディックのロゴ（会社サイトと同じ素材）。 */
export function LogoMark({ size = 30, tone = "white" }: { size?: number; tone?: "white" | "black" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/mark-${tone}.svg`} width={size} height={Math.round((size * 41) / 45)} alt="" className="logo-mark" />;
}

export function LogoType({ height = 28 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logotype-white.svg" height={height} width={Math.round((height * 145) / 32)} alt="ホームランディック 一級建築士事務所" className="logo-type" />;
}
