// 猫イラストをSVG文字列として生成する（ゆるかわ・もちもち系）。
// 入力は固定の選択肢（猫種ID・表情・小物）のみ。ユーザーの入力文字列がSVGに入ることはない。

export type BreedId =
  | "kijitora" | "chatora" | "sabatora" | "kijishiro" | "chashiro" | "sabashiro" | "mike" | "pastelmike"
  | "kuro" | "shiro" | "shirokuro" | "hachiware" | "sabi" | "cream" | "grey" | "longhair"
  | "scottish" | "munchkin" | "minuet" | "amesho" | "russian" | "ragdoll" | "british"
  | "norwegian" | "mainecoon" | "siberian" | "bengal" | "siamese" | "persian" | "exotic"
  | "himalayan" | "abyssinian" | "somali" | "turkish" | "bombay" | "sphynx" | "selkirk";

type Ear = "normal" | "big" | "small" | "fold" | "tuft";
type Pattern = "tabby" | "classic" | "spots" | "points" | "mike" | "sabi" | "hachiware" | "cow" | "ticked" | "solid" | "sphynx";

export type Art = {
  base: string;
  stripe?: string;
  accent?: string;
  accent2?: string;
  pattern: Pattern;
  ear: Ear;
  eye: string;
  eye2?: string;
  muzzle?: boolean;
  bib?: boolean;
  socks?: boolean;
  /** 白い部分が多い（キジ白・茶白） */
  bicolor?: boolean;
  fluffy?: boolean;
  flat?: boolean;
  short?: boolean;
  curly?: boolean;
  dark?: boolean;
  noWhisker?: boolean;
  sweater?: string;
  /** 背景に使う淡い色 */
  tint: string;
};

const W = "#fffdf9";

export const ART: Record<BreedId, Art> = {
  kijitora: { base: "#c49465", stripe: "#7a5538", pattern: "tabby", ear: "normal", eye: "#e8b33c", muzzle: true, tint: "#f7ead9" },
  chatora: { base: "#f6b064", stripe: "#e08a3c", pattern: "tabby", ear: "normal", eye: "#e8b33c", muzzle: true, tint: "#fdebd6" },
  sabatora: { base: "#a9b4bf", stripe: "#6a7480", pattern: "tabby", ear: "normal", eye: "#b8c94a", tint: "#e8edf2" },
  kijishiro: { base: "#c49465", stripe: "#7a5538", pattern: "tabby", ear: "normal", eye: "#e8b33c", muzzle: true, bib: true, socks: true, bicolor: true, tint: "#f5ecdf" },
  chashiro: { base: "#f6b064", stripe: "#e08a3c", pattern: "tabby", ear: "normal", eye: "#e8b33c", muzzle: true, bib: true, socks: true, bicolor: true, tint: "#fdeedd" },
  sabashiro: { base: "#a9b4bf", stripe: "#6a7480", pattern: "tabby", ear: "normal", eye: "#e8c24a", muzzle: true, bib: true, socks: true, tint: "#e6eef5" },
  mike: { base: W, accent: "#f6b064", accent2: "#4a3e3a", pattern: "mike", ear: "normal", eye: "#e8b33c", tint: "#fdf0e0" },
  pastelmike: { base: W, accent: "#f8d6ad", accent2: "#a7aebd", pattern: "mike", ear: "normal", eye: "#e8b33c", tint: "#f6eef0" },
  kuro: { base: "#3f3633", pattern: "solid", ear: "normal", eye: "#f2cd3c", dark: true, tint: "#ece6f3" },
  shiro: { base: W, pattern: "solid", ear: "normal", eye: "#7cc7f2", eye2: "#f2c94a", tint: "#e9f4fb" },
  shirokuro: { base: W, accent2: "#3f3633", pattern: "cow", ear: "normal", eye: "#e8b33c", tint: "#eef0f3" },
  hachiware: { base: "#3f3633", pattern: "hachiware", ear: "normal", eye: "#f2c94a", muzzle: true, bib: true, socks: true, dark: true, tint: "#efeaf5" },
  sabi: { base: "#4a3a33", accent: "#d68a4a", pattern: "sabi", ear: "normal", eye: "#e8b33c", dark: true, tint: "#f6e8dc" },
  cream: { base: "#f8e2bf", stripe: "#ecc690", pattern: "tabby", ear: "normal", eye: "#e8a83a", muzzle: true, tint: "#fdf3e2" },
  grey: { base: "#a3acb6", pattern: "solid", ear: "normal", eye: "#e8b33c", tint: "#eceff3" },
  longhair: { base: "#c49465", stripe: "#7a5538", pattern: "tabby", ear: "tuft", eye: "#b8c94a", muzzle: true, bib: true, fluffy: true, tint: "#f4eadc" },
  scottish: { base: "#f5e0c0", stripe: "#dfb98a", pattern: "tabby", ear: "fold", eye: "#e8a23a", muzzle: true, tint: "#fdf2e2" },
  munchkin: { base: "#efd1a6", stripe: "#d6a874", pattern: "tabby", ear: "normal", eye: "#8cc66a", muzzle: true, bib: true, socks: true, short: true, tint: "#fcf1de" },
  minuet: { base: "#f6e8d4", stripe: "#e6cfae", pattern: "tabby", ear: "small", eye: "#e8a23a", muzzle: true, fluffy: true, short: true, flat: true, tint: "#fbf3ea" },
  amesho: { base: "#d3d8dd", stripe: "#4e5560", pattern: "classic", ear: "normal", eye: "#b8c94a", tint: "#edf0f3" },
  russian: { base: "#97a4b6", pattern: "solid", ear: "big", eye: "#6fce78", tint: "#e7ecf3" },
  ragdoll: { base: "#fbf5ec", accent: "#9a7d68", pattern: "points", ear: "normal", eye: "#5ab2f2", bib: true, socks: true, fluffy: true, tint: "#eaf3fb" },
  british: { base: "#97a4b6", pattern: "solid", ear: "small", eye: "#f0a43a", tint: "#e9edf3" },
  norwegian: { base: "#b4906a", stripe: "#65492f", pattern: "tabby", ear: "tuft", eye: "#d8b43a", muzzle: true, bib: true, fluffy: true, tint: "#efe7da" },
  mainecoon: { base: "#d39459", stripe: "#94592c", pattern: "tabby", ear: "tuft", eye: "#e8b33c", muzzle: true, bib: true, fluffy: true, tint: "#f8e6d2" },
  siberian: { base: "#b9a58a", stripe: "#6e5c47", pattern: "tabby", ear: "tuft", eye: "#9fcb5c", muzzle: true, bib: true, fluffy: true, tint: "#efebe2" },
  bengal: { base: "#efbd6c", stripe: "#6b4528", pattern: "spots", ear: "big", eye: "#8fce5e", muzzle: true, tint: "#fbecd0" },
  siamese: { base: "#f8eedd", accent: "#5a463b", pattern: "points", ear: "big", eye: "#4aa3f0", tint: "#e8f1fb" },
  persian: { base: "#fcf5ea", pattern: "solid", ear: "small", eye: "#f0a43a", fluffy: true, flat: true, tint: "#fbf2e8" },
  exotic: { base: "#ecc28a", stripe: "#cd9552", pattern: "tabby", ear: "small", eye: "#ec8f2a", flat: true, tint: "#fbeedc" },
  himalayan: { base: "#fbf5ec", accent: "#7a5a48", pattern: "points", ear: "small", eye: "#5ab2f2", fluffy: true, flat: true, tint: "#eef3fa" },
  abyssinian: { base: "#cf9257", stripe: "#9a6436", pattern: "ticked", ear: "big", eye: "#d9b53a", muzzle: true, tint: "#f8e8d6" },
  somali: { base: "#cf8a4f", stripe: "#94582c", pattern: "ticked", ear: "tuft", eye: "#9fcb5c", muzzle: true, fluffy: true, tint: "#f8e5d2" },
  turkish: { base: W, pattern: "solid", ear: "big", eye: "#7cc7f2", eye2: "#f2c94a", fluffy: true, tint: "#eef6fb" },
  bombay: { base: "#2f2827", pattern: "solid", ear: "normal", eye: "#f09a2a", dark: true, tint: "#f3ebe3" },
  sphynx: { base: "#f6d2c2", stripe: "#e2b2a0", pattern: "sphynx", ear: "big", eye: "#8fce5e", noWhisker: true, sweater: "#a8d8ea", tint: "#fde9e1" },
  selkirk: { base: "#ecd8bc", stripe: "#d0b28b", pattern: "solid", ear: "normal", eye: "#e8a23a", curly: true, muzzle: true, tint: "#fbf1e4" },
};

export const BREED_IDS = Object.keys(ART) as BreedId[];

export function isBreedId(v: unknown): v is BreedId {
  return typeof v === "string" && v in ART;
}

export type Face = "normal" | "smug" | "happy" | "sparkle" | "sleepy" | "wink" | "grin" | "heart" | "pout";
export type Accessory = "none" | "crown" | "bow" | "starclip" | "flowers" | "scarf" | "bonnet" | "tie" | "nightcap" | "glasses" | "beret" | "mask";

/** 旧API互換: 指標から表情を決める */
export type Traits = { crown?: boolean; blush?: boolean; wink?: boolean; open?: boolean };

export function traitsFromAxes(axes: { dom: number; amae: number; mood: number; demand: number }): Traits {
  return { crown: axes.dom >= 60, blush: axes.amae >= 60, wink: axes.mood >= 60, open: axes.demand >= 60 };
}

function faceFromTraits(t: Traits): Face {
  if (t.wink) return "wink";
  if (t.open) return "grin";
  if (t.crown) return "smug";
  if (t.blush) return "sparkle";
  return "normal";
}

export type CatOpts = {
  breed: string | undefined;
  uid: string;
  face?: Face;
  acc?: Accessory;
  blush?: boolean;
  /** 旧API。face/acc が無いときに使う */
  traits?: Traits;
};

export function catSvg(opts: CatOpts): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 200 210" role="img" aria-label="猫のイラスト">${catInner(opts)}</svg>`;
}

function ears(a: Art, ol: string): string {
  const inner = a.dark ? "#9a6a66" : "#ffc2c7";
  const lc = a.pattern === "mike" || a.pattern === "points" ? a.accent! : a.pattern === "cow" ? a.accent2! : a.base;
  const rc = a.pattern === "mike" ? a.accent2! : a.pattern === "points" ? a.accent! : a.pattern === "sabi" ? a.accent! : a.base;
  const sw = `stroke="${ol}" stroke-width="3.6" stroke-linejoin="round"`;
  if (a.ear === "fold") {
    return `<path d="M48 68Q44 38 72 36Q94 36 96 54Q80 48 68 58Q56 66 48 68Z" fill="${lc}" ${sw}/>
      <path d="M152 68Q156 38 128 36Q106 36 104 54Q120 48 132 58Q144 66 152 68Z" fill="${rc}" ${sw}/>`;
  }
  const g = {
    normal: [[46, 76], [56, 26], [96, 52]],
    big: [[40, 82], [46, 16], [98, 52]],
    small: [[52, 70], [62, 34], [94, 52]],
    tuft: [[42, 78], [52, 20], [98, 52]],
  }[a.ear];
  const ear = (m: number, col: string) => {
    const P = (p: number[]) => [m ? 200 - p[0] : p[0], p[1]];
    const [b1, t, b2] = g.map(P);
    const d = m ? -1 : 1;
    const outer = `M${b1[0]} ${b1[1]}Q${t[0] - 4 * d} ${t[1] + 4} ${t[0]} ${t[1]}Q${t[0] + 6 * d} ${t[1] - 2} ${b2[0]} ${b2[1]}Z`;
    const ix = (p: number[], q: number[], k: number) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    const c = [(b1[0] + t[0] + b2[0]) / 3, (b1[1] + t[1] + b2[1]) / 3 + 6];
    const i1 = ix(b1, c, 0.35), it = ix(t, c, 0.3), i2 = ix(b2, c, 0.35);
    return `<path d="${outer}" fill="${col}" ${sw}/><path d="M${i1[0]} ${i1[1]}Q${it[0]} ${it[1] + 2} ${it[0]} ${it[1]}Q${it[0] + 2 * d} ${it[1]} ${i2[0]} ${i2[1]}Z" fill="${inner}"/>`;
  };
  let s = ear(0, lc) + ear(1, rc);
  if (a.ear === "tuft") s += `<path d="M52 20 48 6M52 20 58 8M148 20 152 6M148 20 142 8" stroke="${ol}" stroke-width="3" stroke-linecap="round"/>`;
  return s;
}

/** 色を明るく(+)・暗く(-)する */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 先細りの縞（根元 bx,by から先端 tx,ty へ） */
function wedge(bx: number, by: number, tx: number, ty: number, w: number, fill: string): string {
  const dx = tx - bx, dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w, ny = (dx / len) * w;
  const mx = bx + dx * 0.55, my = by + dy * 0.55;
  return `<path d="M${bx + nx} ${by + ny}Q${mx + nx * 0.7} ${my + ny * 0.7} ${tx} ${ty}Q${mx - nx * 0.7} ${my - ny * 0.7} ${bx - nx} ${by - ny}Z" fill="${fill}"/>`;
}

function catInner(o: CatOpts): string {
  const id = (isBreedId(o.breed) ? o.breed : "kijitora") as BreedId;
  const a = ART[id];
  const face: Face = o.face ?? faceFromTraits(o.traits ?? {});
  const blush = o.blush ?? (o.traits?.blush || face === "heart" || face === "pout" || face === "sparkle");
  const acc: Accessory = o.acc ?? (o.traits?.crown ? "crown" : "none");
  const u = o.uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const ol = a.dark ? "#2a201e" : "#6b5045";
  const sw = (w = 3.2) => `stroke="${ol}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const base = a.base;
  const hi = shade(base, a.dark ? 0.16 : 0.32);
  const lo = shade(base, a.dark ? -0.25 : -0.12);
  const point = a.pattern === "points" ? a.accent! : null;
  const tailCol = point ?? (a.pattern === "mike" || a.pattern === "cow" ? a.accent2! : base);
  const legCol = a.sweater ? a.sweater : base;
  const pawCol = a.socks || a.bicolor ? W : point ?? base;
  const fy = a.flat ? -3 : 0;
  const stripe = a.stripe;

  let s = `<defs>
    <radialGradient id="hg${u}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${hi}"/><stop offset=".6" stop-color="${base}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
    <linearGradient id="bg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.sweater ?? hi}"/><stop offset="1" stop-color="${a.sweater ? shade(a.sweater, -0.1) : lo}"/></linearGradient>
    <radialGradient id="bl${u}"><stop offset="0" stop-color="#ff8fa3" stop-opacity="${blush ? 0.75 : 0.45}"/><stop offset="1" stop-color="#ff8fa3" stop-opacity="0"/></radialGradient>
    ${point ? `<filter id="pt${u}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4.5"/></filter>` : ""}
  </defs>`;

  // 影
  s += `<ellipse cx="100" cy="199" rx="60" ry="6" fill="#3b2a24" opacity=".09"/>`;

  // しっぽ（右から立ち上がってくるん）
  const tw = a.fluffy ? 20 : 13;
  const tail = "M138 190C170 194 184 172 176 150C172 138 160 138 162 150";
  s += `<path d="${tail}" fill="none" stroke="${ol}" stroke-width="${tw + 6.4}" stroke-linecap="round"/><path d="${tail}" fill="none" stroke="${tailCol}" stroke-width="${tw}" stroke-linecap="round"/>`;
  if (stripe && (a.pattern === "tabby" || a.pattern === "classic")) s += `<path d="M172 180l10 3M178 164l10-1M176 150l9-5" stroke="${stripe}" stroke-width="4" stroke-linecap="round"/>`;
  if (a.fluffy) s += `<path d="M180 168l7 2M182 156l7-2M178 176l6 4" stroke="${ol}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;

  // 後ろ足（腰）
  const hy = a.short ? 186 : 182;
  for (const x of [64, 136]) s += `<ellipse cx="${x}" cy="${hy}" rx="24" ry="${a.short ? 15 : 18}" fill="url(#bg${u})" ${sw()}/>`;
  if (a.pattern === "mike") s += `<ellipse cx="64" cy="${hy}" rx="18" ry="12" fill="${a.accent}"/>`;

  // 胴体
  const top = a.short ? 148 : 140;
  const torso = `M68 197C60 172 72 ${top + 2} 100 ${top}C128 ${top + 2} 140 172 132 197Z`;
  s += `<clipPath id="tc${u}"><path d="${torso}"/></clipPath><path d="${torso}" fill="url(#bg${u})" ${sw()}/><g clip-path="url(#tc${u})">`;
  if (a.sweater) {
    s += `<path d="M60 172h80M60 184h80" stroke="#fff" stroke-width="4" opacity=".85"/><rect x="60" y="${top - 2}" width="80" height="11" fill="${shade(a.sweater, -0.15)}"/>`;
  } else {
    if (a.pattern === "mike") s += `<ellipse cx="128" cy="176" rx="16" ry="14" fill="${a.accent2}"/>`;
    if (a.pattern === "cow") s += `<ellipse cx="78" cy="170" rx="14" ry="12" fill="${a.accent2}"/>`;
    if (a.pattern === "sabi") s += `<ellipse cx="80" cy="168" rx="13" ry="10" fill="${a.accent}" opacity=".9"/><ellipse cx="122" cy="182" rx="11" ry="9" fill="${a.accent}" opacity=".9"/>`;
    if (a.pattern === "spots") s += `<g><circle cx="76" cy="168" r="5" fill="${stripe}"/><circle cx="76" cy="168" r="2.2" fill="${hi}"/><circle cx="124" cy="166" r="5" fill="${stripe}"/><circle cx="124" cy="166" r="2.2" fill="${hi}"/></g>`;
    if (stripe && (a.pattern === "tabby" || a.pattern === "classic")) s += wedge(68, 160, 82, 164, 3.2, stripe) + wedge(132, 160, 118, 164, 3.2, stripe) + wedge(66, 176, 80, 178, 3.2, stripe) + wedge(134, 176, 120, 178, 3.2, stripe);
    if (a.curly) s += `<g fill="none" stroke="${shade(base, -0.18)}" stroke-width="2.6" stroke-linecap="round"><path d="M74 168q4-6 8 0q4 6 8 0"/><path d="M110 172q4-6 8 0q4 6 8 0"/></g>`;
    if (a.bib || a.bicolor) s += `<ellipse cx="100" cy="${top + 26}" rx="${a.bicolor ? 26 : 19}" ry="${a.bicolor ? 32 : 26}" fill="${W}"/>`;
    if (point) s += `<rect x="60" y="182" width="80" height="20" fill="${point}" opacity=".35"/>`;
  }
  // あごの下の影
  s += `<ellipse cx="100" cy="${top + 4}" rx="34" ry="9" fill="#3b2a24" opacity=".10"/></g>`;
  // 胸のもふ毛
  if (a.fluffy || a.bib) {
    const fc = a.bib ? W : hi;
    s += `<path d="M80 ${top + 6}l5 11 5-8 5 12 5-12 5 12 5-8 5 11" fill="${fc}" stroke="none"/>`;
  }

  // 前足（体と一体の丸い足先＋足のあいだの線）
  s += `<path d="M100 ${top + 30}Q101 180 100 191" fill="none" stroke="${ol}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
  if (a.socks || a.bicolor || point) {
    for (const x of [88, 112]) s += `<path d="M${x - 11} 194Q${x - 11} 181 ${x} 180Q${x + 11} 181 ${x + 11} 194Z" fill="${pawCol}" opacity="${point ? 0.85 : 1}"/>`;
  }
  for (const x of [88, 112]) {
    s += `<path d="M${x - 12.5} 195Q${x - 12.5} 186 ${x} 186Q${x + 12.5} 186 ${x + 12.5} 195Q${x} 200 ${x - 12.5} 195Z" fill="${pawCol}" ${sw(3)}/><path d="M${x - 4} 190.5v4M${x + 4} 190.5v4" stroke="${ol}" stroke-width="1.7" stroke-linecap="round" opacity=".55"/>`;
  }

  // 耳
  s += ears(a, ol);
  if (a.ear !== "fold") s += `<g stroke="${a.dark ? "#d9c8c0" : "#fff"}" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M62 64l6 -10M68 66l4-9M138 64l-6-10M132 66l-4-9"/></g>`;

  // 頬のもふもふ（長毛種）
  if (a.fluffy) {
    s += `<path d="M42 96 26 104 40 110 28 122 46 121 38 134 60 128Z" fill="${base}" ${sw(3)}/><path d="M158 96 174 104 160 110 172 122 154 121 162 134 140 128Z" fill="${base}" ${sw(3)}/>`;
  }

  // 頭（ほっぺに小さなもふ毛）
  const head = "M100 42C140 42 166 66 166 96C166 108 162 118 156 125L163 131L151 133C141 142 122 146 100 146C78 146 59 142 49 133L37 131L44 125C38 118 34 108 34 96C34 66 60 42 100 42Z";
  s += `<clipPath id="h${u}"><path d="${head}"/></clipPath><path d="${head}" fill="url(#hg${u})"/><g clip-path="url(#h${u})">`;
  if (a.pattern === "mike") s += `<path d="M30 40Q70 30 86 62Q84 86 54 96Q30 90 30 40Z" fill="${a.accent}"/><path d="M118 52Q152 40 172 66Q172 92 146 96Q124 84 118 52Z" fill="${a.accent2}"/>`;
  if (a.pattern === "cow") s += `<path d="M112 50Q154 44 172 76Q170 102 140 102Q116 86 112 50Z" fill="${a.accent2}"/><ellipse cx="70" cy="52" rx="12" ry="9" fill="${a.accent2}"/>`;
  if (a.pattern === "sabi") s += `<path d="M28 58Q60 40 78 70Q72 96 40 92Z" fill="${a.accent}" opacity=".95"/><path d="M126 50Q160 48 172 84Q150 92 134 76Z" fill="${a.accent}" opacity=".95"/><circle cx="104" cy="54" r="7" fill="${a.accent}"/>`;
  if (a.pattern === "hachiware") s += `<path d="M100 52Q90 82 70 104Q58 124 66 150H134Q142 124 130 104Q110 82 100 52Z" fill="${W}"/>`;
  if (point) s += `<path d="M100 96C120 96 134 112 132 128C130 142 116 148 100 148C84 148 70 142 68 128C66 112 80 96 100 96Z" fill="${point}" filter="url(#pt${u})"/>`;
  if (stripe && a.pattern === "tabby") {
    s += wedge(100, 44, 100, 62, 3.6, stripe) + wedge(88, 46, 92, 62, 3, stripe) + wedge(112, 46, 108, 62, 3, stripe);
    s += wedge(34, 92, 56, 96, 3.2, stripe) + wedge(35, 106, 55, 104, 3, stripe) + wedge(166, 92, 144, 96, 3.2, stripe) + wedge(165, 106, 145, 104, 3, stripe);
  }
  if (stripe && a.pattern === "classic") {
    s += wedge(100, 42, 100, 62, 4, stripe) + wedge(86, 44, 90, 62, 3.4, stripe) + wedge(114, 44, 110, 62, 3.4, stripe);
    s += `<g fill="none" stroke="${stripe}" stroke-width="4.6" stroke-linecap="round"><path d="M36 88q14-5 18 5q-2 10-15 10"/><path d="M164 88q-14-5-18 5q2 10 15 10"/></g>`;
  }
  if (a.pattern === "ticked") s += `<g opacity=".7">${wedge(100, 46, 100, 60, 3, stripe!)}${wedge(90, 48, 93, 60, 2.4, stripe!)}${wedge(110, 48, 107, 60, 2.4, stripe!)}</g><path d="M60 112q8 2 14-1M140 112q-8 2-14-1" stroke="${W}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
  if (a.pattern === "spots") {
    for (const [x, y, r] of [[72, 62, 5.5], [128, 62, 5.5], [100, 52, 4.5], [46, 94, 4.5], [154, 94, 4.5], [86, 72, 3], [114, 72, 3]]) {
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${stripe}"/>${r > 4 ? `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${hi}"/>` : ""}`;
    }
  }
  if (a.pattern === "sphynx") s += `<g stroke="${stripe}" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M82 54q18-8 36 0"/><path d="M86 63q14-6 28 0"/><path d="M90 71q10-4 20 0"/></g>`;
  if (a.curly) s += `<g fill="none" stroke="${shade(base, -0.18)}" stroke-width="2.6" stroke-linecap="round"><path d="M70 56q4-6 8 0q4 6 8 0"/><path d="M114 56q4-6 8 0q4 6 8 0"/><path d="M40 92q3-5 6 0q3 5 6 0"/><path d="M148 92q3-5 6 0q3 5 6 0"/></g>`;
  if (a.muzzle || a.bicolor) s += `<ellipse cx="100" cy="${125 + fy}" rx="${a.bicolor ? 34 : 24}" ry="${a.bicolor ? 24 : 17}" fill="${W}"/>`;
  // ほっぺ
  s += `<ellipse cx="58" cy="121" rx="15" ry="10" fill="url(#bl${u})"/><ellipse cx="142" cy="121" rx="15" ry="10" fill="url(#bl${u})"/>`;
  if (blush) s += `<path d="M53 118l-2 5M58 118l-2 5M63 118l-2 5M147 118l-2 5M142 118l-2 5M137 118l-2 5" stroke="#f27a8c" stroke-width="1.5" stroke-linecap="round"/>`;
  // おでこのツヤ
  s += `<ellipse cx="80" cy="60" rx="18" ry="7" fill="#fff" opacity="${a.dark ? 0.1 : 0.22}" transform="rotate(-18 80 60)"/>`;
  s += `</g><path d="${head}" fill="none" ${sw()}/>`;

  // 目
  const ec = a.dark ? "#f6efe6" : ol;
  const eye = (cx: number, col: string, right: boolean): string => {
    const cy = 104;
    const arc = (up: boolean) => `<path d="M${cx - 8.5} ${cy + (up ? 2 : -1)}Q${cx} ${cy + (up ? -8 : 6)} ${cx + 8.5} ${cy + (up ? 2 : -1)}" fill="none" stroke="${a.dark ? col : ol}" stroke-width="3.4" stroke-linecap="round"/>`;
    if (face === "happy" || (face === "wink" && right)) return arc(true);
    if (face === "sleepy") return arc(false) + `<path d="M${cx - 9} ${cy + 1}l-3 2M${cx + 9} ${cy + 1}l3 2" stroke="${ol}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`;
    if (face === "heart") return `<path d="M${cx} ${cy + 7.5}l-8.4-8a4.8 4.8 0 0 1 8.4-5a4.8 4.8 0 0 1 8.4 5Z" fill="#ff6b8a" stroke="#d94c6c" stroke-width="1.4"/><circle cx="${cx - 3.6}" cy="${cy - 3}" r="1.6" fill="#fff"/>`;
    if (face === "pout" && right) return `<path d="M${cx - 8} ${cy - 1}h16" stroke="${ec}" stroke-width="3.2" stroke-linecap="round"/>`;
    const big = face === "sparkle";
    const rx = big ? 10.5 : 9.4;
    const ry = big ? 12 : 10.8;
    const iris = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}"/><ellipse cx="${cx}" cy="${cy + ry * 0.45}" rx="${rx * 0.8}" ry="${ry * 0.45}" fill="#fff" opacity=".22"/>`;
    const pupil = `<ellipse cx="${cx}" cy="${cy + 0.6}" rx="${rx - 3.4}" ry="${ry - 2.4}" fill="#24191a"/>`;
    const out = right ? 1 : -1;
    const lid = `<path d="M${cx - rx} ${cy - 1}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy - 1}" fill="none" stroke="${ec}" stroke-width="2.3" stroke-linecap="round"/><path d="M${cx + out * rx * 0.92} ${cy - ry * 0.42}q${out * 3.4} -1.2 ${out * 5} -4" fill="none" stroke="${ec}" stroke-width="2" stroke-linecap="round"/>`;
    if (face === "smug") {
      return `<clipPath id="e${u}${right ? 1 : 0}"><rect x="${cx - 14}" y="${cy}" width="28" height="16"/></clipPath><g clip-path="url(#e${u}${right ? 1 : 0})">${iris}${pupil}</g>
        <path d="M${cx - rx - 2} ${cy}H${cx + rx + 2}" stroke="${ec}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${cx - 3}" cy="${cy + 4}" r="1.8" fill="#fff"/>`;
    }
    let e = iris + pupil + lid + `<circle cx="${cx - 3.2}" cy="${cy - 4}" r="${big ? 3.8 : 3.2}" fill="#fff"/><circle cx="${cx + 3}" cy="${cy + 3.6}" r="1.5" fill="#fff"/>`;
    if (big) e += `<path d="M${cx + 4.4} ${cy - 7.4}l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2Z" fill="#fff"/>`;
    return e;
  };
  s += eye(76, a.eye, false) + eye(124, a.eye2 ?? a.eye, true);

  // ひげ袋・鼻・口
  const ny = 115 + fy;
  const pad = point ? shade(point, 0.18) : a.muzzle || a.bicolor || a.pattern === "hachiware" ? W : hi;
  s += `<ellipse cx="93" cy="${ny + 9}" rx="7.5" ry="5.6" fill="${pad}"/><ellipse cx="107" cy="${ny + 9}" rx="7.5" ry="5.6" fill="${pad}"/>`;
  s += `<g fill="${ol}" opacity=".35"><circle cx="90" cy="${ny + 8}" r=".9"/><circle cx="93" cy="${ny + 11}" r=".9"/><circle cx="110" cy="${ny + 8}" r=".9"/><circle cx="107" cy="${ny + 11}" r=".9"/></g>`;
  s += `<path d="M95.2 ${ny}Q100 ${ny - 2} 104.8 ${ny}Q103 ${ny + 5} 100 ${ny + 6}Q97 ${ny + 5} 95.2 ${ny}Z" fill="#f59aa6" ${sw(1.8)}/><ellipse cx="98.4" cy="${ny + 1.2}" rx="1.6" ry="1" fill="#fff" opacity=".8"/>`;
  if (face === "grin" || face === "sparkle") {
    s += `<path d="M93 ${ny + 8}q7 11 14 0Z" fill="#e8707f" ${sw(2.2)}/><path d="M96.5 ${ny + 13}q3.5-3 7 0q-3.5 2.5-7 0Z" fill="#ffb0bc"/>`;
  } else if (face === "pout") {
    s += `<path d="M100 ${ny + 6}v3M95 ${ny + 12}q5-4 10 0" fill="none" ${sw(2.4)}/>`;
  } else {
    s += `<path d="M100 ${ny + 6}v3M100 ${ny + 9}q-3.8 4.4-7.6 1M100 ${ny + 9}q3.8 4.4 7.6 1" fill="none" ${sw(2.4)}/>`;
  }
  if (!a.noWhisker) {
    const wc = a.dark ? "#efe6dc" : ol;
    s += `<g fill="none" stroke="${wc}" stroke-width="1.5" stroke-linecap="round" opacity=".55"><path d="M84 ${ny + 8}Q62 ${ny + 2} 40 ${ny - 2}"/><path d="M84 ${ny + 11}Q62 ${ny + 10} 38 ${ny + 12}"/><path d="M116 ${ny + 8}Q138 ${ny + 2} 160 ${ny - 2}"/><path d="M116 ${ny + 11}Q138 ${ny + 10} 162 ${ny + 12}"/></g>`;
  }

  s += accessory(acc, ol);
  return s;
}

function accessory(acc: Accessory, ol: string): string {
  const sw = (w = 3) => `stroke="${ol}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  switch (acc) {
    case "crown":
      return `<g transform="rotate(10 128 40)"><path d="M108 50 104 24 117 36 126 18 135 36 148 24 144 50Z" fill="#ffd66b" ${sw()}/><circle cx="126" cy="42" r="3.2" fill="#ff8fa3"/><circle cx="115" cy="44" r="2.2" fill="#8fd6c2"/><circle cx="137" cy="44" r="2.2" fill="#8fd6c2"/></g>`;
    case "bow":
      return `<g transform="translate(142 50) rotate(16)"><path d="M0 0-17-11-17 11Z" fill="#ff9ab8" ${sw()}/><path d="M0 0 17-11 17 11Z" fill="#ff9ab8" ${sw()}/><circle r="5" fill="#ffc8da" ${sw(2.6)}/></g>`;
    case "starclip":
      return `<path transform="translate(140 52) rotate(12) scale(1.1)" d="M0-12 3.4-4 12-3.6 5.4 2 7.4 10.4 0 6 -7.4 10.4 -5.4 2 -12-3.6 -3.4-4Z" fill="#ffd66b" ${sw(2.6)}/><path d="M156 30l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#fff" ${sw(1.6)}/>`;
    case "flowers":
      return [[66, 50, "#ffb3c7"], [84, 42, "#fff3a8"], [100, 40, "#c9e7ff"], [116, 42, "#ffb3c7"], [134, 50, "#fff3a8"]]
        .map(([x, y, c]) => `<g transform="translate(${x} ${y})"><circle r="7.5" fill="${c}" ${sw(2.4)}/><circle r="2.6" fill="#ffd66b"/></g>`)
        .join("");
    case "scarf":
      return `<path d="M68 146q32 14 64 0l-2 10q-30 12-60 0Z" fill="#ff8f8f" ${sw()}/><path d="M118 152l12 22-14-4Z" fill="#ff8f8f" ${sw()}/><g fill="#fff"><circle cx="84" cy="152" r="2"/><circle cx="100" cy="155" r="2"/><circle cx="116" cy="152" r="2"/></g>`;
    case "bonnet":
      return `<path d="M38 94Q36 34 100 34Q164 34 162 94Q148 60 100 58Q52 60 38 94Z" fill="#ffe0ea" ${sw()}/><path d="M48 84Q54 54 100 50Q146 54 152 84" fill="none" stroke="#ffb3c9" stroke-width="4" stroke-dasharray="1 7" stroke-linecap="round"/><path d="M42 98q-6 20 10 30M158 98q6 20-10 30" fill="none" stroke="#ffb3c9" stroke-width="4" stroke-linecap="round"/>`;
    case "tie":
      return `<path d="M95 146h10l-2 7 6 22-9 9-9-9 6-22Z" fill="#7aa6e8" ${sw()}/><path d="M93 146h14" ${sw()}/>`;
    case "nightcap":
      return `<path d="M58 62Q78 20 128 22Q150 26 166 58Q124 44 58 62Z" fill="#b9d7ff" ${sw()}/><path d="M128 22Q160 8 178 30" fill="none" stroke="#b9d7ff" stroke-width="12" stroke-linecap="round"/><circle cx="180" cy="34" r="9" fill="#fff" ${sw(2.6)}/><path d="M60 60Q110 46 164 58" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`;
    case "glasses":
      return `<g fill="none" ${sw(3)}><circle cx="76" cy="104" r="14"/><circle cx="124" cy="104" r="14"/><path d="M90 104h20"/></g>`;
    case "beret":
      return `<g transform="rotate(-12 100 46)"><ellipse cx="100" cy="48" rx="40" ry="13" fill="#ff7a8a" ${sw()}/><path d="M98 35q2-7 6-7" ${sw()}/></g>`;
    case "mask":
      // 唐草模様のほっかむり（いたずらの共犯者）
      return `<path d="M30 104Q26 40 100 36Q174 40 170 104Q150 70 100 68Q50 70 30 104Z" fill="#5fb97e" ${sw()}/>
        <g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M60 56q8-8 14 0q-6 8-12 2"/><path d="M98 46q8-8 14 0q-6 8-12 2"/><path d="M136 56q8-8 14 0q-6 8-12 2"/><path d="M44 84q6-6 11 0"/><path d="M146 84q6-6 11 0"/></g>
        <path d="M30 104Q40 136 92 132M170 104Q160 136 108 132" fill="none" stroke="#5fb97e" stroke-width="9" stroke-linecap="round"/>
        <g transform="translate(100 134)"><path d="M0 0-14-8-12 8Z" fill="#5fb97e" ${sw(2.6)}/><path d="M0 0 14-8 12 8Z" fill="#5fb97e" ${sw(2.6)}/><circle r="5" fill="#5fb97e" ${sw(2.6)}/></g>`;
    default:
      return "";
  }
}
