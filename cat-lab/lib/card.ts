// SNSに載せる「猫様カード」をCanvasで描く（ブラウザ専用）。
// 名前などの文字はCanvasのfillTextで描くので、ユーザー入力がSVG/HTMLとして解釈されることはない。

import { ART, catSvg, isBreedId } from "./cat.ts";
import type { Relation } from "./relations.ts";
import type { AxisScores, Rarity } from "./scoring.ts";

export type CardData = {
  name: string;
  breedId: string;
  breedLabel: string;
  rel: Pick<Relation, "id" | "name" | "catRole" | "humanRole" | "catIcon" | "humanIcon" | "theme" | "stickers" | "face" | "acc">;
  catLine: string;
  aruaru: { label: string; text: string }[];
  rarity: Pick<Rarity, "rank" | "label">;
  axes: AxisScores;
};

export type CardPhoto = CanvasImageSource & { width: number; height: number };

const INK = "#4b3a33";
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  const e = (cx: number, cy: number, rx: number, ry: number, r = 0) => {
    ctx.beginPath();
    ctx.ellipse(x + cx * s, y + cy * s, rx * s, ry * s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  e(0, 4, 7, 5.6);
  e(-7.6, -3.6, 2.8, 3.6, -0.3);
  e(-2.6, -7.6, 2.8, 3.6, -0.1);
  e(2.6, -7.6, 2.8, 3.6, 0.1);
  e(7.6, -3.6, 2.8, 3.6, 0.3);
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, min: number, family: string, weight = 900) {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > min) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function wrap2(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const chars = [...text];
  const half = Math.ceil(chars.length / 2);
  const a = chars.slice(0, half).join("");
  const b = chars.slice(half).join("");
  if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) return [a, b];
  let line = "";
  const out: string[] = [];
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      out.push(line);
      line = ch;
    } else line += ch;
  }
  out.push(line);
  if (out.length > 2) return [out[0], out[1].slice(0, -1) + "…"];
  return out;
}

function shadow(ctx: CanvasRenderingContext2D, blur: number, y: number, a = 0.14) {
  ctx.shadowColor = `rgba(75,58,51,${a})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = y;
}
function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function loadSvg(svg: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${size}" height="${size}" `));
  });
}

export async function fontFamily(sample: string): Promise<string> {
  const family = getComputedStyle(document.body).fontFamily;
  try {
    await Promise.all([700, 900].map((w) => document.fonts.load(`${w} 32px ${family}`, sample)));
  } catch {
    /* フォントが読めなくても代替フォントで描画する */
  }
  return family;
}

function rarityBadge(ctx: CanvasRenderingContext2D, x: number, y: number, rank: string, family: string) {
  const w = rank === "SSR" ? 150 : rank === "UR" ? 130 : 110;
  const h = 64;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (rank === "UR") { g.addColorStop(0, "#ff9ac1"); g.addColorStop(0.35, "#ffd66b"); g.addColorStop(0.7, "#8fe0c9"); g.addColorStop(1, "#a9a3ff"); }
  else if (rank === "SSR") { g.addColorStop(0, "#ffd66b"); g.addColorStop(1, "#f5a623"); }
  else if (rank === "SR") { g.addColorStop(0, "#e9eef5"); g.addColorStop(1, "#b8c4d6"); }
  else { g.addColorStop(0, "#ffe3d3"); g.addColorStop(1, "#f6c3a6"); }
  shadow(ctx, 14, 4, 0.18);
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, 32);
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 4;
  rr(ctx, x + 4, y + 4, w - 8, h - 8, 28);
  ctx.stroke();
  ctx.fillStyle = rank === "SR" || rank === "R" ? INK : "#fff";
  ctx.font = `900 38px ${family}`;
  ctx.textAlign = "center";
  if (rank === "UR" || rank === "SSR") {
    ctx.strokeStyle = "rgba(160,90,0,.35)";
    ctx.lineWidth = 5;
    ctx.strokeText(rank, x + w / 2, y + 46);
  }
  ctx.fillText(rank, x + w / 2, y + 46);
}

function radar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, axes: AxisScores, color: string, family: string) {
  const keys: (keyof AxisScores)[] = ["dom", "amae", "mood", "demand"];
  const labels = ["君臨", "甘え", "気まぐれ", "要求"];
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * Math.PI) / 2;
    return [cx + Math.cos(ang) * r * v, cy + Math.sin(ang) * r * v];
  };
  ctx.lineWidth = 2;
  for (const k of [1, 0.66, 0.33]) {
    ctx.beginPath();
    keys.forEach((_, i) => {
      const [x, y] = pt(i, k);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = k === 1 ? "#fbf6f1" : "transparent";
    if (k === 1) ctx.fill();
    ctx.strokeStyle = "#eadfd6";
    ctx.stroke();
  }
  ctx.beginPath();
  keys.forEach((key, i) => {
    const [x, y] = pt(i, Math.max(0.08, axes[key] / 100));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `900 22px ${family}`;
  ctx.textAlign = "center";
  labels.forEach((l, i) => {
    const [x, y] = pt(i, 1.32);
    ctx.fillText(l, x, y + 8);
  });
}

/** 4:5 のカード（1080×1350） */
export async function drawCard(d: CardData, photo?: CardPhoto | null): Promise<HTMLCanvasElement> {
  const family = await fontFamily(`あなたとは${d.name}${d.breedLabel}${d.rel.name}${d.rel.catRole}${d.rel.humanRole}${d.catLine}${d.aruaru.map((a) => a.label + a.text).join("")}主従研究所猫様との関係診断君臨甘え気まぐれ要求＝`);
  const [c1, c2, accent] = d.rel.theme;
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;

  // 背景
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(1, c2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  for (let y = 30; y < H; y += 54) for (let x = (y / 54) % 2 ? 30 : 57; x < W; x += 54) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ヘッダー
  ctx.textAlign = "left";
  shadow(ctx, 12, 3, 0.1);
  ctx.fillStyle = "#fff";
  rr(ctx, 60, 54, 252, 60, 30);
  ctx.fill();
  noShadow(ctx);
  paw(ctx, 96, 86, 1.6, accent);
  ctx.fillStyle = accent;
  ctx.font = `900 28px ${family}`;
  ctx.fillText("主従研究所", 124, 94);
  rarityBadge(ctx, W - 60 - (d.rarity.rank === "SSR" ? 150 : d.rarity.rank === "UR" ? 130 : 110), 52, d.rarity.rank, family);

  // タイトル
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(75,58,51,.75)";
  fit(ctx, `あなたと${d.name}は…`, 900, 38, 24, family);
  ctx.fillText(`あなたと${d.name}は…`, W / 2, 182);
  const ts = fit(ctx, d.rel.name, 960, 96, 46, family);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = ts * 0.22;
  ctx.strokeText(d.rel.name, W / 2, 284);
  ctx.fillStyle = INK;
  ctx.fillText(d.rel.name, W / 2, 284);

  // 役割
  const roles = d.rel.catRole === d.rel.humanRole
    ? [`${d.rel.catIcon} ふたりとも${d.rel.catRole}`]
    : [`${d.rel.catIcon} ${d.name}＝${d.rel.catRole}`, `${d.rel.humanIcon} あなた＝${d.rel.humanRole}`];
  ctx.font = `900 30px ${family}`;
  const widths = roles.map((r) => Math.min(ctx.measureText(r).width + 48, 470));
  let rx = W / 2 - (widths.reduce((a, b) => a + b, 0) + (roles.length - 1) * 16) / 2;
  roles.forEach((r, i) => {
    shadow(ctx, 10, 3, 0.1);
    ctx.fillStyle = "#fff";
    rr(ctx, rx, 318, widths[i], 58, 29);
    ctx.fill();
    noShadow(ctx);
    ctx.fillStyle = INK;
    fit(ctx, r, widths[i] - 40, 30, 18, family);
    ctx.fillText(r, rx + widths[i] / 2, 357);
    rx += widths[i] + 16;
  });

  // ポートレート（少し傾けた写真風フレーム）
  const fx = 170;
  const fy = 410;
  const fw = 740;
  const fh = 560;
  ctx.save();
  ctx.translate(W / 2, fy + fh / 2);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.translate(-W / 2, -(fy + fh / 2));
  shadow(ctx, 30, 12, 0.18);
  ctx.fillStyle = "#fff";
  rr(ctx, fx - 22, fy - 22, fw + 44, fh + 44, 40);
  ctx.fill();
  noShadow(ctx);
  ctx.save();
  rr(ctx, fx, fy, fw, fh, 26);
  ctx.clip();
  const tint = isBreedId(d.breedId) ? ART[d.breedId].tint : "#fdf3e6";
  ctx.fillStyle = tint;
  ctx.fillRect(fx, fy, fw, fh);
  if (photo) {
    const s = Math.max(fw / photo.width, fh / photo.height);
    const pw = photo.width * s;
    const ph = photo.height * s;
    ctx.drawImage(photo, fx + (fw - pw) / 2, fy + (fh - ph) / 2, pw, ph);
  } else {
    const g = ctx.createRadialGradient(W / 2, fy + fh * 0.55, 40, W / 2, fy + fh * 0.55, 420);
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(fx, fy, fw, fh);
    const cat = await loadSvg(catSvg({ breed: d.breedId, uid: "card", face: d.rel.face, acc: d.rel.acc }), 900);
    ctx.drawImage(cat, W / 2 - 270, fy + 20, 540, 568);
  }
  ctx.restore();
  ctx.restore();

  // ステッカー
  const st = d.rel.stickers;
  const place: [number, number, number, number][] = [[150, 430, 92, -16], [935, 900, 96, 14], [120, 905, 70, 10], [960, 470, 64, 18]];
  ctx.textAlign = "center";
  place.forEach(([x, y, size, rot], i) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.font = `${size}px ${EMOJI}`;
    ctx.fillText(st[i % st.length], 0, size * 0.35);
    ctx.restore();
  });
  if (photo) {
    // 写真のときは、イラストの猫をバッジで添える
    const cat = await loadSvg(catSvg({ breed: d.breedId, uid: "badge", face: d.rel.face, acc: d.rel.acc }), 400);
    shadow(ctx, 16, 6, 0.18);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(860, 860, 96, 0, Math.PI * 2);
    ctx.fill();
    noShadow(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(860, 860, 88, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = c1;
    ctx.fillRect(760, 760, 200, 200);
    ctx.drawImage(cat, 772, 770, 176, 185);
    ctx.restore();
  }

  // 吹き出し（口ぐせ）
  ctx.font = `900 34px ${family}`;
  const qw = Math.min(ctx.measureText(`「${d.catLine}」`).width + 60, 520);
  const qx = W - 120 - qw;
  const qy = 396;
  shadow(ctx, 16, 5, 0.16);
  ctx.fillStyle = "#fff";
  rr(ctx, qx, qy, qw, 76, 38);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(qx + 60, qy + 70);
  ctx.lineTo(qx + 40, qy + 104);
  ctx.lineTo(qx + 96, qy + 72);
  ctx.fill();
  noShadow(ctx);
  ctx.fillStyle = accent;
  fit(ctx, `「${d.catLine}」`, qw - 44, 34, 20, family);
  ctx.fillText(`「${d.catLine}」`, qx + qw / 2, qy + 50);

  // 名前プレート
  ctx.font = `900 60px ${family}`;
  const nw = Math.min(Math.max(ctx.measureText(d.name).width + 120, 360), 760);
  shadow(ctx, 18, 6, 0.16);
  ctx.fillStyle = "#fff";
  rr(ctx, W / 2 - nw / 2, 950, nw, 112, 56);
  ctx.fill();
  noShadow(ctx);
  ctx.fillStyle = INK;
  fit(ctx, d.name, nw - 80, 58, 30, family);
  ctx.fillText(d.name, W / 2, 1010);
  ctx.fillStyle = "#a08f84";
  fit(ctx, d.breedLabel, nw - 80, 24, 16, family, 700);
  ctx.fillText(d.breedLabel, W / 2, 1046);

  // 下段：レーダーとあるある
  shadow(ctx, 20, 6, 0.1);
  ctx.fillStyle = "rgba(255,255,255,.94)";
  rr(ctx, 60, 1080, W - 120, 214, 36);
  ctx.fill();
  noShadow(ctx);
  radar(ctx, 205, 1186, 60, d.axes, accent, family);
  ctx.textAlign = "left";
  d.aruaru.slice(0, 2).forEach((a, i) => {
    const y = 1102 + i * 94;
    ctx.font = `900 21px ${family}`;
    const lw = ctx.measureText(a.label).width + 28;
    ctx.fillStyle = accent;
    rr(ctx, 360, y, lw, 34, 17);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(a.label, 374, y + 25);
    ctx.fillStyle = INK;
    fit(ctx, a.text, W - 120 - 360 - 30, 30, 18, family);
    ctx.fillText(a.text, 362, y + 72);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(75,58,51,.62)";
  ctx.font = `700 22px ${family}`;
  ctx.fillText("#猫様との関係診断　あなたの家の猫様は？", W / 2, 1328);
  return cv;
}

/** 9:16 のストーリーズ用（1080×1920） */
export async function drawStory(d: CardData, photo?: CardPhoto | null): Promise<HTMLCanvasElement> {
  const card = await drawCard(d, photo);
  const family = getComputedStyle(document.body).fontFamily;
  const [c1, c2, accent] = d.rel.theme;
  const W = 1080;
  const H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(1, c2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `900 56px ${family}`;
  ctx.fillText("うちの子との関係、", W / 2, 170);
  ctx.fillText("診断してみた", W / 2, 246);
  shadow(ctx, 40, 16, 0.2);
  ctx.save();
  rr(ctx, 70, 300, 940, 1175, 48);
  ctx.clip();
  noShadow(ctx);
  ctx.drawImage(card, 70, 300, 940, 1175);
  ctx.restore();
  noShadow(ctx);
  shadow(ctx, 16, 6, 0.16);
  ctx.fillStyle = "#fff";
  rr(ctx, 170, 1560, 740, 120, 60);
  ctx.fill();
  noShadow(ctx);
  ctx.fillStyle = accent;
  ctx.font = `900 42px ${family}`;
  ctx.fillText("あなたの猫様は？", W / 2, 1636);
  ctx.fillStyle = "rgba(75,58,51,.7)";
  ctx.font = `700 32px ${family}`;
  ctx.fillText("主従研究所で診断　#猫様との関係診断", W / 2, 1760);
  return cv;
}
