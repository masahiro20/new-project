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

function catInner(o: CatOpts): string {
  const id = (isBreedId(o.breed) ? o.breed : "kijitora") as BreedId;
  const a = ART[id];
  const face: Face = o.face ?? faceFromTraits(o.traits ?? {});
  const blush = o.blush ?? (o.traits?.blush || face === "heart" || face === "pout" || face === "sparkle");
  const acc: Accessory = o.acc ?? (o.traits?.crown ? "crown" : "none");
  const u = o.uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const ol = a.dark ? "#2a201e" : "#6b5045";
  const sw = (w = 3.6) => `stroke="${ol}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const tailCol = a.pattern === "points" ? a.accent! : a.pattern === "mike" ? a.accent2! : a.pattern === "cow" ? a.accent2! : a.base;
  const paw = a.socks || a.bicolor ? W : a.pattern === "points" ? a.accent! : a.base;
  const bodyCol = a.sweater ?? a.base;
  const fy = a.flat ? -3 : 0;

  // しっぽ（前に巻きつける）
  const tw = a.fluffy ? 22 : 15;
  let s = `<path d="M144 176C178 178 176 200 146 200H112" fill="none" stroke="${ol}" stroke-width="${tw + 7}" stroke-linecap="round"/>
    <path d="M144 176C178 178 176 200 146 200H112" fill="none" stroke="${tailCol}" stroke-width="${tw}" stroke-linecap="round"/>`;
  if (a.stripe && (a.pattern === "tabby" || a.pattern === "classic")) s += `<path d="M164 182v12M150 190v10" stroke="${a.stripe}" stroke-width="4" stroke-linecap="round"/>`;

  // からだ
  const top = a.short ? 150 : 142;
  const body = `M60 200C56 ${top + 26} 72 ${top} 100 ${top}C128 ${top} 144 ${top + 26} 140 200Z`;
  s += `<clipPath id="b${u}"><path d="${body}"/></clipPath><path d="${body}" fill="${bodyCol}" ${sw()}/><g clip-path="url(#b${u})">`;
  if (a.sweater) {
    s += `<path d="M50 176h100M50 188h100" stroke="#fff" stroke-width="4" opacity=".85"/><rect x="50" y="${top - 2}" width="100" height="12" fill="#86c3dd"/>`;
  } else {
    if (a.pattern === "mike") s += `<ellipse cx="70" cy="180" rx="20" ry="17" fill="${a.accent}"/><ellipse cx="132" cy="188" rx="18" ry="15" fill="${a.accent2}"/>`;
    if (a.pattern === "cow") s += `<ellipse cx="74" cy="176" rx="16" ry="13" fill="${a.accent2}"/><ellipse cx="128" cy="190" rx="14" ry="11" fill="${a.accent2}"/>`;
    if (a.pattern === "sabi") s += `<ellipse cx="74" cy="174" rx="15" ry="12" fill="${a.accent}" opacity=".9"/><ellipse cx="126" cy="188" rx="13" ry="10" fill="${a.accent}" opacity=".9"/>`;
    if (a.pattern === "spots") s += `<g fill="${a.stripe}"><circle cx="74" cy="176" r="4.5"/><circle cx="126" cy="174" r="4.5"/><circle cx="84" cy="194" r="3.5"/></g>`;
    if (a.stripe && (a.pattern === "tabby" || a.pattern === "classic")) s += `<path d="M62 172q8 3 14 1M138 172q-8 3-14 1M60 186q8 2 14 0M140 186q-8 2-14 0" stroke="${a.stripe}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
    if (a.curly) s += `<g fill="none" stroke="${a.stripe}" stroke-width="3" stroke-linecap="round"><path d="M70 172q4-6 8 0q4 6 8 0"/><path d="M112 176q4-6 8 0q4 6 8 0"/><path d="M88 190q4-6 8 0q4 6 8 0"/></g>`;
    if (a.bib || a.bicolor) s += `<ellipse cx="100" cy="${top + 32}" rx="${a.bicolor ? 30 : 22}" ry="${a.bicolor ? 34 : 26}" fill="${W}"/>`;
    if (a.fluffy) s += `<path d="M78 ${top + 2}l6 10 6-9 5 11 5-11 5 11 5-11 6 9 6-10" fill="${a.bib ? W : a.base}"/>`;
  }
  s += `</g>`;
  // 前足
  const py = a.short ? 196 : 194;
  const pr = a.short ? 10 : 12;
  s += `<ellipse cx="86" cy="${py}" rx="${pr}" ry="${pr * 0.72}" fill="${paw}" ${sw(3.2)}/><ellipse cx="114" cy="${py}" rx="${pr}" ry="${pr * 0.72}" fill="${paw}" ${sw(3.2)}/>`;

  s += ears(a, ol);

  // 頬のもふもふ
  if (a.fluffy) {
    s += `<path d="M42 98 28 106 40 112 30 124 46 122 40 134 60 128Z" fill="${a.base}" ${sw(3.2)}/><path d="M158 98 172 106 160 112 170 124 154 122 160 134 140 128Z" fill="${a.base}" ${sw(3.2)}/>`;
  }

  // 頭（もち形）
  const head = `M100 42C140 42 166 66 166 98C166 128 138 146 100 146C62 146 34 128 34 98C34 66 60 42 100 42Z`;
  s += `<clipPath id="h${u}"><path d="${head}"/></clipPath><path d="${head}" fill="${a.base}"/><g clip-path="url(#h${u})">`;
  if (a.pattern === "mike") s += `<ellipse cx="62" cy="66" rx="34" ry="26" fill="${a.accent}" transform="rotate(-14 62 66)"/><ellipse cx="146" cy="70" rx="28" ry="22" fill="${a.accent2}" transform="rotate(14 146 70)"/>`;
  if (a.pattern === "cow") s += `<ellipse cx="140" cy="76" rx="30" ry="26" fill="${a.accent2}" transform="rotate(10 140 76)"/><circle cx="72" cy="52" r="10" fill="${a.accent2}"/>`;
  if (a.pattern === "sabi") s += `<path d="M30 60Q60 42 76 70Q70 94 40 90Z" fill="${a.accent}" opacity=".95"/><path d="M128 52Q160 50 170 84Q150 90 136 76Z" fill="${a.accent}" opacity=".95"/><circle cx="104" cy="56" r="7" fill="${a.accent}"/>`;
  if (a.pattern === "hachiware") s += `<path d="M100 54Q86 98 64 150H136Q114 98 100 54Z" fill="${W}"/>`;
  if (a.pattern === "points") s += `<ellipse cx="100" cy="120" rx="36" ry="30" fill="${a.accent}" opacity=".85"/>`;
  if (a.stripe && a.pattern === "tabby") {
    s += `<g stroke="${a.stripe}" stroke-width="4.2" stroke-linecap="round" fill="none"><path d="M100 46v13"/><path d="M87 48q2 8 4 12"/><path d="M113 48q-2 8-4 12"/><path d="M38 96q10 2 16-1"/><path d="M38 108q10 1 15-3"/><path d="M162 96q-10 2-16-1"/><path d="M162 108q-10 1-15-3"/></g>`;
  }
  if (a.stripe && a.pattern === "classic") {
    s += `<g stroke="${a.stripe}" stroke-width="4.6" stroke-linecap="round" fill="none"><path d="M100 44v15M88 46q2 9 4 14M112 46q-2 9-4 14"/><path d="M36 90q12-4 16 5q-2 9-14 9"/><path d="M164 90q-12-4-16 5q2 9 14 9"/></g>`;
  }
  if (a.pattern === "ticked") s += `<g stroke="${a.stripe}" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".75"><path d="M100 48v10M90 50q1 6 3 9M110 50q-1 6-3 9"/></g>`;
  if (a.pattern === "spots") {
    s += `<g fill="none" stroke="${a.stripe}" stroke-width="3"><circle cx="72" cy="62" r="5"/><circle cx="128" cy="62" r="5"/><circle cx="100" cy="52" r="4"/><circle cx="46" cy="96" r="4"/><circle cx="154" cy="96" r="4"/></g>`;
  }
  if (a.pattern === "sphynx") s += `<g stroke="${a.stripe}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M84 54q16-7 32 0"/><path d="M88 63q12-5 24 0"/></g>`;
  if (a.curly) s += `<g fill="none" stroke="${a.stripe}" stroke-width="3" stroke-linecap="round"><path d="M70 58q4-6 8 0q4 6 8 0"/><path d="M114 58q4-6 8 0q4 6 8 0"/><path d="M40 92q3-5 6 0q3 5 6 0"/><path d="M148 92q3-5 6 0q3 5 6 0"/></g>`;
  if (a.muzzle || a.bicolor) s += `<ellipse cx="100" cy="${124 + fy}" rx="${a.bicolor ? 32 : 22}" ry="${a.bicolor ? 22 : 15}" fill="${W}"/>`;
  s += `<ellipse cx="60" cy="120" rx="11" ry="6.5" fill="#ff9aa8" opacity="${blush ? 0.6 : 0.32}"/><ellipse cx="140" cy="120" rx="11" ry="6.5" fill="#ff9aa8" opacity="${blush ? 0.6 : 0.32}"/>`;
  if (blush) s += `<path d="M55 117l-2 5M60 117l-2 5M65 117l-2 5M145 117l-2 5M140 117l-2 5M135 117l-2 5" stroke="#f27a8c" stroke-width="1.6" stroke-linecap="round"/>`;
  s += `</g><path d="${head}" fill="none" ${sw()}/>`;

  // 目
  const ec = a.dark ? "#f6efe6" : ol;
  const eye = (cx: number, col: string, right: boolean): string => {
    const cy = 104;
    const arc = (up: boolean) => `<path d="M${cx - 8} ${cy + (up ? 2 : -1)}Q${cx} ${cy + (up ? -8 : 6)} ${cx + 8} ${cy + (up ? 2 : -1)}" fill="none" stroke="${a.dark ? col : ol}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (face === "happy" || (face === "wink" && right) || (face === "grin" && false)) return arc(true);
    if (face === "sleepy") return arc(false);
    if (face === "heart") return `<path d="M${cx} ${cy + 7}l-8-7.5a4.6 4.6 0 0 1 8-5a4.6 4.6 0 0 1 8 5Z" fill="#ff6b8a"/>`;
    if (face === "pout" && right) return `<path d="M${cx - 8} ${cy - 1}h16" stroke="${ec}" stroke-width="3.4" stroke-linecap="round"/>`;
    const big = face === "sparkle";
    const rx = big ? 10.5 : 9;
    const ry = big ? 12 : 10.5;
    if (face === "smug") {
      return `<path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}Z" fill="${col}"/><path d="M${cx - 5.5} ${cy}A5.5 7 0 0 0 ${cx + 5.5} ${cy}Z" fill="#2b1f1a"/>
        <path d="M${cx - rx - 2} ${cy}H${cx + rx + 2}" stroke="${ec}" stroke-width="3.4" stroke-linecap="round"/>`;
    }
    let e = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}"/><ellipse cx="${cx}" cy="${cy + 0.8}" rx="${rx - 2.4}" ry="${ry - 2}" fill="#2b1f1a"/>
      <circle cx="${cx - 2.6}" cy="${cy - 3.6}" r="${big ? 3.6 : 3}" fill="#fff"/><circle cx="${cx + 2.8}" cy="${cy + 3.2}" r="1.4" fill="#fff"/>`;
    if (big) e += `<path d="M${cx + 4} ${cy - 7}l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2Z" fill="#fff"/>`;
    return e;
  };
  s += eye(76, a.eye, false) + eye(124, a.eye2 ?? a.eye, true);

  // 鼻・口
  const ny = 116 + fy;
  s += `<path d="M96.5 ${ny}h7l-3.5 4Z" fill="#f59aa6" ${sw(2)}/>`;
  if (face === "grin" || face === "sparkle") {
    s += `<path d="M93 ${ny + 6}q7 10 14 0Z" fill="#e8707f" ${sw(2.4)}/>`;
  } else if (face === "pout") {
    s += `<path d="M95 ${ny + 9}q5-4 10 0" fill="none" ${sw(2.6)}/>`;
  } else {
    s += `<path d="M93 ${ny + 5}q3.5 4.5 7 0q3.5 4.5 7 0" fill="none" ${sw(2.6)}/>`;
  }
  if (!a.noWhisker) {
    const wc = a.dark ? "#efe6dc" : ol;
    s += `<g stroke="${wc}" stroke-width="1.8" stroke-linecap="round" opacity=".55"><path d="M48 112 32 109M48 118 32 120M152 112 168 109M152 118 168 120"/></g>`;
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
