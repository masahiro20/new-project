// 猫イラストをSVG文字列として生成する。React側(dangerouslySetInnerHTML)とCanvas保存の両方で使う。
// 入力はすべて固定の選択肢のみなので、ユーザー入力がSVGに入ることはない。

export type CoatId = "kijitora" | "chatora" | "mike" | "kuro" | "shiro" | "sabashiro" | "hachiware" | "grey";

type Coat = {
  id: CoatId;
  label: string;
  base: string;
  stripe?: string;
  /** 口まわり・胸の白 */
  muzzle: boolean;
  bib: boolean;
  socks: boolean;
  iris: string;
  earInner: string;
  /** 背景に使う淡い色 */
  tint: string;
  pattern?: "mike" | "hachiware";
};

export const COATS: Coat[] = [
  { id: "kijitora", label: "キジトラ", base: "#b89265", stripe: "#5e4634", muzzle: true, bib: false, socks: false, iris: "#e2a92b", earInner: "#f3b5a8", tint: "#f6e3c8" },
  { id: "chatora", label: "茶トラ", base: "#f2a653", stripe: "#d9782b", muzzle: true, bib: true, socks: true, iris: "#d99a1c", earInner: "#f9b9a8", tint: "#ffe4c4" },
  { id: "mike", label: "三毛", base: "#fffaf1", muzzle: false, bib: false, socks: false, iris: "#e0a52c", earInner: "#f6b4a8", tint: "#ffeccd", pattern: "mike" },
  { id: "kuro", label: "黒猫", base: "#413936", muzzle: false, bib: false, socks: false, iris: "#f3c935", earInner: "#9a6a66", tint: "#e3dcef" },
  { id: "shiro", label: "白猫", base: "#fffdf8", muzzle: false, bib: false, socks: false, iris: "#69b5e6", earInner: "#f7bdb4", tint: "#e0f0fb" },
  { id: "sabashiro", label: "サバ白", base: "#8e9ca8", stripe: "#5b6975", muzzle: true, bib: true, socks: true, iris: "#d8b13a", earInner: "#f1b8b0", tint: "#dbe7ee" },
  { id: "hachiware", label: "ハチワレ", base: "#413936", muzzle: true, bib: true, socks: true, iris: "#e6b92f", earInner: "#d9908a", tint: "#e8e0f2", pattern: "hachiware" },
  { id: "grey", label: "グレー", base: "#9aa4af", muzzle: false, bib: false, socks: false, iris: "#8fc66b", earInner: "#efb7b2", tint: "#e1e7ee" },
];

export const COAT_IDS = COATS.map((c) => c.id) as CoatId[];

export function getCoat(id: string | undefined): Coat {
  return COATS.find((c) => c.id === id) ?? COATS[0];
}

export function isCoatId(v: unknown): v is CoatId {
  return typeof v === "string" && COAT_IDS.includes(v as CoatId);
}

export type Traits = {
  /** 君臨度が高い：王冠 + ドヤ顔(半目) */
  crown?: boolean;
  /** 甘え度が高い：ほっぺが赤い + キラキラ目 */
  blush?: boolean;
  /** 気まぐれ度が高い：ウインク */
  wink?: boolean;
  /** 要求度が高い：口を開けて鳴いている */
  open?: boolean;
};

const INK = "#4a3a33";

export function traitsFromAxes(axes: { dom: number; amae: number; mood: number; demand: number }): Traits {
  return { crown: axes.dom >= 50, blush: axes.amae >= 50, wink: axes.mood >= 50, open: axes.demand >= 50 };
}

export function catSvg(opts: { coat: string | undefined; uid: string; traits?: Traits }): string {
  const c = getCoat(opts.coat);
  const t = opts.traits ?? {};
  const u = opts.uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const ink = INK;
  const stripe = c.stripe ?? "";
  const dark = c.id === "kuro" || c.id === "hachiware";
  const earL = c.pattern === "mike" ? "#f2a653" : c.base;
  const earR = c.pattern === "mike" ? "#413936" : c.base;
  const line = dark ? "#2a2220" : ink;

  const eye = (cx: number, side: "l" | "r") => {
    if (t.wink && side === "r") {
      const arc = dark ? c.iris : line;
      return `<path d="M${cx - 10} 101 Q${cx} 90 ${cx + 10} 101" fill="none" stroke="${arc}" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    const big = t.blush;
    const rx = big ? 10.5 : 9.5;
    if (t.crown) {
      // ドヤ顔：半目（下半分だけの目）
      let s = `<path d="M${cx - rx} 100A${rx} 11 0 0 0 ${cx + rx} 100Z" fill="${c.iris}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>`;
      s += `<path d="M${cx - 3.4} 100A3.4 8 0 0 0 ${cx + 3.4} 100Z" fill="#2a2220"/>`;
      s += `<circle cx="${cx - 3}" cy="103" r="2" fill="#fff"/>`;
      s += `<path d="M${cx - rx - 2} 100H${cx + rx + 2}" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`;
      return s;
    }
    const ry = big ? 12.5 : 11;
    let s = `<ellipse cx="${cx}" cy="100" rx="${rx}" ry="${ry}" fill="${c.iris}" stroke="${line}" stroke-width="2.5"/>`;
    s += `<ellipse cx="${cx}" cy="100.5" rx="${big ? 5.2 : 3.4}" ry="${big ? 9 : 8.6}" fill="#2a2220"/>`;
    s += `<circle cx="${cx - 3.2}" cy="${big ? 95.5 : 96}" r="${big ? 3.2 : 2.6}" fill="#fff"/>`;
    if (big) s += `<circle cx="${cx + 3.4}" cy="105" r="1.7" fill="#fff"/>`;
    return s;
  };

  const headStripes = stripe
    ? `<g stroke="${stripe}" stroke-width="5" stroke-linecap="round" fill="none">
        <path d="M100 52v15"/><path d="M86 55q2 9 5 13"/><path d="M114 55q-2 9-5 13"/>
        <path d="M44 98q10 3 17-1"/><path d="M45 111q10 1 16-4"/>
        <path d="M156 98q-10 3-17-1"/><path d="M155 111q-10 1-16-4"/>
      </g>`
    : "";
  const bodyStripes = stripe
    ? `<g stroke="${stripe}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M58 150q8 4 14 2"/><path d="M142 150q-8 4-14 2"/><path d="M54 168q9 3 16 0"/><path d="M146 168q-9 3-16 0"/></g>`
    : "";

  let patches = "";
  let bodyPatches = "";
  if (c.pattern === "mike") {
    patches = `<ellipse cx="68" cy="74" rx="30" ry="25" fill="#f2a653" transform="rotate(-18 68 74)"/>
      <ellipse cx="140" cy="80" rx="25" ry="22" fill="#413936" transform="rotate(14 140 80)"/>`;
    bodyPatches = `<ellipse cx="68" cy="172" rx="26" ry="22" fill="#f2a653"/><ellipse cx="136" cy="182" rx="24" ry="20" fill="#413936"/>`;
  }
  if (c.pattern === "hachiware") {
    patches = `<path d="M100 56Q86 96 68 132H132Q114 96 100 56Z" fill="#fffdf8"/>`;
  }
  const muzzle = c.muzzle ? `<ellipse cx="100" cy="122" rx="23" ry="16" fill="#fffdf8"/>` : "";
  const bib = c.bib ? `<ellipse cx="100" cy="160" rx="24" ry="28" fill="#fffdf8"/>` : "";
  const sock = c.socks ? "#fffdf8" : c.base;

  const blush = t.blush
    ? `<ellipse cx="60" cy="116" rx="9" ry="5.5" fill="#ff8f9c" opacity=".55"/><ellipse cx="140" cy="116" rx="9" ry="5.5" fill="#ff8f9c" opacity=".55"/>`
    : "";

  const mouth = t.open
    ? `<path d="M100 116v4" stroke="${line}" stroke-width="3" stroke-linecap="round"/>
       <path d="M88 122q12-3 24 0q-1 16-12 16q-11 0-12-16Z" fill="#b94a52" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>
       <path d="M93 133q7-6 14 0q-7 5-14 0Z" fill="#ff9aa4"/>`
    : `<path d="M100 116v5q-7 7-14 1M100 121q7 7 14 1" fill="none" stroke="${line}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;

  const whiskerColor = dark ? "#f5eee6" : ink;
  const whiskers = `<g stroke="${whiskerColor}" stroke-width="2.2" stroke-linecap="round" opacity=".85">
      <path d="M62 114 36 108"/><path d="M62 120 34 122"/><path d="M63 126 38 135"/>
      <path d="M138 114 164 108"/><path d="M138 120 166 122"/><path d="M137 126 162 135"/></g>`;

  const crown = t.crown
    ? `<g transform="rotate(-7 100 40)"><path d="M78 52 74 26 90 38 100 20 110 38 126 26 122 52Z" fill="#ffd34d" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="100" cy="43" r="3.4" fill="#ff7f66" stroke="${ink}" stroke-width="1.5"/><circle cx="86" cy="45" r="2.2" fill="#7fd1ae"/><circle cx="114" cy="45" r="2.2" fill="#7fd1ae"/></g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${c.label}の猫のイラスト">
  <defs>
    <clipPath id="h${u}"><ellipse cx="100" cy="100" rx="60" ry="50"/></clipPath>
    <clipPath id="b${u}"><path d="M44 200c-4-30 4-62 30-70q26-8 52 0c26 8 34 40 30 70Z"/></clipPath>
  </defs>
  <path d="M150 188c28 2 40-22 30-46-4-9-12-12-16-6" fill="none" stroke="${line}" stroke-width="22" stroke-linecap="round"/>
  <path d="M150 188c28 2 40-22 30-46-4-9-12-12-16-6" fill="none" stroke="${c.base}" stroke-width="14" stroke-linecap="round"/>
  <path d="M44 200c-4-30 4-62 30-70q26-8 52 0c26 8 34 40 30 70Z" fill="${c.base}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>
  <g clip-path="url(#b${u})">${bodyPatches}${bib}${bodyStripes}</g>
  <path d="M44 200c-4-30 4-62 30-70q26-8 52 0c26 8 34 40 30 70" fill="none" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="78" cy="194" rx="17" ry="11" fill="${sock}" stroke="${line}" stroke-width="3.5"/>
  <ellipse cx="122" cy="194" rx="17" ry="11" fill="${sock}" stroke="${line}" stroke-width="3.5"/>
  <path d="M86 192v6M70 192v6M114 192v6M130 192v6" stroke="${line}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  <path d="M50 78 54 24 98 54Z" fill="${earL}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M150 78 146 24 102 54Z" fill="${earR}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M60 64 62 36 84 53Z" fill="${c.earInner}"/>
  <path d="M140 64 138 36 116 53Z" fill="${c.earInner}"/>
  <ellipse cx="100" cy="100" rx="60" ry="50" fill="${c.base}"/>
  <g clip-path="url(#h${u})">${patches}${headStripes}${muzzle}${blush}</g>
  <ellipse cx="100" cy="100" rx="60" ry="50" fill="none" stroke="${line}" stroke-width="4"/>
  ${crown}
  ${eye(77, "l")}
  ${eye(123, "r")}
  <path d="M93 110h14l-7 8Z" fill="#ff8f9c" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>
  ${mouth}
  ${whiskers}
  <path d="M72 148q28 14 56 0" fill="none" stroke="#ff7f66" stroke-width="7" stroke-linecap="round"/>
  <circle cx="100" cy="159" r="6.5" fill="#ffd34d" stroke="${ink}" stroke-width="2.6"/>
  <path d="M97 159h6" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>
</svg>`;
}
