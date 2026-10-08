"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Rank = "UR" | "SSR" | "SR" | "R";
type Phase = "pack" | "charge" | "tear" | "done";

type Props = {
  img: string | null;
  alt: string;
  rank: Rank;
  name: string;
  /** 最初から開封済みで表示する（写真を入れた後など） */
  opened: boolean;
  onOpen: () => void;
};

const CHARGE_MS: Record<Rank, number> = { R: 700, SR: 900, SSR: 1300, UR: 1700 };
const PARTICLES: Record<Rank, number> = { R: 50, SR: 80, SSR: 130, UR: 190 };
const COLORS: Record<Rank, string[]> = {
  R: ["#ffb38a", "#ff8fa3", "#ffd66b", "#fff"],
  SR: ["#dfe7f2", "#b8c4d6", "#ffffff", "#ffd0dc", "#cde4ff"],
  SSR: ["#ffd66b", "#f5a623", "#fff3c4", "#ffffff", "#ffb38a"],
  UR: ["#ff9ac1", "#ffd66b", "#8fe0c9", "#a9a3ff", "#7cc8ff", "#ffffff"],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 紙吹雪（canvas） */
function burst(canvas: HTMLCanvasElement, rank: Rank) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const cols = COLORS[rank];
  const n = PARTICLES[rank];
  const ps = Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const sp = 6 + Math.random() * (rank === "UR" || rank === "SSR" ? 11 : 8);
    return {
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.45,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: cols[i % cols.length],
      shape: i % 7 === 0 ? 2 : i % 3,
      life: 0,
    };
  });
  const t0 = performance.now();
  const step = (t: number) => {
    const el = t - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.shape === 0) ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const rr = k % 2 ? p.r * 0.45 : p.r * 1.3;
          const a = (k * Math.PI) / 4;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fill();
      }
      ctx.restore();
    }
    if (el < 2700) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(step);
}

export function PackOpener({ img, alt, rank, name, opened, onOpen }: Props) {
  const [phase, setPhase] = useState<Phase>(opened ? "done" : "pack");
  const [drag, setDrag] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const confetti = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef(img);
  const start = useRef<{ x: number; t: number } | null>(null);
  imgRef.current = img;

  useEffect(() => {
    if (opened && phase === "pack") setPhase("done");
  }, [opened, phase]);

  const open = useCallback(async () => {
    if (phase !== "pack") return;
    // iOSでは傾きセンサーの許可をタップ中に求める必要がある
    const DO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    DO?.requestPermission?.().catch(() => {});
    if (reduced()) {
      setPhase("done");
      onOpen();
      return;
    }
    setPhase("charge");
    navigator.vibrate?.(15);
    await sleep(CHARGE_MS[rank]);
    while (!imgRef.current) await sleep(80);
    setPhase("tear");
    navigator.vibrate?.(rank === "UR" || rank === "SSR" ? [30, 40, 60] : 30);
    await sleep(380);
    if (confetti.current) burst(confetti.current, rank);
    onOpen();
    await sleep(900);
    setPhase("done");
  }, [phase, rank, onOpen]);

  // スワイプでも開封できる
  const onDown = (e: React.PointerEvent) => {
    if (phase !== "pack") return;
    start.current = { x: e.clientX, t: Date.now() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(-120, Math.min(120, e.clientX - start.current.x)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = Math.abs(e.clientX - start.current.x);
    const w = root.current?.clientWidth ?? 300;
    start.current = null;
    setDrag(0);
    if (dx < 8 || dx > w * 0.28) open();
  };

  // 開封後は、指やスマホの傾きでカードが立体的に動く
  useEffect(() => {
    if (phase !== "done") return;
    const el = cardRef.current;
    if (!el || reduced()) return;
    const set = (px: number, py: number) => {
      el.style.setProperty("--rx", `${(px - 0.5) * 18}deg`);
      el.style.setProperty("--ry", `${(0.5 - py) * 18}deg`);
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    const leave = () => set(0.5, 0.5);
    let base: { b: number; g: number } | null = null;
    const orient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      base ??= { b: e.beta, g: e.gamma };
      const px = 0.5 + Math.max(-0.5, Math.min(0.5, (e.gamma - base.g) / 40));
      const py = 0.5 + Math.max(-0.5, Math.min(0.5, (e.beta - base.b) / 40));
      set(px, py);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("deviceorientation", orient);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("deviceorientation", orient);
    };
  }, [phase]);

  return (
    <div ref={root} className={`opener ph-${phase} rk-${rank}`}>
      <div className="rays" aria-hidden="true" />
      <div className="flash" aria-hidden="true" />

      <div ref={cardRef} className="card3d">
        <div className="card-inner">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={alt} />
          ) : (
            <div className="rc-loading">カードをつくっています…</div>
          )}
          <div className="holo" aria-hidden="true" />
          <div className="gloss" aria-hidden="true" />
        </div>
      </div>

      {phase !== "done" && (
        <button
          type="button"
          className="pack"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { start.current = null; setDrag(0); }}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
          aria-label="パックを開封する"
          style={{ ["--drag" as string]: `${drag}px` }}
        >
          <span className="pack-top" aria-hidden="true">
            <span className="crimp" />
            <span className="pack-brand">主従研究所</span>
          </span>
          <span className="pack-seam" aria-hidden="true" />
          <span className="pack-body">
            <span className="pack-sub">あなたと{name}の</span>
            <span className="pack-title">関係カード</span>
            <span className="pack-emblem" aria-hidden="true">
              <svg viewBox="-12 -13 24 24"><g fill="#fff"><ellipse cx="0" cy="4" rx="7" ry="5.6" /><ellipse cx="-7.6" cy="-3.6" rx="2.8" ry="3.6" /><ellipse cx="-2.6" cy="-7.6" rx="2.8" ry="3.6" /><ellipse cx="2.6" cy="-7.6" rx="2.8" ry="3.6" /><ellipse cx="7.6" cy="-3.6" rx="2.8" ry="3.6" /></g></svg>
            </span>
            <span className="pack-hint">{phase === "pack" ? "タップ or 横にスワイプして開封" : rank === "UR" || rank === "SSR" ? "…！？" : "開封中…"}</span>
            <span className="crimp bottom" />
          </span>
        </button>
      )}

      <canvas ref={confetti} className="confetti" aria-hidden="true" />
      {(phase === "tear" || phase === "done") && <span className={`rarity-pop r-${rank}`} aria-hidden="true">{rank}</span>}
    </div>
  );
}
