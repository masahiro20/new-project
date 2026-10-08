// 「あなたと猫様の関係」イラストのシーン。12の関係 × 3パターン。
// 400×400 の座標系でSVGを組み立て、吹き出しの位置は別に返す（文字はHTML/Canvas側で描く）。

import { catAt, type Accessory, type Traits } from "./cat.ts";
import { humanG, type HumanOpts } from "./human.ts";

export type RelationId =
  | "king" | "ojou" | "oshi" | "lovers" | "buddy" | "baby"
  | "tsundere" | "boss" | "roommate" | "master" | "artist" | "partner";

export type Bubble = { who: "cat" | "human"; x: number; y: number; w: number; tail: "left" | "right" };

export type SceneCtx = {
  breed: string;
  traits: Traits;
  uid: string;
  human: HumanOpts;
};

export type Scene = { bg: string; svg: string; bubbles: Bubble[] };

const OL = "#3b2a24";
const sw = (w = 4.5) => `stroke="${OL}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// ---------- 小物 ----------
const rect = (c: string) => `<rect width="400" height="400" fill="${c}"/>`;
const dots = (c: string, gap = 32, r = 3) => {
  let s = "";
  for (let y = gap / 2; y < 400; y += gap) for (let x = (y / gap) % 2 ? gap / 2 : gap; x < 400; x += gap) s += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
  return `<g fill="${c}">${s}</g>`;
};
const stripes = (c: string) => {
  let s = "";
  for (let x = 0; x < 400; x += 40) s += `<rect x="${x}" width="20" height="400"/>`;
  return `<g fill="${c}">${s}</g>`;
};
const floor = (y: number, c: string) => `<rect y="${y}" width="400" height="${400 - y}" fill="${c}"/><path d="M0 ${y}H400" ${sw(4)}/>`;
const heart = (x: number, y: number, s: number, c = "#ff5c8a") =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 8-9-1a5.4 5.4 0 0 1 9-6a5.4 5.4 0 0 1 9 6Z" fill="${c}" ${sw(2.2 / s)}/>`;
const sparkle = (x: number, y: number, s: number, c = "#ffd34d") =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10 2.6-2.6 10 0 2.6 2.6 0 10-2.6 2.6-10 0-2.6-2.6Z" fill="${c}" ${sw(1.8 / s)}/>`;
const star = (x: number, y: number, r: number, c = "#fff4b0") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const note = (x: number, y: number, c = OL) => `<g transform="translate(${x} ${y})"><path d="M0 0v-22l14-4v20" fill="none" stroke="${c}" stroke-width="3.5"/><ellipse cx="-3" cy="1" rx="5" ry="4" fill="${c}"/><ellipse cx="11" cy="-3" rx="5" ry="4" fill="${c}"/></g>`;
const cloud = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 20q0-16 16-16q6-14 22-10q14-6 22 8q16 0 16 18Z" fill="#fff" ${sw(3.5)}/></g>`;
const fish = (x: number, y: number, s = 1, r = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M-22 0q16-16 34 0q-18 16-34 0Z" fill="#7cc8ff" ${sw(3)}/><path d="M12 0l12-10v20Z" fill="#7cc8ff" ${sw(3)}/><circle cx="-12" cy="-2" r="2.6" fill="${OL}"/></g>`;
const cushion = (x: number, y: number, w: number, c = "#e94b5a") =>
  `<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${c}" ${sw()}/><circle cx="${x + 4}" cy="${y + 20}" r="5" fill="#ffd34d" ${sw(2.5)}/><circle cx="${x + w - 4}" cy="${y + 20}" r="5" fill="#ffd34d" ${sw(2.5)}/>`;
const sun = (x: number, y: number) => {
  let r = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    r += `<path d="M${x + Math.cos(a) * 46} ${y + Math.sin(a) * 46}L${x + Math.cos(a) * 62} ${y + Math.sin(a) * 62}" stroke="#ffb703" stroke-width="6" stroke-linecap="round"/>`;
  }
  return r + `<circle cx="${x}" cy="${y}" r="36" fill="#ffd34d" ${sw()}/>`;
};
const moon = (x: number, y: number) => `<path d="M${x} ${y - 34}a34 34 0 1 0 30 50a28 28 0 1 1-30-50Z" fill="#fff1a8" ${sw(3.5)}/>`;
const confetti = () => {
  const cs = ["#ff5c8a", "#ffd34d", "#62d2a2", "#7cc8ff", "#b48cff"];
  let s = "";
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % 400;
    const y = (i * 53) % 200;
    s += `<rect x="${x}" y="${y}" width="9" height="5" rx="2" fill="${cs[i % 5]}" transform="rotate(${(i * 37) % 180} ${x} ${y})"/>`;
  }
  return s;
};
const splats = () => {
  const cs = ["#ff5c8a", "#ffd34d", "#62d2a2", "#7cc8ff", "#b48cff", "#ff8c42"];
  let s = "";
  for (let i = 0; i < 14; i++) {
    const x = 20 + ((i * 131) % 360);
    const y = 20 + ((i * 89) % 360);
    s += `<circle cx="${x}" cy="${y}" r="${8 + (i % 4) * 4}" fill="${cs[i % 6]}" opacity=".7"/><circle cx="${x + 14}" cy="${y - 10}" r="4" fill="${cs[i % 6]}" opacity=".7"/>`;
  }
  return s;
};
const paws = (c: string) => {
  let s = "";
  const pts = [[60, 300], [110, 340], [300, 330], [340, 290], [250, 370]];
  for (const [x, y] of pts) s += `<g fill="${c}"><ellipse cx="${x}" cy="${y}" rx="9" ry="7"/><circle cx="${x - 8}" cy="${y - 9}" r="3.5"/><circle cx="${x}" cy="${y - 12}" r="3.5"/><circle cx="${x + 8}" cy="${y - 9}" r="3.5"/></g>`;
  return s;
};
const sofa = (x: number, y: number, w: number, c: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="90" rx="26" fill="${c}" ${sw()}/><rect x="${x + 10}" y="${y + 60}" width="${w - 20}" height="60" rx="16" fill="${c}" ${sw()}/>`;
const box = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#d9a066" ${sw()}/><path d="M${x} ${y}l-14-22h${w * 0.45}l14 22M${x + w} ${y}l14-22h-${w * 0.45}l-14 22" fill="#e8b47c" ${sw()}/><path d="M${x + 16} ${y + 26}h${w - 32}" stroke="#b5793f" stroke-width="5" stroke-linecap="round"/>`;

// ---------- シーン ----------
type Build = (c: SceneCtx) => Scene;

const cat = (c: SceneCtx, x: number, y: number, size: number, extra: { acc?: Accessory; traits?: Traits; flip?: boolean; collar?: string } = {}) =>
  catAt({ breed: c.breed, uid: c.uid + x, traits: { ...c.traits, ...extra.traits }, acc: extra.acc, collar: extra.collar }, x, y, size, extra.flip);
const hu = (c: SceneCtx, o: HumanOpts, x: number, y: number, s = 1, flip = false) => humanG({ ...c.human, ...o }, x, y, s, flip);

const B = (who: "cat" | "human", x: number, y: number, w: number, tail: "left" | "right"): Bubble => ({ who, x, y, w, tail });

export const SCENES: Record<RelationId, Build[]> = {
  king: [
    (c) => ({
      bg: "#ffd6e0",
      svg: rect("#ffd6e0") + dots("#ffffff88") + `<path d="M0 0H400V40Q350 70 300 40Q250 70 200 40Q150 70 100 40Q50 70 0 40Z" fill="#e94b5a" ${sw()}/>` +
        floor(330, "#f7a8b8") + `<path d="M150 400 190 330H330L370 400Z" fill="#e94b5a"/>` +
        `<rect x="232" y="128" width="136" height="190" rx="40" fill="#ffd34d" ${sw()}/><rect x="252" y="148" width="96" height="120" rx="30" fill="#e94b5a" ${sw()}/>` +
        `<rect x="218" y="268" width="164" height="40" rx="14" fill="#e94b5a" ${sw()}/><rect x="226" y="306" width="16" height="30" fill="#ffd34d" ${sw()}/><rect x="358" y="306" width="16" height="30" fill="#ffd34d" ${sw()}/>` +
        cat(c, 236, 128, 128, { traits: { crown: true } }) +
        hu(c, { pose: "kneel", arms: "offer", face: "smile" }, 28, 160) + cushion(62, 302, 76) + fish(100, 296, 1.1) +
        sparkle(210, 110, 1.2) + sparkle(380, 110, 0.9),
      bubbles: [B("cat", 290, 58, 170, "left"), B("human", 92, 92, 160, "right")],
    }),
    (c) => ({
      bg: "#c8ecff",
      svg: rect("#c8ecff") + confetti() + cloud(20, 60, 1.1) + cloud(300, 120, 0.9) + floor(350, "#a8e0a0") +
        hu(c, { arms: "up", face: "grin" }, 130, 196) + cushion(132, 186, 136) +
        cat(c, 140, 66, 122, { traits: { crown: true } }) + sparkle(120, 90, 1) + sparkle(290, 60, 1.2),
      bubbles: [B("cat", 314, 40, 160, "left"), B("human", 92, 270, 150, "right")],
    }),
    (c) => ({
      bg: "#fff1a8",
      svg: rect("#fff1a8") + dots("#ffe066") + sun(60, 60) + floor(330, "#ffd98a") +
        `<ellipse cx="280" cy="330" rx="104" ry="26" fill="#e94b5a" ${sw()}/>` + cat(c, 208, 178, 150, { traits: { crown: true }, acc: "sunglasses" }) +
        `<path d="M150 240 182 132" stroke="#8b5a2b" stroke-width="7" stroke-linecap="round"/><path d="M182 132Q150 60 200 44Q248 90 182 132Z" fill="#62d2a2" ${sw()}/><path d="M182 132 196 64" stroke="${OL}" stroke-width="3"/>` +
        hu(c, { arms: "wave", face: "sweat" }, 14, 178),
      bubbles: [B("cat", 316, 120, 160, "left"), B("human", 96, 130, 150, "right")],
    }),
  ],
  ojou: [
    (c) => ({
      bg: "#ffe0ec",
      svg: rect("#ffe0ec") + stripes("#fff2f7") + cat(c, 222, 132, 146, { acc: "bow" }) +
        `<path d="M168 292H392V400H168Z" fill="#fff" ${sw()}/><path d="M168 292q28 22 56 0q28 22 56 0q28 22 56 0q28 22 56 0" fill="#ffb3cf" ${sw(3.5)}/>` +
        `<path d="M276 276h36l-4 18h-28Z" fill="#fff" ${sw(3.5)}/><path d="M312 280q10 2 6 10" fill="none" ${sw(3.5)}/>` +
        hu(c, { arms: "offer", face: "calm", extra: "bowtie", shirt: "#3b3b4f" }, 18, 160) +
        `<path d="M70 286q20-28 44 0v18q-22 8-44 0Z" fill="#fff" ${sw(3.5)}/><path d="M114 290l18-12" ${sw(4)}/><circle cx="92" cy="276" r="5" fill="#ffd34d" ${sw(2.5)}/>` +
        sparkle(370, 60, 1),
      bubbles: [B("cat", 300, 50, 170, "left"), B("human", 92, 96, 160, "right")],
    }),
    (c) => ({
      bg: "#d8f5e1",
      svg: rect("#d8f5e1") + dots("#bfecce") + floor(336, "#a8e0a0") +
        [40, 120, 330, 370].map((x, i) => `<circle cx="${x}" cy="${352 + (i % 2) * 18}" r="9" fill="${["#ff7eb6", "#ffd34d", "#b48cff", "#ff8c42"][i]}" ${sw(2.5)}/>`).join("") +
        cat(c, 222, 196, 140, { acc: "bow" }) +
        `<path d="M162 238 270 104" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round"/><path d="M180 112Q270 20 360 112Q345 98 330 112Q315 98 300 112Q285 98 270 112Q255 98 240 112Q225 98 210 112Q195 98 180 112Z" fill="#ff9ec4" ${sw()}/>` +
        hu(c, { arms: "wave", face: "smile", extra: "bowtie", shirt: "#3b3b4f" }, 40, 180),
      bubbles: [B("cat", 320, 160, 150, "left"), B("human", 94, 120, 150, "right")],
    }),
    (c) => ({
      bg: "#e6defa",
      svg: rect("#e6defa") + dots("#d6caf7") + floor(340, "#cbbdf2") +
        `<ellipse cx="290" cy="330" rx="90" ry="22" fill="#b48cff" ${sw()}/>` + cat(c, 214, 176, 152, { acc: "bow" }) +
        hu(c, { pose: "kneel", arms: "offer", face: "smile", extra: "bowtie", shirt: "#3b3b4f" }, 18, 160) +
        `<ellipse cx="90" cy="306" rx="50" ry="10" fill="#e3e3ee" ${sw()}/><path d="M56 302q34-60 68 0Z" fill="#f2f2f8" ${sw()}/><circle cx="90" cy="252" r="5" fill="#f2f2f8" ${sw(3)}/>` +
        sparkle(130, 250, 1) + sparkle(380, 150, 1),
      bubbles: [B("cat", 300, 70, 170, "left"), B("human", 96, 100, 160, "right")],
    }),
  ],
  oshi: [
    (c) => ({
      bg: "#2e2a5c",
      svg: rect("#2e2a5c") + [30, 90, 160, 350, 380, 250].map((x, i) => star(x, 30 + ((i * 47) % 120), 3)).join("") +
        `<path d="M220 0H330L380 320H170Z" fill="#fff6b0" opacity=".28"/><ellipse cx="275" cy="320" rx="120" ry="30" fill="#ff7eb6" ${sw()}/>` +
        cat(c, 200, 160, 150, { traits: { blush: true } }) + sparkle(190, 150, 1.3) + sparkle(370, 200, 1) +
        hu(c, { arms: "cheer", face: "heart" }, 14, 196),
      bubbles: [B("cat", 300, 80, 160, "left"), B("human", 100, 110, 160, "right")],
    }),
    (c) => ({
      bg: "#ffe8f0",
      svg: rect("#ffe8f0") + dots("#ffd0e0") +
        `<path d="M290 330 190 230a60 60 0 0 1 100-70a60 60 0 0 1 100 70Z" fill="#ffc2d8" ${sw()}/>` + cat(c, 214, 172, 150) +
        sparkle(200, 170, 1.2) + sparkle(380, 190, 1) + sparkle(290, 120, 0.9) +
        hu(c, { arms: "camera", face: "grin" }, 18, 178),
      bubbles: [B("cat", 300, 56, 160, "left"), B("human", 92, 100, 150, "right")],
    }),
    (c) => ({
      bg: "#ffd3e3",
      svg: rect("#ffd3e3") + note(60, 70) + note(330, 60) + note(250, 110) +
        `<rect x="216" y="300" width="160" height="60" rx="12" fill="#fff" ${sw()}/>` + cat(c, 220, 150, 152, { flip: true, acc: "sunglasses" }) +
        hu(c, { arms: "wave", face: "heart" }, 16, 178) +
        `<path d="M138 234 148 196" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round"/><circle cx="152" cy="168" r="34" fill="#fff" ${sw()}/>` + heart(152, 164, 2.2),
      bubbles: [B("cat", 300, 50, 160, "left"), B("human", 92, 96, 150, "right")],
    }),
  ],
  lovers: [
    (c) => ({
      bg: "#ffc59e",
      svg: `<defs><linearGradient id="sun${c.uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9ec4"/><stop offset="1" stop-color="#ffd59e"/></linearGradient></defs><rect width="400" height="400" fill="url(#sun${c.uid})"/>` +
        `<circle cx="200" cy="250" r="70" fill="#ffe08a" opacity=".8"/>` + floor(330, "#f7b08a") +
        hu(c, { pose: "sit", arms: "down", face: "smile" }, 48, 152) + cat(c, 218, 178, 136, { traits: { blush: true } }) +
        `<rect x="40" y="300" width="330" height="22" rx="8" fill="#a8693c" ${sw()}/><rect x="60" y="320" width="14" height="40" fill="#a8693c" ${sw()}/><rect x="336" y="320" width="14" height="40" fill="#a8693c" ${sw()}/>` +
        heart(206, 150, 3),
      bubbles: [B("cat", 314, 70, 160, "left"), B("human", 96, 80, 150, "right")],
    }),
    (c) => ({
      bg: "#ffd6e6",
      svg: rect("#ffd6e6") + dots("#ffc0d6") + heart(60, 80, 2.4) + heart(340, 70, 2) + heart(350, 300, 1.6) + heart(50, 300, 1.8) +
        hu(c, { arms: "hug", face: "heart", hold: cat(c, 22, 70, 96, { traits: { blush: true } }) }, 120, 150, 1.15),
      bubbles: [B("cat", 314, 150, 150, "left"), B("human", 90, 140, 150, "right")],
    }),
    (c) => ({
      bg: "#2f3a6b",
      svg: rect("#2f3a6b") + `<rect x="90" y="30" width="220" height="190" rx="12" fill="#1f2750" ${sw()}/><path d="M200 30v190M90 125h220" ${sw(5)}/>` +
        moon(250, 90) + star(130, 70, 3) + star(160, 170, 2.5) + star(280, 180, 2.5) + floor(330, "#4a5490") +
        hu(c, { pose: "sit", arms: "down", face: "smile" }, 36, 176) + cat(c, 214, 196, 134, { traits: { blush: true } }) + heart(200, 250, 1.6),
      bubbles: [B("cat", 300, 236, 150, "left"), B("human", 100, 150, 150, "right")],
    }),
  ],
  buddy: [
    (c) => ({
      bg: "#ffe9c7",
      svg: rect("#ffe9c7") + dots("#ffdba3") + sofa(20, 190, 360, "#7ec8e3") +
        hu(c, { pose: "sit", arms: "offer", face: "grin" }, 36, 146) + cat(c, 220, 176, 140) +
        `<path d="M82 282h60l-8 34h-44Z" fill="#ff5c5c" ${sw()}/><path d="M86 288h52" stroke="#fff" stroke-width="5"/>` +
        [92, 108, 124, 136].map((x, i) => `<circle cx="${x}" cy="${276 - (i % 2) * 8}" r="8" fill="#fff8dc" ${sw(2.5)}/>`).join("") +
        `<circle cx="180" cy="200" r="6" fill="#fff8dc" ${sw(2.5)}/><circle cx="200" cy="170" r="6" fill="#fff8dc" ${sw(2.5)}/>`,
      bubbles: [B("cat", 316, 70, 160, "left"), B("human", 96, 72, 150, "right")],
    }),
    (c) => ({
      bg: "#c8ecff",
      svg: rect("#c8ecff") + cloud(250, 40) + `<path d="M0 300 90 170 170 270 250 150 400 300V400H0Z" fill="#8fd18f" ${sw()}/><path d="M250 150 225 186 250 176 275 186Z" fill="#fff"/>` +
        floor(330, "#6fbf73") + `<rect x="196" y="236" width="70" height="80" rx="16" fill="#ff8c42" ${sw()}/>` +
        cat(c, 178, 150, 104) + hu(c, { arms: "wave", face: "grin", hair: "spiky" }, 70, 180) +
        `<path d="M118 268 196 250M162 268 196 280" stroke="#c4672a" stroke-width="8" stroke-linecap="round"/>`,
      bubbles: [B("cat", 320, 120, 150, "left"), B("human", 86, 110, 150, "right")],
    }),
    (c) => {
      let burst = "";
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        burst += `<path d="M200 220L${200 + Math.cos(a) * 300} ${220 + Math.sin(a) * 300}" stroke="#ffe066" stroke-width="22"/>`;
      }
      return {
        bg: "#fff3b0",
        svg: rect("#fff3b0") + burst + floor(340, "#ffd98a") +
          hu(c, { arms: "wave", face: "grin" }, 24, 172) + cat(c, 222, 196, 140) +
          `<ellipse cx="196" cy="238" rx="15" ry="13" fill="${c.breed === "kuro" || c.breed === "hachiware" || c.breed === "sabi" ? "#3b3331" : "#fffdf8"}" ${sw()}/><ellipse cx="196" cy="242" rx="6" ry="5" fill="#ff9aa8"/>` +
          sparkle(172, 200, 1.6, "#fff") + sparkle(200, 196, 1, "#ff5c8a"),
        bubbles: [B("cat", 320, 120, 150, "left"), B("human", 96, 110, 150, "right")],
      };
    },
  ],
  baby: [
    (c) => ({
      bg: "#d6ecff",
      svg: rect("#d6ecff") + dots("#c2e1ff") + `<path d="M120 0v30M200 0v44M280 0v30" stroke="${OL}" stroke-width="2.5"/><path d="M100 30h200" ${sw(4)}/>` +
        star(120, 40, 9, "#ffd34d") + heart(200, 50, 1.4) + star(280, 40, 9, "#b48cff") + floor(340, "#b9dcff") +
        cat(c, 210, 186, 146, { acc: "bonnet" }) + hu(c, { pose: "sit", arms: "offer", face: "smile", extra: "apron" }, 14, 160) +
        `<g transform="rotate(-62 116 296)"><rect x="100" y="266" width="32" height="54" rx="10" fill="#fff" ${sw()}/><rect x="96" y="262" width="40" height="12" rx="4" fill="#7cc8ff" ${sw(3.5)}/><path d="M108 262q8-22 16 0" fill="#ffd7a8" ${sw(3.5)}/><path d="M104 296h24" stroke="#ffd7e6" stroke-width="10"/></g>`,
      bubbles: [B("cat", 316, 90, 160, "left"), B("human", 96, 92, 150, "right")],
    }),
    (c) => ({
      bg: "#cfd3ff",
      svg: rect("#cfd3ff") + moon(330, 70) + star(60, 60, 3, "#fff") + star(200, 40, 3, "#fff") + star(140, 110, 2.5, "#fff") + floor(340, "#b5b9f2") +
        cat(c, 196, 170, 140, { acc: "bonnet" }) +
        `<path d="M176 268H356L338 340H194Z" fill="#f2c48c" ${sw()}/><path d="M184 284H348M190 304H342M194 324H338" stroke="#d99a55" stroke-width="4"/><path d="M168 268h196" stroke="${OL}" stroke-width="10" stroke-linecap="round"/>` +
        hu(c, { pose: "sit", arms: "down", face: "smile", hair: "bob" }, 12, 160) + note(160, 140, "#6b5bd6") + note(130, 100, "#ff5c8a"),
      bubbles: [B("cat", 300, 120, 160, "left"), B("human", 92, 92, 150, "right")],
    }),
    (c) => ({
      bg: "#d3f5e6",
      svg: rect("#d3f5e6") + dots("#bdeed8") + floor(340, "#a8e6c8") +
        `<circle cx="60" cy="356" r="16" fill="#ff7eb6" ${sw()}/><path d="M52 350q8 8 16 0M52 360q8 8 16 0" stroke="#fff" stroke-width="2.5" fill="none"/>` +
        `<path d="M330 372l20-30" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round"/><circle cx="356" cy="334" r="16" fill="#ffd34d" ${sw()}/>` +
        hu(c, { arms: "hug", face: "sweat", extra: "apron", hold: cat(c, 22, 70, 96, { acc: "bonnet" }) }, 120, 150, 1.15),
      bubbles: [B("cat", 316, 140, 150, "left"), B("human", 90, 140, 150, "right")],
    }),
  ],
  tsundere: [
    (c) => ({
      bg: "#fff3c4",
      svg: rect("#fff3c4") + cloud(20, 40) + cloud(280, 80, 0.8) + floor(340, "#ffe08a") +
        hu(c, { arms: "wave", face: "smile" }, 20, 172) + cat(c, 220, 190, 146, { flip: true }) + heart(372, 324, 1.3),
      bubbles: [B("cat", 300, 110, 150, "right"), B("human", 92, 104, 150, "right")],
    }),
    (c) => ({
      bg: "#ffe2cf",
      svg: rect("#ffe2cf") + dots("#ffd2b6") + sofa(10, 200, 380, "#ff9e7a") +
        hu(c, { pose: "sit", arms: "down", face: "calm" }, 14, 160, 0.95) + cat(c, 262, 196, 124, { flip: true }) + heart(200, 230, 1.2),
      bubbles: [B("cat", 320, 110, 140, "right"), B("human", 86, 100, 140, "right")],
    }),
    (c) => ({
      bg: "#eadcff",
      svg: rect("#eadcff") + dots("#ddc9ff") + floor(340, "#d2bdf7") +
        cat(c, 230, 116, 136) + box(232, 236, 140, 104) +
        hu(c, { arms: "down", face: "sweat" }, 20, 176) + `<text x="174" y="150" font-size="34" font-weight="900" fill="${OL}" font-family="sans-serif">?</text>`,
      bubbles: [B("cat", 316, 70, 150, "left"), B("human", 90, 104, 150, "right")],
    }),
  ],
  boss: [
    (c) => ({
      bg: "#d9e8ff",
      svg: rect("#d9e8ff") + `<rect x="20" y="24" width="160" height="120" rx="8" fill="#a8d8ff" ${sw()}/><path d="M30 144V100h20v44M60 144V80h24v64M94 144V108h18v36M122 144V70h22v74M152 144V96h18v48" fill="#7a9cc6"/><path d="M100 24v120M20 84h160" ${sw(4)}/>` +
        cat(c, 230, 142, 140, { acc: "tie" }) + `<rect x="160" y="282" width="240" height="118" fill="#a8693c" ${sw()}/><path d="M160 300H400" stroke="#8a5530" stroke-width="5"/>` +
        `<path d="M300 250h70l10 32h-90Z" fill="#cfd8e6" ${sw(3.5)}/>` +
        hu(c, { arms: "offer", face: "sweat", extra: "suit", shirt: "#4a5a7a" }, 16, 170) +
        `<rect x="56" y="270" width="54" height="40" fill="#fff" ${sw(3.5)}/><path d="M64 282h36M64 292h30" stroke="#b9c3d6" stroke-width="3"/>`,
      bubbles: [B("cat", 306, 60, 160, "left"), B("human", 96, 170, 150, "right")],
    }),
    (c) => ({
      bg: "#e3e8f2",
      svg: rect("#e3e8f2") + dots("#d3dae8") + floor(340, "#c9d1e3") +
        `<rect x="216" y="110" width="160" height="200" rx="40" fill="#3b3b4f" ${sw()}/><rect x="206" y="290" width="180" height="34" rx="12" fill="#3b3b4f" ${sw()}/><path d="M296 324v24M260 352h72" ${sw(6)}/>` +
        cat(c, 226, 160, 140, { acc: "tie" }) +
        `<path d="M352 300h26l-4 30h-18Z" fill="#fff" ${sw(3.5)}/><path d="M358 292q4-8 0-14M368 292q4-8 0-14" stroke="#b9a" stroke-width="3" fill="none"/>` +
        hu(c, { arms: "write", face: "calm", extra: "suit", shirt: "#4a5a7a" }, 20, 170),
      bubbles: [B("cat", 300, 50, 160, "left"), B("human", 96, 110, 150, "right")],
    }),
    (c) => ({
      bg: "#f2f7ff",
      svg: rect("#f2f7ff") + floor(340, "#dbe6f7") +
        `<rect x="190" y="20" width="190" height="124" rx="8" fill="#fff" ${sw()}/><path d="M210 124 250 98 290 108 340 52" fill="none" stroke="#ff5c8a" stroke-width="7" stroke-linecap="round"/><path d="M326 48h18v18" fill="none" stroke="#ff5c8a" stroke-width="7" stroke-linecap="round"/>` +
        fish(220, 50, 0.7) + cat(c, 226, 200, 140, { acc: "tie" }) + `<path d="M262 238 300 140" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>` +
        hu(c, { pose: "sit", arms: "write", face: "surprise", extra: "glasses" }, 16, 166),
      bubbles: [B("cat", 300, 156, 150, "left"), B("human", 94, 100, 150, "right")],
    }),
  ],
  roommate: [
    (c) => ({
      bg: "#e8f4ff",
      svg: `<rect width="200" height="400" fill="#e8f4ff"/><rect x="200" width="200" height="400" fill="#fff1d6"/>` + floor(340, "#e6dccb") +
        `<ellipse cx="96" cy="342" rx="80" ry="18" fill="#7ec8e3" ${sw()}/>` + hu(c, { pose: "sit", arms: "offer", face: "calm" }, 26, 166) +
        `<path d="M70 272h56l-4 30H74Z" fill="#62d2a2" ${sw(3.5)}/><path d="M98 272v30" ${sw(3)}/>` +
        `<ellipse cx="300" cy="342" rx="84" ry="18" fill="#ffb37a" ${sw()}/>` + cat(c, 226, 194, 146, { traits: { wink: true } }) +
        `<text x="352" y="180" font-size="28" font-weight="900" fill="${OL}" font-family="sans-serif">z</text><text x="368" y="152" font-size="20" font-weight="900" fill="${OL}" font-family="sans-serif">z</text>`,
      bubbles: [B("cat", 300, 60, 150, "left"), B("human", 100, 60, 150, "right")],
    }),
    (c) => ({
      bg: "#dff3dc",
      svg: rect("#dff3dc") + dots("#c9eac4") + floor(310, "#bfe3b8") +
        `<g transform="rotate(-90 110 300)">${hu(c, { arms: "down", face: "sleepy" }, 40, 200)}</g>` + cat(c, 232, 196, 136, { traits: { wink: true } }),
      bubbles: [B("cat", 316, 100, 150, "left"), B("human", 120, 120, 160, "right")],
    }),
    (c) => ({
      bg: "#f6ecdb",
      svg: rect("#f6ecdb") + dots("#ecdcc0") + floor(340, "#e3d1b2") +
        hu(c, { pose: "sit", arms: "offer", face: "calm", extra: "glasses" }, 16, 160) +
        `<path d="M52 266h80l10 34H42Z" fill="#cfd8e6" ${sw(3.5)}/><rect x="56" y="230" width="72" height="40" rx="4" fill="#4a4a5a" ${sw(3.5)}/>` +
        cat(c, 238, 128, 128) + box(240, 248, 130, 92),
      bubbles: [B("cat", 310, 70, 150, "left"), B("human", 96, 90, 150, "right")],
    }),
  ],
  master: [
    (c) => ({
      bg: "#f6efe0",
      svg: rect("#f6efe0") + `<path d="M290 70a110 110 0 1 1-96 60" fill="none" stroke="${OL}" stroke-width="16" stroke-linecap="round" opacity=".85"/>` + floor(340, "#e6d8b8") +
        `<rect x="206" y="304" width="170" height="40" rx="16" fill="#8e6cc8" ${sw()}/>` + cat(c, 216, 162, 150, { traits: { crown: true } }) +
        hu(c, { pose: "kneel", arms: "down", face: "calm" }, 22, 170),
      bubbles: [B("cat", 300, 40, 170, "left"), B("human", 96, 120, 150, "right")],
    }),
    (c) => ({
      bg: "#dff0d8",
      svg: rect("#dff0d8") + [30, 70, 350].map((x) => `<rect x="${x}" y="0" width="18" height="400" fill="#8fcf7a" ${sw(3)}/><path d="M${x} 90h18M${x} 200h18M${x} 300h18" ${sw(3)}/>`).join("") +
        `<rect x="240" y="30" width="110" height="140" fill="#fffaf0" ${sw()}/><path d="M232 30h126M232 170h126" stroke="#8b5a2b" stroke-width="10" stroke-linecap="round"/><path d="M296 52v100M276 60v70" stroke="${OL}" stroke-width="7" stroke-linecap="round"/>` +
        floor(340, "#c9e5bd") + `<rect x="200" y="304" width="176" height="40" rx="16" fill="#8e6cc8" ${sw()}/>` + cat(c, 212, 166, 150, { traits: { crown: true } }) +
        hu(c, { pose: "sit", arms: "write", face: "calm" }, 30, 164),
      bubbles: [B("cat", 140, 24, 160, "right"), B("human", 96, 112, 150, "right")],
    }),
    (c) => ({
      bg: "#ffc78a",
      svg: `<defs><linearGradient id="sr${c.uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9e7a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient></defs><rect width="400" height="400" fill="url(#sr${c.uid})"/>` +
        `<circle cx="300" cy="120" r="60" fill="#fff1a8" opacity=".85"/><path d="M150 400 290 210 400 330V400Z" fill="#9a8a7a" ${sw()}/><path d="M290 210 266 244 290 236 310 252Z" fill="#fff"/>` +
        cat(c, 222, 96, 130, { traits: { crown: true } }) + hu(c, { arms: "up", face: "surprise" }, 30, 230, 0.85),
      bubbles: [B("cat", 300, 30, 160, "left"), B("human", 96, 160, 150, "right")],
    }),
  ],
  artist: [
    (c) => ({
      bg: "#fff6e0",
      svg: rect("#fff6e0") + splats() + floor(340, "#f2e2bf") +
        `<path d="M300 340 330 120M370 340 340 120" stroke="#8b5a2b" stroke-width="8" stroke-linecap="round"/><rect x="270" y="120" width="120" height="110" fill="#fff" ${sw()}/>` +
        `<circle cx="300" cy="160" r="16" fill="#ff5c8a"/><circle cx="340" cy="190" r="22" fill="#7cc8ff"/><circle cx="360" cy="150" r="10" fill="#ffd34d"/>` +
        cat(c, 168, 196, 134, { acc: "beret" }) + hu(c, { arms: "offer", face: "sweat", hair: "bun" }, 4, 170) +
        `<path d="M50 280q30-26 70-6q8 14-10 24q-30 12-60-18Z" fill="#f2c48c" ${sw(3.5)}/><circle cx="70" cy="280" r="5" fill="#ff5c8a"/><circle cx="88" cy="276" r="5" fill="#62d2a2"/><circle cx="104" cy="284" r="5" fill="#7cc8ff"/>`,
      bubbles: [B("cat", 300, 40, 160, "left"), B("human", 92, 100, 150, "right")],
    }),
    (c) => ({
      bg: "#ffffff",
      svg: rect("#ffffff") + splats() + paws("#ff5c8a99") + floor(350, "#f0f0f0") +
        cat(c, 120, 170, 156, { acc: "beret" }) + hu(c, { arms: "clap", face: "grin" }, 262, 186, 0.92, true),
      bubbles: [B("cat", 120, 90, 160, "right"), B("human", 316, 110, 150, "left")],
    }),
    (c) => ({
      bg: "#eef0f4",
      svg: rect("#eef0f4") + floor(340, "#d9dde6") +
        `<rect x="30" y="30" width="150" height="110" fill="#ffd34d" ${sw(8)}/><rect x="42" y="42" width="126" height="86" fill="#fff"/><path d="M50 120q30-70 60-20t50-40" fill="none" stroke="#ff5c8a" stroke-width="8" stroke-linecap="round"/><circle cx="140" cy="70" r="12" fill="#7cc8ff"/>` +
        `<ellipse cx="300" cy="340" rx="90" ry="18" fill="#ffd34d" ${sw()}/>` + cat(c, 226, 184, 146, { acc: "sunglasses" }) +
        hu(c, { arms: "write", face: "sweat" }, 24, 174) + sparkle(220, 190, 1.2) + sparkle(380, 210, 1),
      bubbles: [B("cat", 300, 60, 160, "left"), B("human", 100, 166, 140, "right")],
    }),
  ],
  partner: [
    (c) => ({
      bg: "#fff1b8",
      svg: rect("#fff1b8") + dots("#ffe486") + `<rect x="150" y="300" width="250" height="100" fill="#ff9e7a" ${sw()}/>` +
        cat(c, 210, 160, 140, { traits: { wink: true } }) +
        `<g transform="rotate(38 370 282)"><path d="M352 256h40l-5 46h-30Z" fill="#7cc8ff" ${sw(3.5)}/></g><path d="M380 318q10 30-6 60" stroke="#7cc8ff" stroke-width="10" stroke-linecap="round" fill="none"/>` +
        hu(c, { arms: "shh", face: "grin" }, 14, 172),
      bubbles: [B("cat", 300, 60, 160, "left"), B("human", 92, 104, 150, "right")],
    }),
    (c) => ({
      bg: "#d3f5e6",
      svg: rect("#d3f5e6") + floor(340, "#bdeed8") +
        `<path d="M20 330q60-80 120-10t120-30 120 40" fill="none" stroke="${OL}" stroke-width="22" stroke-linecap="round"/><path d="M20 330q60-80 120-10t120-30 120 40" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"/>` +
        cat(c, 214, 170, 142, { traits: { wink: true } }) +
        `<path d="M230 290q50-30 120 0" fill="none" stroke="${OL}" stroke-width="20" stroke-linecap="round"/><path d="M230 290q50-30 120 0" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>` +
        hu(c, { arms: "up", face: "grin" }, 20, 186) + `<rect x="30" y="160" width="30" height="34" rx="6" fill="#fff" ${sw()}/><circle cx="45" cy="177" r="6" fill="#e8e8e8" ${sw(2.5)}/>`,
      bubbles: [B("cat", 316, 70, 150, "left"), B("human", 120, 100, 150, "right")],
    }),
    (c) => ({
      bg: "#232a52",
      svg: rect("#232a52") + floor(340, "#343c6e") +
        `<path d="M250 40H390V340H250Z" fill="#e8f1ff" ${sw()}/><path d="M250 40 196 70V310L250 340Z" fill="#cfe0f7" ${sw()}/><path d="M250 40H390V340H250Z" fill="#fff6b0" opacity=".4"/><path d="M262 150h116M262 240h116" ${sw(4)}/>` +
        `<rect x="276" y="110" width="30" height="36" rx="6" fill="#ff8c42" ${sw(3)}/><circle cx="350" cy="128" r="16" fill="#ffd34d" ${sw(3)}/>` + fish(300, 214, 0.9) +
        cat(c, 214, 196, 136, { traits: { wink: true } }) + hu(c, { arms: "shh", face: "grin" }, 16, 176) + fish(250, 300, 0.8, -20),
      bubbles: [B("cat", 150, 160, 130, "right"), B("human", 92, 96, 150, "right")],
    }),
  ],
};

export function sceneSvg(rel: RelationId, variant: number, ctx: SceneCtx): Scene {
  const list = SCENES[rel];
  const sc = list[((variant % list.length) + list.length) % list.length](ctx);
  return {
    ...sc,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="あなたと猫様のイラスト">${sc.svg}</svg>`,
  };
}
