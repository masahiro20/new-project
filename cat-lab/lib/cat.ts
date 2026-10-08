// 猫イラストをSVG文字列として生成する。React側(dangerouslySetInnerHTML)とCanvas保存の両方で使う。
// 入力は固定の選択肢（猫種ID・特徴フラグ）のみ。ユーザーの入力文字列がSVGに入ることはない。

export type BreedId =
  | "kijitora" | "chatora" | "sabashiro" | "mike" | "kuro" | "shiro" | "hachiware" | "sabi"
  | "scottish" | "munchkin" | "amesho" | "russian" | "ragdoll" | "british"
  | "norwegian" | "mainecoon" | "bengal" | "siamese" | "persian" | "sphynx";

type Ear = "normal" | "big" | "small" | "fold" | "tuft";
type Pattern = "tabby" | "classic" | "spots" | "points" | "mike" | "sabi" | "hachiware" | "solid" | "sphynx";

export type Art = {
  base: string;
  stripe?: string;
  /** ポイントカラー（シャム・ラグドール）や三毛・サビの差し色 */
  accent?: string;
  accent2?: string;
  pattern: Pattern;
  ear: Ear;
  eye: string;
  /** 左右で目の色が違う（オッドアイ） */
  eye2?: string;
  muzzle?: boolean;
  bib?: boolean;
  socks?: boolean;
  fluffy?: boolean;
  flat?: boolean;
  short?: boolean;
  dark?: boolean;
  noWhisker?: boolean;
  sweater?: string;
  /** 背景に使う淡い色 */
  tint: string;
};

export const ART: Record<BreedId, Art> = {
  kijitora: { base: "#bf8f5c", stripe: "#6a4630", pattern: "tabby", ear: "normal", eye: "#f2b632", muzzle: true, tint: "#f8e6cc" },
  chatora: { base: "#ffa64d", stripe: "#e27a1f", pattern: "tabby", ear: "normal", eye: "#f5b324", muzzle: true, bib: true, socks: true, tint: "#ffe6c7" },
  sabashiro: { base: "#9fadbb", stripe: "#5e6b79", pattern: "tabby", ear: "normal", eye: "#efc63f", muzzle: true, bib: true, socks: true, tint: "#dfe9f2" },
  mike: { base: "#fffaf2", accent: "#ffa64d", accent2: "#3d3330", pattern: "mike", ear: "normal", eye: "#f2b632", tint: "#fff0d6" },
  kuro: { base: "#3b3331", pattern: "solid", ear: "normal", eye: "#ffd23f", dark: true, tint: "#e9e1f5" },
  shiro: { base: "#fffdf9", pattern: "solid", ear: "normal", eye: "#62c0f5", eye2: "#f5c33b", tint: "#e2f2fc" },
  hachiware: { base: "#3b3331", pattern: "hachiware", ear: "normal", eye: "#f5c33b", muzzle: true, bib: true, socks: true, dark: true, tint: "#ece4f6" },
  sabi: { base: "#3e302b", accent: "#d4793a", pattern: "sabi", ear: "normal", eye: "#f2b632", dark: true, tint: "#f6e2d2" },
  scottish: { base: "#f4ddb8", stripe: "#d9ad74", pattern: "tabby", ear: "fold", eye: "#e8a22e", muzzle: true, tint: "#fff1dc" },
  munchkin: { base: "#ecc898", stripe: "#cf9c5f", pattern: "tabby", ear: "normal", eye: "#79c560", muzzle: true, bib: true, socks: true, short: true, tint: "#fbefd9" },
  amesho: { base: "#cfd4da", stripe: "#3d444d", pattern: "classic", ear: "normal", eye: "#b5c93e", tint: "#e8ecf0" },
  russian: { base: "#8e9cb0", pattern: "solid", ear: "big", eye: "#62c96a", tint: "#e0e6ef" },
  ragdoll: { base: "#fbf4ea", accent: "#8f6f58", pattern: "points", ear: "normal", eye: "#3fa6f2", bib: true, socks: true, fluffy: true, tint: "#e6f1fb" },
  british: { base: "#8f9cae", pattern: "solid", ear: "small", eye: "#f5a12a", tint: "#e4e9f0" },
  norwegian: { base: "#ad8659", stripe: "#5c4129", pattern: "tabby", ear: "tuft", eye: "#d8b43a", muzzle: true, bib: true, fluffy: true, tint: "#ece4d4" },
  mainecoon: { base: "#cf8a4a", stripe: "#8c4f22", pattern: "tabby", ear: "tuft", eye: "#efb73a", muzzle: true, bib: true, fluffy: true, tint: "#f8e1c8" },
  bengal: { base: "#f0b65e", stripe: "#5b3a20", pattern: "spots", ear: "big", eye: "#8fd05a", muzzle: true, tint: "#fbe8c6" },
  siamese: { base: "#f8ecd8", accent: "#4d3a30", pattern: "points", ear: "big", eye: "#3d9bf0", tint: "#e3effb" },
  persian: { base: "#fcf3e6", pattern: "solid", ear: "small", eye: "#f5a12a", fluffy: true, flat: true, tint: "#fbefe3" },
  sphynx: { base: "#f5cdbb", stripe: "#dca896", pattern: "sphynx", ear: "big", eye: "#8fd05a", noWhisker: true, sweater: "#7ec8e3", tint: "#fde4da" },
};

export const BREED_IDS = Object.keys(ART) as BreedId[];

export function isBreedId(v: unknown): v is BreedId {
  return typeof v === "string" && v in ART;
}

export type Traits = {
  /** 君臨度が高い：王冠 + ドヤ顔(半目) */
  crown?: boolean;
  /** 甘え度が高い：ほっぺ強め + キラキラ目 */
  blush?: boolean;
  /** 気まぐれ度が高い：ウインク */
  wink?: boolean;
  /** 要求度が高い：口を開けて鳴いている */
  open?: boolean;
};

export type Accessory = "bow" | "bowtie" | "tie" | "beret" | "bonnet" | "sunglasses" | "headband" | "none";

export function traitsFromAxes(axes: { dom: number; amae: number; mood: number; demand: number }): Traits {
  return { crown: axes.dom >= 60, blush: axes.amae >= 60, wink: axes.mood >= 60, open: axes.demand >= 60 };
}

const OL = "#3b2a24";
const WHITE = "#fffdf8";

function ears(a: Art, ol: string): string {
  const inner = a.dark ? "#a8706a" : "#ffb3b8";
  const lc = a.pattern === "mike" ? a.accent! : a.pattern === "points" ? a.accent! : a.base;
  const rc = a.pattern === "mike" ? a.accent2! : a.pattern === "points" ? a.accent! : a.pattern === "sabi" ? a.accent! : a.base;
  const sw = `stroke="${ol}" stroke-width="5" stroke-linejoin="round"`;
  if (a.ear === "fold") {
    return `<path d="M46 70Q40 34 70 30Q96 30 98 52Q82 46 70 56Q58 66 46 70Z" fill="${lc}" ${sw}/>
      <path d="M154 70Q160 34 130 30Q104 30 102 52Q118 46 130 56Q142 66 154 70Z" fill="${rc}" ${sw}/>
      <path d="M58 56Q66 42 84 44" stroke="${ol}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>
      <path d="M142 56Q134 42 116 44" stroke="${ol}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`;
  }
  const g = {
    normal: { b1: [44, 76], t: [52, 22], b2: [98, 52], i1: [56, 64], it: [60, 36], i2: [86, 54] },
    big: { b1: [38, 82], t: [42, 12], b2: [100, 52], i1: [50, 70], it: [52, 28], i2: [88, 54] },
    small: { b1: [50, 70], t: [60, 26], b2: [94, 50], i1: [59, 62], it: [63, 38], i2: [84, 53] },
    tuft: { b1: [40, 78], t: [48, 16], b2: [100, 52], i1: [52, 66], it: [56, 32], i2: [88, 54] },
  }[a.ear];
  const L = (p: number[]) => p.join(" ");
  const R = (p: number[]) => `${200 - p[0]} ${p[1]}`;
  const ear = (f: (p: number[]) => string, col: string) => {
    const [tx, ty] = f(g.t).split(" ").map(Number);
    const dir = tx < 100 ? 1 : -1;
    return `<path d="M${f(g.b1)}L${tx - 2 * dir} ${ty + 8}Q${tx} ${ty - 2} ${tx + 8 * dir} ${ty + 6}L${f(g.b2)}Z" fill="${col}" ${sw}/>
      <path d="M${f(g.i1)}L${f(g.it)}L${f(g.i2)}Z" fill="${inner}"/>`;
  };
  let s = ear(L, lc) + ear(R, rc);
  if (a.ear === "tuft") {
    s += `<path d="M48 16 44 0M48 16 54 2M152 16 156 0M152 16 146 2" stroke="${ol}" stroke-width="4" stroke-linecap="round"/>`;
  }
  return s;
}

type CatOpts = { breed: string | undefined; uid: string; traits?: Traits; acc?: Accessory; collar?: string };

export function catSvg(opts: CatOpts): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 200 206" role="img" aria-label="猫のイラスト">${catInner(opts)}</svg>`;
}

/** 別のSVGの中に猫を置く。x,y は左上、size は幅 */
export function catAt(opts: CatOpts, x: number, y: number, size: number, flip = false): string {
  const inner = `<svg x="0" y="0" width="${size}" height="${size * 1.03}" viewBox="0 -6 200 206" overflow="visible">${catInner(opts)}</svg>`;
  return flip
    ? `<g transform="translate(${x + size} ${y}) scale(-1 1)">${inner}</g>`
    : `<g transform="translate(${x} ${y})">${inner}</g>`;
}

function catInner(opts: CatOpts): string {
  const id = (isBreedId(opts.breed) ? opts.breed : "kijitora") as BreedId;
  const a = ART[id];
  const t = opts.traits ?? {};
  const u = opts.uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const ol = a.dark ? "#231816" : OL;
  const tailCol = a.pattern === "points" ? a.accent! : a.pattern === "mike" ? a.accent2! : a.base;
  const paw = a.socks ? WHITE : a.pattern === "points" && !a.socks ? a.accent! : a.base;
  const bodyCol = a.sweater ?? a.base;
  const fy = a.flat ? -3 : 0; // 鼻ぺちゃは鼻口を上へ
  const headRx = id === "british" ? 72 : 68;

  // しっぽ
  const tailW = a.fluffy ? 26 : 18;
  let s = `<path d="M146 186C182 186 190 150 170 128" fill="none" stroke="${ol}" stroke-width="${tailW + 9}" stroke-linecap="round"/>
    <path d="M146 186C182 186 190 150 170 128" fill="none" stroke="${tailCol}" stroke-width="${tailW}" stroke-linecap="round"/>`;
  if (a.stripe && a.pattern !== "sphynx" && a.pattern !== "spots") {
    s += `<path d="M178 158l-12 2M182 142l-12 0" stroke="${a.stripe}" stroke-width="5" stroke-linecap="round"/>`;
  }

  // からだ
  const bodyTop = a.short ? 146 : 136;
  const body = `M56 200C50 ${bodyTop + 26} 70 ${bodyTop} 100 ${bodyTop}C130 ${bodyTop} 150 ${bodyTop + 26} 144 200Z`;
  s += `<clipPath id="b${u}"><path d="${body}"/></clipPath>`;
  s += `<path d="${body}" fill="${bodyCol}" stroke="${ol}" stroke-width="5" stroke-linejoin="round"/>`;
  s += `<g clip-path="url(#b${u})">`;
  if (a.sweater) {
    s += `<path d="M40 170h120M40 182h120" stroke="#fff" stroke-width="5" opacity=".8"/><rect x="40" y="${bodyTop - 4}" width="120" height="16" fill="#5fb2d1"/>`;
  } else {
    if (a.pattern === "mike") s += `<ellipse cx="68" cy="176" rx="24" ry="20" fill="${a.accent}"/><ellipse cx="134" cy="186" rx="22" ry="18" fill="${a.accent2}"/>`;
    if (a.pattern === "sabi") s += `<ellipse cx="72" cy="170" rx="18" ry="14" fill="${a.accent}" opacity=".9"/><ellipse cx="128" cy="184" rx="16" ry="12" fill="${a.accent}" opacity=".9"/>`;
    if (a.pattern === "spots") s += `<g fill="${a.stripe}"><circle cx="70" cy="170" r="5"/><circle cx="132" cy="168" r="5"/><circle cx="80" cy="190" r="4"/><circle cx="124" cy="190" r="4"/></g>`;
    if (a.stripe && (a.pattern === "tabby" || a.pattern === "classic")) s += `<path d="M58 168q10 4 18 1M142 168q-10 4-18 1M56 184q10 3 18 0M144 184q-10 3-18 0" stroke="${a.stripe}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    if (a.bib) s += `<ellipse cx="100" cy="${bodyTop + 30}" rx="24" ry="26" fill="${WHITE}"/>`;
    if (a.fluffy) s += `<path d="M70 ${bodyTop + 2}l8 14 8-12 7 15 7-15 7 15 7-15 8 12 8-14" fill="${a.bib ? WHITE : a.base}" stroke="none"/>`;
  }
  s += `</g>`;
  // 前足
  const py = a.short ? 194 : 192;
  s += `<ellipse cx="82" cy="${py}" rx="${a.short ? 11 : 14}" ry="${a.short ? 8 : 10}" fill="${paw}" stroke="${ol}" stroke-width="4.5"/>
    <ellipse cx="118" cy="${py}" rx="${a.short ? 11 : 14}" ry="${a.short ? 8 : 10}" fill="${paw}" stroke="${ol}" stroke-width="4.5"/>`;

  // 耳
  s += ears(a, ol);

  // 頬のもふもふ（長毛種）
  if (a.fluffy) {
    s += `<path d="M40 96 22 104 38 110 24 122 44 122 34 134 58 128Z" fill="${a.base}" stroke="${ol}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M160 96 178 104 162 110 176 122 156 122 166 134 142 128Z" fill="${a.base}" stroke="${ol}" stroke-width="4.5" stroke-linejoin="round"/>`;
  }

  // 頭
  s += `<clipPath id="h${u}"><ellipse cx="100" cy="94" rx="${headRx}" ry="56"/></clipPath>`;
  s += `<ellipse cx="100" cy="94" rx="${headRx}" ry="56" fill="${a.base}"/>`;
  s += `<g clip-path="url(#h${u})">`;
  if (a.pattern === "mike") s += `<ellipse cx="62" cy="68" rx="34" ry="28" fill="${a.accent}" transform="rotate(-16 62 68)"/><ellipse cx="144" cy="72" rx="28" ry="24" fill="${a.accent2}" transform="rotate(14 144 72)"/>`;
  if (a.pattern === "sabi") s += `<path d="M30 60Q60 40 76 70Q70 96 40 92Z" fill="${a.accent}" opacity=".95"/><path d="M128 52Q160 50 170 86Q150 92 136 76Z" fill="${a.accent}" opacity=".95"/><circle cx="104" cy="56" r="8" fill="${a.accent}"/>`;
  if (a.pattern === "hachiware") s += `<path d="M100 56Q84 100 62 150H138Q116 100 100 56Z" fill="${WHITE}"/>`;
  if (a.pattern === "points") s += `<path d="M100 74C128 74 140 100 136 120C132 140 116 148 100 148C84 148 68 140 64 120C60 100 72 74 100 74Z" fill="${a.accent}" opacity=".9"/>`;
  if (a.stripe && a.pattern === "tabby") {
    s += `<g stroke="${a.stripe}" stroke-width="5.5" stroke-linecap="round" fill="none"><path d="M100 42v16"/><path d="M84 45q2 9 5 14"/><path d="M116 45q-2 9-5 14"/>
      <path d="M36 92q12 3 20-1"/><path d="M36 106q12 1 19-4"/><path d="M164 92q-12 3-20-1"/><path d="M164 106q-12 1-19-4"/></g>`;
  }
  if (a.stripe && a.pattern === "classic") {
    s += `<g stroke="${a.stripe}" stroke-width="6" stroke-linecap="round" fill="none"><path d="M100 40v18M86 42q2 10 5 16M114 42q-2 10-5 16"/>
      <path d="M34 88q14-4 18 6q-2 10-16 10"/><path d="M166 88q-14-4-18 6q2 10 16 10"/></g>`;
  }
  if (a.pattern === "spots") {
    s += `<g fill="none" stroke="${a.stripe}" stroke-width="4"><circle cx="70" cy="62" r="6"/><circle cx="130" cy="62" r="6"/><circle cx="100" cy="50" r="5"/><circle cx="46" cy="96" r="5"/><circle cx="154" cy="96" r="5"/></g>
      <g fill="${a.stripe}"><circle cx="86" cy="70" r="3"/><circle cx="114" cy="70" r="3"/></g>`;
  }
  if (a.pattern === "sphynx") {
    s += `<g stroke="${a.stripe}" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M82 52q18-8 36 0"/><path d="M86 62q14-6 28 0"/></g>`;
  }
  if (a.muzzle) s += `<ellipse cx="100" cy="${120 + fy}" rx="24" ry="16" fill="${WHITE}"/>`;
  // ほっぺ
  s += `<ellipse cx="58" cy="122" rx="12" ry="7" fill="#ff7d93" opacity="${t.blush ? 0.75 : 0.35}"/><ellipse cx="142" cy="122" rx="12" ry="7" fill="#ff7d93" opacity="${t.blush ? 0.75 : 0.35}"/>`;
  if (t.blush) s += `<path d="M52 118l-3 6M58 118l-3 6M64 118l-3 6M148 118l-3 6M142 118l-3 6M136 118l-3 6" stroke="#e85d75" stroke-width="2" stroke-linecap="round"/>`;
  s += `</g>`;
  s += `<ellipse cx="100" cy="94" rx="${headRx}" ry="56" fill="none" stroke="${ol}" stroke-width="5"/>`;

  // 目
  const eye = (cx: number, color: string, right: boolean) => {
    const cy = 102;
    if (t.wink && right) {
      const c = a.dark ? color : ol;
      return `<path d="M${cx - 11} ${cy + 3}Q${cx} ${cy - 10} ${cx + 11} ${cy + 3}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    }
    const r = t.blush ? 14.5 : 13;
    if (t.crown) {
      return `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 0 ${cx + r} ${cy}Z" fill="${color}" stroke="${ol}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M${cx - 6} ${cy}A6 7 0 0 0 ${cx + 6} ${cy}Z" fill="#2a1d18"/><circle cx="${cx - 4}" cy="${cy + 4}" r="2.4" fill="#fff"/>
        <path d="M${cx - r - 3} ${cy}H${cx + r + 3}" stroke="${ol}" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    let e = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${ol}" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy + 1.5}" r="${r - 4.5}" fill="#2a1d18"/>
      <circle cx="${cx - 4.5}" cy="${cy - 4.5}" r="${t.blush ? 5.2 : 4.4}" fill="#fff"/>
      <circle cx="${cx + 4.5}" cy="${cy + 5}" r="2.2" fill="#fff"/>`;
    if (t.blush) e += `<path d="M${cx + 7} ${cy - 9}l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6Z" fill="#fff"/>`;
    return e;
  };
  s += eye(74, a.eye, false) + eye(126, a.eye2 ?? a.eye, true);

  // 鼻・口
  const ny = 115 + fy;
  s += `<path d="M95 ${ny}h10l-5 6Z" fill="#ff8fa3" stroke="${ol}" stroke-width="2.6" stroke-linejoin="round"/>`;
  if (t.open) {
    s += `<path d="M86 ${ny + 9}q14-4 28 0q-1 18-14 18q-13 0-14-18Z" fill="#c2414f" stroke="${ol}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M92 ${ny + 21}q8-7 16 0q-8 6-16 0Z" fill="#ff9aa8"/>`;
  } else {
    s += `<path d="M100 ${ny + 6}q-5 7-11 2M100 ${ny + 6}q5 7 11 2" fill="none" stroke="${ol}" stroke-width="3.2" stroke-linecap="round"/>`;
  }
  if (!a.noWhisker) {
    const wc = a.dark ? "#f3ece4" : ol;
    s += `<g stroke="${wc}" stroke-width="2.6" stroke-linecap="round" opacity=".8"><path d="M50 112 30 108M50 120 30 122M150 112 170 108M150 120 170 122"/></g>`;
  }

  // 首輪
  if (!a.sweater && opts.acc !== "bowtie" && opts.acc !== "tie") {
    const col = opts.collar ?? "#ff6f61";
    s += `<path d="M72 146q28 12 56 0" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="100" cy="155" r="6" fill="#ffd34d" stroke="${ol}" stroke-width="2.6"/>`;
  }

  // 小物
  s += accessory(opts.acc ?? "none", ol);
  if (t.crown) {
    s += `<g transform="rotate(-8 100 34)"><path d="M76 46 72 18 89 32 100 12 111 32 128 18 124 46Z" fill="#ffd34d" stroke="${ol}" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="100" cy="38" r="4" fill="#ff6f61" stroke="${ol}" stroke-width="1.8"/><circle cx="85" cy="40" r="2.6" fill="#62d2a2"/><circle cx="115" cy="40" r="2.6" fill="#62d2a2"/></g>`;
  }

  return s;
}

function accessory(acc: Accessory, ol: string): string {
  switch (acc) {
    case "bow":
      return `<g transform="translate(140 50) rotate(18)"><path d="M0 0-20-12-20 12Z" fill="#ff7eb6" stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"/><path d="M0 0 20-12 20 12Z" fill="#ff7eb6" stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"/><circle r="6" fill="#ffb3d4" stroke="${ol}" stroke-width="3"/></g>`;
    case "bowtie":
      return `<g transform="translate(100 150)"><path d="M0 0-16-9-16 9Z" fill="#3b2a24" stroke="${ol}" stroke-width="3" stroke-linejoin="round"/><path d="M0 0 16-9 16 9Z" fill="#3b2a24" stroke="${ol}" stroke-width="3" stroke-linejoin="round"/><circle r="4.5" fill="#555"/></g>`;
    case "tie":
      return `<path d="M94 146h12l-3 8 7 26-10 10-10-10 7-26Z" fill="#4a7bd6" stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"/>`;
    case "beret":
      return `<g transform="rotate(-12 100 40)"><ellipse cx="100" cy="42" rx="44" ry="14" fill="#e94b5a" stroke="${ol}" stroke-width="4"/><path d="M98 28q2-8 6-8" stroke="${ol}" stroke-width="4" stroke-linecap="round"/></g>`;
    case "bonnet":
      return `<path d="M36 92Q36 30 100 30Q164 30 164 92Q150 56 100 54Q50 56 36 92Z" fill="#ffd7e6" stroke="${ol}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M44 84Q48 50 100 46Q152 50 156 84" fill="none" stroke="#ff9ec4" stroke-width="5" stroke-dasharray="2 8" stroke-linecap="round"/>
        <path d="M40 96q-6 22 10 34M160 96q6 22-10 34" fill="none" stroke="#ff9ec4" stroke-width="5" stroke-linecap="round"/>`;
    case "sunglasses":
      return `<g stroke="${ol}" stroke-width="3.5"><path d="M56 92h34l-3 18q-14 6-28 0Z" fill="#2a1d18"/><path d="M110 92h34l-3 18q-14 6-28 0Z" fill="#2a1d18"/><path d="M90 96h20" fill="none"/></g>
        <path d="M62 98l8-4M116 98l8-4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    case "headband":
      return `<path d="M34 72Q100 44 166 72" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M34 72Q100 44 166 72" fill="none" stroke="${ol}" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 0"/>
        <circle cx="100" cy="56" r="7" fill="#e94b5a"/>`;
    default:
      return "";
  }
}
