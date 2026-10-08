"use client";

import { useState } from "react";
import { ART, catSvg, isBreedId, type Traits } from "@/lib/cat";
import type { HumanOpts } from "@/lib/human";
import { AXES, AXIS_ORDER } from "@/lib/questions";
import { sceneSvg, type RelationId } from "@/lib/scenes";
import type { AxisScores } from "@/lib/scoring";
import { HASHTAG, SITE_NAME } from "@/lib/site";

export type ShareData = {
  breed: string;
  traits: Traits;
  rel: RelationId;
  variant: number;
  human: HumanOpts;
  catLine: string;
  humanLine: string;
  relName: string;
  catRole: string;
  humanRole: string;
  catchCopy: string;
  cat: string;
  owner: string;
  gradeName: string;
  sovereignty: number;
  axes: AxisScores;
  evidence: string;
  docNo: string;
  date: string;
  /** この結果のクエリ文字列（?a=...） */
  query: string;
  /** 友達への挑戦状リンクのクエリ */
  challengeQuery: string;
};

const INK = "#3b2a24";
const CORAL = "#ff6f61";
const BAR: Record<string, string> = { dom: "#ffc83d", amae: "#ff8fa3", mood: "#62d2a2", demand: "#6db8f0" };

// ---------- 描画の部品 ----------
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      out.push(line);
      line = ch;
      if (out.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (out.length < maxLines && line) out.push(line);
  else if (line && out.length === maxLines) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + "…";
  return out;
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

function loadSvg(svg: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${size}" height="${size}" `));
  });
}

function dotsBg(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  for (let y = 24; y < h; y += 44) for (let x = (y / 44) % 2 ? 24 : 46; x < w; x += 44) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill = "#fff") {
  ctx.fillStyle = INK;
  rr(ctx, x, y + 14, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  rr(ctx, x, y, w, h, r);
  ctx.stroke();
}

async function prepare(text: string) {
  const family = getComputedStyle(document.body).fontFamily;
  try {
    await Promise.all([700, 900].map((w) => document.fonts.load(`${w} 32px ${family}`, text)));
  } catch {
    /* フォントが読めなくても代替フォントで描画する */
  }
  return family;
}

const tint = (breed: string) => (isBreedId(breed) ? ART[breed].tint : "#fff0d6");

// ---------- 関係イラストのカード（4:5） ----------
async function drawRelationCard(p: ShareData): Promise<HTMLCanvasElement> {
  const family = await prepare(`あなたとの関係は…${p.cat}${p.relName}${p.catRole}${p.humanRole}${p.catLine}${p.humanLine}${SITE_NAME}${HASHTAG}＝　`);
  const sc = sceneSvg(p.rel, p.variant, { breed: p.breed, traits: p.traits, human: p.human, uid: "share" });
  const img = await loadSvg(sc.svg, 1000);

  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  dotsBg(ctx, W, H, tint(p.breed));
  card(ctx, 40, 36, 1000, 1262, 52);

  ctx.textAlign = "center";
  ctx.fillStyle = "#9a8070";
  ctx.font = `900 26px ${family}`;
  ctx.fillText(`${SITE_NAME}　関係性鑑定`, W / 2, 104);
  ctx.fillStyle = INK;
  fit(ctx, `あなたと${p.cat}の関係は…`, 900, 46, 30, family);
  ctx.fillText(`あなたと${p.cat}の関係は…`, W / 2, 160);

  const S = 900;
  const ox = 90;
  const oy = 190;
  ctx.save();
  rr(ctx, ox, oy, S, S, 34);
  ctx.clip();
  ctx.fillStyle = sc.bg;
  ctx.fillRect(ox, oy, S, S);
  ctx.drawImage(img, ox, oy, S, S);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  rr(ctx, ox, oy, S, S, 34);
  ctx.stroke();

  // 吹き出し
  const k = S / 400;
  for (const b of sc.bubbles) {
    const text = b.who === "cat" ? p.catLine : p.humanLine;
    ctx.font = `900 30px ${family}`;
    const w = b.w * k;
    let ls = lines(ctx, text, w - 36, 2);
    if (ls.length === 2 && !ls[1].endsWith("…")) {
      // 2行になるときは左右の長さをそろえる（1文字だけの行を作らない）
      const chars = [...text];
      const half = Math.ceil(chars.length / 2);
      const a = chars.slice(0, half).join("");
      const b = chars.slice(half).join("");
      if (ctx.measureText(a).width <= w - 36) ls = [a, b];
    }
    const h = 26 + ls.length * 40;
    const x = ox + (b.x - b.w / 2) * k;
    const y = oy + b.y * k;
    const tx = b.tail === "left" ? x + w * 0.28 : x + w * 0.72;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    rr(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 14, y + h - 3);
    ctx.lineTo(tx + (b.tail === "left" ? -10 : 10), y + h + 24);
    ctx.lineTo(tx + 14, y + h - 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 12, y + h - 8, 24, 8);
    ctx.fillStyle = INK;
    ls.forEach((l, i) => ctx.fillText(l, x + w / 2, y + 50 + i * 40));
  }

  // 関係の名前
  const size = fit(ctx, p.relName, 900, 86, 44, family);
  const nw = ctx.measureText(p.relName).width;
  ctx.fillStyle = "#ffe58f";
  rr(ctx, W / 2 - nw / 2 - 16, 1196 - size * 0.42, nw + 32, size * 0.5, 12);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(p.relName, W / 2, 1192);
  ctx.fillStyle = "#7a6458";
  const roles = p.catRole === p.humanRole ? `${p.cat}とあなたは、ふたりとも${p.catRole}` : `${p.cat}＝${p.catRole}　あなた＝${p.humanRole}`;
  fit(ctx, roles, 900, 32, 20, family, 700);
  ctx.fillText(roles, W / 2, 1244);
  ctx.fillStyle = "#b09a8c";
  ctx.font = `700 22px ${family}`;
  ctx.fillText(`${HASHTAG}　うちの子との関係、診断してみた`, W / 2, 1282);
  return c;
}

// ---------- ストーリーズ用（9:16） ----------
async function drawStory(p: ShareData): Promise<HTMLCanvasElement> {
  const base = await drawRelationCard(p);
  const family = getComputedStyle(document.body).fontFamily;
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  dotsBg(ctx, W, H, tint(p.breed));
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `900 54px ${family}`;
  ctx.fillText("うちの子との関係、", W / 2, 190);
  ctx.fillText("診断してみた🐾", W / 2, 262);
  ctx.drawImage(base, 54, 320, 972, 1215);
  ctx.fillStyle = CORAL;
  rr(ctx, 190, 1640, 700, 110, 55);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  rr(ctx, 190, 1640, 700, 110, 55);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `900 44px ${family}`;
  ctx.fillText(`${SITE_NAME}で診断 →`, W / 2, 1712);
  ctx.fillStyle = "#7a6458";
  ctx.font = `700 30px ${family}`;
  ctx.fillText(HASHTAG, W / 2, 1820);
  return c;
}

// ---------- 調書カード（4:5） ----------
async function drawChosho(p: ShareData): Promise<HTMLCanvasElement> {
  const family = await prepare(`${p.cat}${p.owner}${p.relName}${p.gradeName}${p.evidence}主従関係鑑定調書下僕等級猫様の支配率対象猫判定0123456789%`);
  const img = await loadSvg(catSvg({ breed: p.breed, uid: "chosho", traits: p.traits }), 600);
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  dotsBg(ctx, W, H, "#fff6e9");
  card(ctx, 50, 40, 980, 1260, 52);
  ctx.save();
  rr(ctx, 50, 40, 980, 1260, 52);
  ctx.clip();
  ctx.fillStyle = tint(p.breed);
  ctx.fillRect(50, 40, 980, 400);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(50, 440);
  ctx.lineTo(1030, 440);
  ctx.stroke();
  rr(ctx, 50, 40, 980, 1260, 52);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#9a8070";
  ctx.font = `900 24px ${family}`;
  ctx.fillText(`${SITE_NAME}　関係性鑑定課`, W / 2, 96);
  ctx.fillStyle = INK;
  ctx.font = `900 34px ${family}`;
  ctx.fillText("主従関係　鑑定調書", W / 2, 140);
  ctx.drawImage(img, W / 2 - 150, 150, 300, 300);

  ctx.fillStyle = "#7a6458";
  fit(ctx, `対象猫「${p.cat}」　下僕「${p.owner}」`, 860, 28, 18, family, 700);
  ctx.fillText(`対象猫「${p.cat}」　下僕「${p.owner}」`, W / 2, 492);
  ctx.fillStyle = "#e85a4f";
  ctx.font = `900 24px ${family}`;
  ctx.fillText("ふたりの関係", W / 2, 540);
  ctx.fillStyle = INK;
  fit(ctx, p.relName, 880, 72, 40, family);
  ctx.fillText(p.relName, W / 2, 616);

  const box = (x: number, w: number, bg: string, label: string, value: string, vs: number) => {
    ctx.fillStyle = INK;
    rr(ctx, x, 666, w, 112, 26);
    ctx.fill();
    ctx.fillStyle = bg;
    rr(ctx, x, 660, w, 112, 26);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    rr(ctx, x, 660, w, 112, 26);
    ctx.stroke();
    ctx.fillStyle = "rgba(59,42,36,.7)";
    ctx.font = `900 20px ${family}`;
    ctx.fillText(label, x + w / 2, 694);
    ctx.fillStyle = INK;
    fit(ctx, value, w - 40, vs, 26, family);
    ctx.fillText(value, x + w / 2, 750);
  };
  box(100, 500, "#ffe58f", "あなたの下僕等級", p.gradeName, 46);
  box(630, 350, "#ffd9de", "猫様の支配率", `${p.sovereignty}%`, 54);

  let y = 846;
  for (const a of AXIS_ORDER) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `900 28px ${family}`;
    ctx.fillText(`${AXES[a].icon} ${AXES[a].name}`, 110, y);
    ctx.textAlign = "right";
    ctx.fillText(`${p.axes[a]}%`, W - 110, y);
    const bx = 110;
    const bw = W - 220;
    ctx.fillStyle = "#ffe9d2";
    rr(ctx, bx, y + 12, bw, 22, 11);
    ctx.fill();
    ctx.fillStyle = BAR[a];
    rr(ctx, bx, y + 12, Math.max(22, (bw * p.axes[a]) / 100), 22, 11);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    rr(ctx, bx, y + 12, bw, 22, 11);
    ctx.stroke();
    y += 66;
  }

  ctx.fillStyle = INK;
  rr(ctx, 100, 1124, W - 200, 104, 24);
  ctx.fill();
  ctx.fillStyle = "#ffe58f";
  rr(ctx, 100, 1118, W - 200, 104, 24);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  rr(ctx, 100, 1118, W - 200, 104, 24);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `900 24px ${family}`;
  lines(ctx, `🔍 ${p.evidence}`, W - 260, 2).forEach((l, i) => ctx.fillText(l, 130, 1160 + i * 36));
  ctx.textAlign = "center";
  ctx.fillStyle = "#9a8070";
  ctx.font = `700 20px ${family}`;
  ctx.fillText(`${SITE_NAME}　${HASHTAG}　調書番号 ${p.docNo}`, W / 2, 1270);
  return c;
}

// ---------- 保存・共有 ----------
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function toFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("no blob");
  return new File([blob], name, { type: "image/png" });
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** スマホでは共有シートを開き、それ以外ではダウンロードする。共有シートを開いたら true */
async function shareOrDownload(file: File, text: string): Promise<boolean> {
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return true;
    }
  }
  download(file);
  return false;
}

function useToast() {
  const [msg, setMsg] = useState("");
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3600);
  };
  return { msg, flash };
}

const shareText = (p: ShareData) =>
  `うちの${p.cat}とわたしは【${p.relName}】でした🐾\n${p.catRole === p.humanRole ? `ふたりとも${p.catRole}` : `${p.cat}＝${p.catRole}、わたし＝${p.humanRole}`}\n${HASHTAG}`;

export function RelationShare(p: ShareData) {
  const { msg, flash } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const url = () => `${window.location.origin}/chosho${p.query}`;

  async function run(kind: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch {
      flash("画像の作成に失敗しました。もう一度お試しください");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const f = await toFile(await drawRelationCard(p), `kankei-${p.docNo}.png`);
      const shared = await shareOrDownload(f, shareText(p));
      if (!shared) flash("画像を保存しました 🐾");
    });

  const insta = () =>
    run("insta", async () => {
      const f = await toFile(await drawStory(p), `story-${p.docNo}.png`);
      const shared = await shareOrDownload(f, shareText(p));
      if (!shared) flash("ストーリーズ用の画像を保存しました。Instagramアプリから投稿してね 📸");
    });

  const x = () => {
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(p))}&url=${encodeURIComponent(url())}`;
    window.open(u, "_blank", "noopener,noreferrer");
  };
  const line = () => {
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      flash("結果のリンクをコピーしました");
    } catch {
      window.prompt("コピーしてお使いください", url());
    }
  };

  return (
    <div className="share">
      <button className="btn block" type="button" onClick={save} disabled={!!busy}>
        {busy === "save" ? "画像をつくっています…" : "📸 このイラストを画像で保存"}
      </button>
      <div className="sns">
        <button type="button" className="sns-btn insta" onClick={insta} disabled={!!busy}>
          <span aria-hidden="true">◎</span>{busy === "insta" ? "作成中…" : "Instagram"}
        </button>
        <button type="button" className="sns-btn x" onClick={x}><span aria-hidden="true">𝕏</span>ポスト</button>
        <button type="button" className="sns-btn line" onClick={line}><span aria-hidden="true">💬</span>LINE</button>
        <button type="button" className="sns-btn copy" onClick={copy}><span aria-hidden="true">🔗</span>リンク</button>
      </div>
      <p className="share-note">Instagramはストーリーズ用（縦長）の画像をつくります</p>
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}

export function ChoshoShare(p: ShareData) {
  const { msg, flash } = useToast();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await toFile(await drawChosho(p), `chosho-${p.docNo}.png`);
      const shared = await shareOrDownload(f, `${p.cat}の主従関係調書 ${HASHTAG}`);
      if (!shared) flash("調書を画像で保存しました 🐾");
    } catch {
      flash("画像の作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const challenge = async () => {
    const u = `${window.location.origin}/chosa${p.challengeQuery}`;
    const text = `うちの${p.cat}とわたしは【${p.relName}】だったよ。あなたの家の猫様は？🐾`;
    if (isMobile() && navigator.share) {
      try {
        await navigator.share({ text, url: u });
        return;
      } catch {
        /* キャンセル時はコピーに切り替える */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${u}`);
      flash("挑戦状をコピーしました。友達に送ってね 💌");
    } catch {
      window.prompt("コピーしてお使いください", u);
    }
  };
  return (
    <div className="share">
      <button className="btn butter block" type="button" onClick={save} disabled={busy}>{busy ? "画像をつくっています…" : "📜 調書を画像で保存"}</button>
      <button className="btn ghost block" type="button" onClick={challenge}>💌 友達に挑戦状を送る（比べっこ）</button>
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
