"use client";

import { useState } from "react";
import { catSvg, getCoat, type Traits } from "@/lib/cat";
import { AXES, AXIS_ORDER } from "@/lib/questions";
import type { AxisScores } from "@/lib/scoring";
import { HASHTAG, SITE_NAME } from "@/lib/site";

type Props = {
  coat: string;
  traits: Traits;
  cat: string;
  owner: string;
  typeName: string;
  catchCopy: string;
  gradeName: string;
  sovereignty: number;
  axes: AxisScores;
  evidence: string;
  docNo: string;
  date: string;
  /** この結果のクエリ文字列（?a=...&n=...） */
  query: string;
  /** 友達への挑戦状リンクのクエリ */
  challengeQuery: string;
};

const INK = "#4a3a33";
const CORAL = "#ff7f66";
const BAR: Record<string, string> = { dom: "#ffc83d", amae: "#ff8fa3", mood: "#7fd1ae", demand: "#6db8f0" };

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  let line = "";
  let n = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      n += 1;
      if (n >= maxLines) {
        ctx.fillText(line.slice(0, -1) + "…", x, y);
        return;
      }
      ctx.fillText(line, x, y);
      y += lh;
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, min: number, family: string) {
  let size = start;
  ctx.font = `900 ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > min) {
    size -= 2;
    ctx.font = `900 ${size}px ${family}`;
  }
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg width="600" height="600" '));
  });
}

async function drawCard(p: Props): Promise<HTMLCanvasElement> {
  const family = getComputedStyle(document.body).fontFamily;
  const sample = `${p.cat}${p.owner}${p.typeName}${p.catchCopy}${p.gradeName}${p.evidence}主従研究所関係性鑑定調書判定タイプ下僕等級猫様の支配率0123456789%`;
  try {
    await Promise.all([500, 700, 900].map((w) => document.fonts.load(`${w} 32px ${family}`, sample)));
  } catch {
    /* フォントが読めなくても代替フォントで描画する */
  }
  const img = await loadSvg(catSvg({ coat: p.coat, uid: "card", traits: p.traits }));

  const W = 1080;
  const H = 1440;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#fff6e9";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,150,120,.16)";
  for (let y = 20; y < H; y += 40) for (let x = 20; x < W; x += 40) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }

  // card
  ctx.fillStyle = INK;
  rr(ctx, 54, 70, 972, 1326, 56); ctx.fill();
  ctx.fillStyle = "#fff";
  rr(ctx, 54, 54, 972, 1326, 56); ctx.fill();

  // tint top
  ctx.save();
  rr(ctx, 54, 54, 972, 1326, 56); ctx.clip();
  ctx.fillStyle = getCoat(p.coat).tint;
  ctx.fillRect(54, 54, 972, 428);
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let y = 70; y < 482; y += 44) for (let x = 70; x < 1026; x += 44) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(54, 482); ctx.lineTo(1026, 482); ctx.stroke();
  ctx.lineWidth = 8;
  rr(ctx, 54, 54, 972, 1326, 56); ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(74,58,51,.65)";
  ctx.font = `900 24px ${family}`;
  ctx.fillText(`${SITE_NAME}　関係性鑑定課`, W / 2, 112);
  ctx.fillStyle = INK;
  ctx.font = `900 30px ${family}`;
  ctx.fillText("主従関係　鑑定調書", W / 2, 152);

  ctx.drawImage(img, W / 2 - 180, 122, 360, 360);

  // paw stamp
  ctx.save();
  ctx.translate(900, 262);
  ctx.rotate((14 * Math.PI) / 180);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = CORAL;
  const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  ell(0, 10, 20, 15);
  ell(-27, -8, 8, 11, -0.35); ell(-11, -24, 8, 11, -0.1); ell(11, -24, 8, 11, 0.1); ell(27, -8, 8, 11, 0.35);
  ctx.fillStyle = INK;
  ctx.font = `900 17px ${family}`;
  ctx.fillText("認定", 0, 50);
  ctx.restore();

  // names
  ctx.fillStyle = "#8c786b";
  ctx.font = `700 26px ${family}`;
  const names = `対象猫「${p.cat}」　下僕「${p.owner}」`;
  fit(ctx, names, 860, 26, 18, family); ctx.font = ctx.font.replace("900", "700");
  ctx.fillText(names, W / 2, 526);

  ctx.fillStyle = "#ea6a50";
  ctx.font = `900 22px ${family}`;
  ctx.fillText("判　定　タ　イ　プ", W / 2, 566);
  ctx.fillStyle = INK;
  fit(ctx, p.typeName, 880, 76, 40, family);
  ctx.fillText(p.typeName, W / 2, 658);

  // catch pill
  ctx.font = `900 30px ${family}`;
  const cw = Math.min(ctx.measureText(`「${p.catchCopy}」`).width + 60, 900);
  ctx.fillStyle = INK; rr(ctx, W / 2 - cw / 2, 696, cw, 56, 28); ctx.fill();
  ctx.fillStyle = CORAL; rr(ctx, W / 2 - cw / 2, 691, cw, 56, 28); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 5; rr(ctx, W / 2 - cw / 2, 691, cw, 56, 28); ctx.stroke();
  ctx.fillStyle = "#fff";
  fit(ctx, `「${p.catchCopy}」`, 840, 30, 20, family);
  ctx.fillText(`「${p.catchCopy}」`, W / 2, 729);

  // grade boxes
  const box = (x: number, w: number, bg: string, label: string, value: string, vs: number) => {
    ctx.fillStyle = INK; rr(ctx, x, 806, w, 110, 26); ctx.fill();
    ctx.fillStyle = bg; rr(ctx, x, 800, w, 110, 26); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 5; rr(ctx, x, 800, w, 110, 26); ctx.stroke();
    ctx.fillStyle = "rgba(74,58,51,.7)";
    ctx.font = `900 20px ${family}`;
    ctx.fillText(label, x + w / 2, 834);
    ctx.fillStyle = INK;
    fit(ctx, value, w - 40, vs, 28, family);
    ctx.fillText(value, x + w / 2, 888);
  };
  box(100, 500, "#ffe58f", "あなたの下僕等級", p.gradeName, 48);
  box(630, 350, "#ffd9de", "猫様の支配率", `${p.sovereignty}%`, 56);

  // axes
  let y = 990;
  for (const a of AXIS_ORDER) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `900 28px ${family}`;
    ctx.fillText(`${AXES[a].icon} ${AXES[a].name}`, 110, y);
    ctx.textAlign = "right";
    ctx.fillText(`${p.axes[a]}%`, W - 110, y);
    const bx = 110, bw = W - 220;
    ctx.fillStyle = "#ffe9d2"; rr(ctx, bx, y + 12, bw, 22, 11); ctx.fill();
    if (p.axes[a] > 0) {
      ctx.fillStyle = BAR[a];
      rr(ctx, bx, y + 12, Math.max(22, (bw * p.axes[a]) / 100), 22, 11); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 4; rr(ctx, bx, y + 12, bw, 22, 11); ctx.stroke();
    y += 68;
  }

  // evidence
  ctx.fillStyle = INK; rr(ctx, 100, 1262, W - 200, 64, 22); ctx.fill();
  ctx.fillStyle = "#ffe58f"; rr(ctx, 100, 1256, W - 200, 64, 22); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 5; rr(ctx, 100, 1256, W - 200, 64, 22); ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `900 22px ${family}`;
  wrapText(ctx, `🔍 ${p.evidence}`, 130, 1296, W - 260, 30, 1);

  ctx.textAlign = "center";
  ctx.fillStyle = "#8c786b";
  ctx.font = `700 20px ${family}`;
  ctx.fillText(`${SITE_NAME}　${HASHTAG}　調書番号 ${p.docNo}`, W / 2, 1356);

  return c;
}

export function ShareActions(props: Props) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3200);
  };

  const origin = () => window.location.origin;
  const resultUrl = () => `${origin()}/chosho${props.query}`;
  const challengeUrl = () => `${origin()}/chosa${props.challengeQuery}`;

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(done);
    } catch {
      window.prompt("コピーしてお使いください", text);
    }
  }

  async function saveImage() {
    if (busy) return;
    setBusy(true);
    try {
      const canvas = await drawCard(props);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("no blob");
      const file = new File([blob], `chosho-${props.docNo}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try {
          await navigator.share({ files: [file], text: `${props.cat}の主従関係調書 ${HASHTAG}` });
          return;
        } catch {
          /* キャンセル時はダウンロードに切り替える */
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      flash("調書を画像で保存しました 🐾");
    } catch {
      flash("画像の保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function shareX() {
    const text = `うちの猫「${props.cat}」は【${props.typeName}】、私は【${props.gradeName}】でした（猫様の支配率${props.sovereignty}%）🐾\n${HASHTAG}`;
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(resultUrl())}`;
    window.open(u, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="actions">
        <button className="btn" type="button" onClick={saveImage} disabled={busy}>{busy ? "画像を作っています…" : "📸 調書を画像で保存する"}</button>
        <div className="actions two">
          <button className="btn ghost small" type="button" onClick={shareX}>Xでシェア</button>
          <button className="btn ghost small" type="button" onClick={() => copy(resultUrl(), "結果のリンクをコピーしました")}>結果リンクをコピー</button>
        </div>
        <button className="btn butter" type="button" onClick={() => copy(challengeUrl(), "挑戦状のリンクをコピーしました。友達に送ってね 🐾")}>
          💌 友達に「比べてみて！」と挑戦状を送る
        </button>
      </div>
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
