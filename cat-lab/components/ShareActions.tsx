"use client";

import { useState } from "react";
import { AXES, AXIS_ORDER } from "@/lib/questions";
import type { AxisScores } from "@/lib/scoring";
import { HASHTAG, SITE_NAME } from "@/lib/site";

type Props = {
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

const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP","Noto Serif JP","IPAMincho",serif';
const SANS = '"Hiragino Sans","Yu Gothic","Noto Sans CJK JP","Noto Sans JP","IPAGothic",sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 99): number {
  let line = "";
  let lines = 0;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      lines += 1;
      line = ch;
      if (lines >= maxLines) return y;
    } else {
      line += ch;
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

function drawCard(p: Props): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#f5eedf";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fffcf5";
  ctx.fillRect(48, 48, W - 96, H - 96);
  ctx.strokeStyle = "#2a2521";
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.strokeStyle = "#d8ccb6";
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 66, W - 132, H - 132);

  ctx.textAlign = "center";
  ctx.fillStyle = "#7a6e62";
  ctx.font = `28px ${SERIF}`;
  ctx.fillText(`${SITE_NAME}　関係性鑑定課`, W / 2, 140);
  ctx.fillStyle = "#2a2521";
  ctx.font = `bold 56px ${SERIF}`;
  ctx.fillText("主 従 関 係 　鑑 定 調 書", W / 2, 215);
  ctx.strokeStyle = "#2a2521";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(110, 245); ctx.lineTo(W - 110, 245); ctx.moveTo(110, 252); ctx.lineTo(W - 110, 252); ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#7a6e62";
  ctx.font = `22px ${SANS}`;
  ctx.fillText("対象猫", 120, 305);
  ctx.fillText("下僕", 520, 305);
  ctx.fillStyle = "#2a2521";
  ctx.font = `bold 38px ${SERIF}`;
  wrap(ctx, p.cat, 120, 350, 360, 44, 1);
  wrap(ctx, p.owner, 520, 350, 320, 44, 1);

  ctx.textAlign = "center";
  ctx.fillStyle = "#7a6e62";
  ctx.font = `22px ${SANS}`;
  ctx.fillText("判　定　タ　イ　プ", W / 2, 440);
  ctx.fillStyle = "#2a2521";
  let size = 78;
  ctx.font = `900 ${size}px ${SERIF}`;
  while (ctx.measureText(p.typeName).width > W - 240 && size > 40) {
    size -= 2;
    ctx.font = `900 ${size}px ${SERIF}`;
  }
  ctx.fillText(p.typeName, W / 2, 530);
  ctx.fillStyle = "#b3302a";
  ctx.font = `bold 32px ${SERIF}`;
  wrap(ctx, `「${p.catchCopy}」`, W / 2, 590, W - 220, 42, 2);

  // grade band
  ctx.fillStyle = "#2a2521";
  ctx.fillRect(110, 660, W - 220, 120);
  ctx.fillStyle = "#cfc4b0";
  ctx.font = `20px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("下僕等級", 140, 700);
  ctx.fillStyle = "#fffcf5";
  ctx.font = `900 48px ${SERIF}`;
  ctx.fillText(p.gradeName, 140, 758);
  ctx.textAlign = "right";
  ctx.fillStyle = "#cfc4b0";
  ctx.font = `20px ${SANS}`;
  ctx.fillText("猫様の支配率", W - 140, 700);
  ctx.fillStyle = "#fffcf5";
  ctx.font = `900 56px ${SERIF}`;
  ctx.fillText(`${p.sovereignty}%`, W - 140, 758);

  // axes
  let y = 840;
  for (const a of AXIS_ORDER) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#2a2521";
    ctx.font = `bold 26px ${SERIF}`;
    ctx.fillText(AXES[a].name, 120, y);
    ctx.textAlign = "right";
    ctx.fillText(`${p.axes[a]}%`, W - 120, y);
    ctx.fillStyle = "#ebe2cf";
    ctx.fillRect(120, y + 12, W - 240, 18);
    ctx.fillStyle = "#3a332d";
    ctx.fillRect(120, y + 12, ((W - 240) * p.axes[a]) / 100, 18);
    ctx.strokeStyle = "#d8ccb6";
    ctx.lineWidth = 2;
    ctx.strokeRect(120, y + 12, W - 240, 18);
    y += 76;
  }

  // evidence
  ctx.fillStyle = "#f3dcd6";
  ctx.fillRect(110, 1125, W - 220, 125);
  ctx.strokeStyle = "#e3b9b0";
  ctx.strokeRect(110, 1125, W - 220, 125);
  ctx.fillStyle = "#b3302a";
  ctx.fillRect(130, 1111, 150, 28);
  ctx.fillStyle = "#fff";
  ctx.font = `bold 18px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("決定的証拠", 205, 1132);
  ctx.textAlign = "left";
  ctx.fillStyle = "#2a2521";
  ctx.font = `bold 24px ${SERIF}`;
  wrap(ctx, p.evidence, 135, 1178, W - 270, 34, 3);

  ctx.textAlign = "center";
  ctx.fillStyle = "#7a6e62";
  ctx.font = `20px ${SANS}`;
  ctx.fillText(`調書番号 ${p.docNo}　／　${p.date}　／　${HASHTAG}`, W / 2, 1272);

  // stamp
  ctx.save();
  ctx.translate(912, 335);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.strokeStyle = "#b3302a";
  ctx.fillStyle = "#b3302a";
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 59, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = `900 46px ${SERIF}`;
  ctx.fillText("認定", 0, 16);
  ctx.font = `14px ${SERIF}`;
  ctx.fillText("主従研究所", 0, -26);
  ctx.restore();

  return c;
}

export function ShareActions(props: Props) {
  const [msg, setMsg] = useState("");
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2800);
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
    try {
      const canvas = drawCard(props);
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
      flash("調書を画像で保存しました");
    } catch {
      flash("画像の保存に失敗しました");
    }
  }

  function shareX() {
    const text = `うちの猫「${props.cat}」は【${props.typeName}】、私の下僕等級は【${props.gradeName}】でした（猫様の支配率${props.sovereignty}%）\n${HASHTAG}`;
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(resultUrl())}`;
    window.open(u, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="actions">
        <button className="btn" type="button" onClick={saveImage}>調書を画像で保存する</button>
        <div className="actions two" style={{ marginTop: 0 }}>
          <button className="btn ghost small" type="button" onClick={shareX}>Xでシェア</button>
          <button className="btn ghost small" type="button" onClick={() => copy(resultUrl(), "結果のリンクをコピーしました")}>結果リンクをコピー</button>
        </div>
        <button className="btn ghost" type="button" onClick={() => copy(challengeUrl(), "挑戦状のリンクをコピーしました。友達に送ってください")}>
          友達に「比べてみて」と挑戦状を送る
        </button>
      </div>
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
