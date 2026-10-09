// P3 Pitch — result share card (1200×630 PNG drawn on <canvas>).
//
// prepareShareCard(): pure data preparation (word, dictionary H/L, normalised pitch curve,
// mora boundaries, verdict, short reason) — tested in test/share.test.js without a canvas.
// drawShareCard(ctx, data): draws only from that data (light theme, system Japanese fonts).
// mountShare(): the 「カード画像を作る」 UI. The card always appears as an <img> preview
// (long-press / right-click to save works everywhere, including the claude.ai Artifact);
// 「共有」 when navigator.canShare({ files }) says yes, else a download button in a top-level
// page. No personal data (no file name), no audio, nothing sent anywhere.
import { pitchPattern } from '../src/accent.js';
import { dropJa, typeLabel, downloadCapable, saveBlob } from './anki.js';

export const CARD_W = 1200;
export const CARD_H = 630;
export const CARD_MARK = 'Pitch · free beta';
export const CARD_FILENAME = 'pitch-card.png';
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
// Light-theme tokens from demo/template.html — the card is light whatever the page theme.
const C = {
  bg: '#f3f6f8', surface: '#ffffff', surface2: '#e9eef2', ink: '#16212a', muted: '#56636d', line: '#d3dce2',
  accent: '#1c5a86', hiBand: '#e1ecf5', dict: '#6b7881', ok: '#1d7748', okSoft: '#dff2e7', ng: '#b2352c', ngSoft: '#f8e3e0',
};

const SHORT_REASON = {
  match: '下がり目の位置が辞書と一致',
  'missing-drop': '下がり目がありませんでした',
  'unexpected-drop': '下がらずに続けるのが正解です',
  'drop-too-early': '下がるのが早すぎます',
  'drop-too-late': '下がるのが遅すぎます',
};

/**
 * Card data from one judgement. result: judge() output; track: { times } of the F0 track
 * (result.st is per frame). Returns null for an error result.
 */
export function prepareShareCard({ word: w, result: r, track }) {
  if (!w || !r || r.error || !Array.isArray(r.segments) || r.segments.length === 0) return null;
  const n = w.morae.length;
  const labels = [...w.morae, 'が'];
  const k0 = r.expectedK?.[0] ?? w.accent[0];
  const pattern = pitchPattern(k0, n);
  const segs = r.segments;
  const t0 = segs[0].start - 0.12, t1 = segs[segs.length - 1].end + 0.12;
  const vals = segs.map((s) => s.value).filter((v) => Number.isFinite(v));
  const ref = vals.length ? Math.min(...vals) : 0;
  const curveRaw = [];
  if (track?.times && r.st) {
    track.times.forEach((t, i) => {
      const st = r.st[i];
      curveRaw.push(!Number.isFinite(st) || t < t0 || t > t1 ? null : [t, st - ref]);
    });
  }
  const ys = [...curveRaw.filter(Boolean).map((p) => p[1]), ...vals.map((v) => v - ref)];
  const lo = Math.min(-1, ...ys) - 0.5, hi = Math.max(4, ...ys) + 0.5;
  const X = (t) => (t - t0) / (t1 - t0);
  const Y = (st) => (st - lo) / (hi - lo); // 0 = bottom, 1 = top
  const r3 = (x) => Math.round(x * 1000) / 1000;
  // Drop the gaps' leading/trailing nulls; keep inner nulls as pen-up breaks.
  const curve = curveRaw.map((p) => (p ? [r3(X(p[0])), r3(Y(p[1]))] : null));
  while (curve.length && !curve[0]) curve.shift();
  while (curve.length && !curve[curve.length - 1]) curve.pop();
  const reasonLine = r.verdict === 'match'
    ? `辞書: ${typeLabel(k0, w)}`
    : `あなた: ${typeLabel(r.detectedK, w)} ／ 辞書: ${typeLabel(k0, w)}`;
  return {
    surface: w.surface,
    kanaGa: `${w.kana}が`,
    morae: labels,
    pattern, // 1 = H, 0 = L, word morae + が
    dropAfter: k0 > 0 ? k0 - 1 : -1, // index of the last high mora before the drop
    typeText: typeLabel(k0, w),
    dropText: dropJa(k0, w),
    pass: !!r.pass,
    verdictText: r.pass ? '✓ 合格' : '✗ もう一度',
    reason: SHORT_REASON[r.verdict] ?? '',
    reasonDetail: reasonLine,
    plot: {
      segments: segs.map((s, i) => ({
        label: labels[i] ?? s.label,
        x0: r3(X(s.start)), x1: r3(X(s.end)),
        y: Number.isFinite(s.value) ? r3(Y(s.value - ref)) : null,
        hi: !!pattern[i],
      })),
      curve,
      expectedDropX: k0 > 0 && segs[k0] ? r3(X(segs[k0].start)) : null,
      detectedDropX: r.detectedK > 0 && segs[r.detectedK] ? r3(X(segs[r.detectedK].start)) : null,
    },
    mark: CARD_MARK,
  };
}

// ---------- drawing ----------
const font = (px, weight = 400) => `${weight} ${px}px ${FONT}`;

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Largest font size ≤ max that fits text into width. */
function fitFont(ctx, text, width, max, min, weight) {
  let px = max;
  for (; px > min; px -= 2) {
    ctx.font = font(px, weight);
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = font(px, weight);
  return px;
}

/** Draw the 1200×630 card from prepareShareCard() data. Uses only the 2D context. */
export function drawShareCard(ctx, d) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = C.surface;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 32, 32, CARD_W - 64, CARD_H - 64, 24);
  ctx.fill();
  ctx.stroke();

  // ----- left: word, dictionary pattern, verdict -----
  const LX = 80, LW = 440;
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  fitFont(ctx, d.surface, LW, 104, 40, 700);
  ctx.fillText(d.surface, LX, 170);
  ctx.fillStyle = C.muted;
  fitFont(ctx, `「${d.kanaGa}」`, LW, 40, 20, 400);
  ctx.fillText(`「${d.kanaGa}」`, LX - 10, 228);

  // H/L boxes
  const m = d.morae.length;
  const gap = 6;
  const bw = Math.min(64, (LW - gap * (m - 1)) / m);
  const by = 256, bh = 86;
  d.morae.forEach((mora, i) => {
    const x = LX + i * (bw + gap);
    ctx.fillStyle = d.pattern[i] ? C.hiBand : C.surface2;
    roundRect(ctx, x, by, bw, bh, 8);
    ctx.fill();
    if (i === m - 1) { // particle が: dashed outline
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = C.dict;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    if (i === d.dropAfter) {
      ctx.fillStyle = C.dict;
      ctx.fillRect(x + bw - 4, by, 4, bh);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = d.pattern[i] ? C.accent : C.muted;
    ctx.font = font(Math.min(22, bw * 0.4), 700);
    ctx.fillText(d.pattern[i] ? 'H' : 'L', x + bw / 2, d.pattern[i] ? by + 26 : by + 42);
    ctx.fillStyle = C.ink;
    ctx.font = font(Math.min(30, bw * 0.55), 400);
    ctx.fillText(mora, x + bw / 2, by + bh - 12);
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  fitFont(ctx, `辞書 ${d.typeText}`, LW, 26, 16, 700);
  ctx.fillText(`辞書 ${d.typeText}`, LX, by + bh + 38);
  ctx.fillStyle = C.muted;
  fitFont(ctx, d.dropText, LW, 22, 14, 400);
  ctx.fillText(d.dropText, LX, by + bh + 70);

  // verdict box
  const vy = 440, vh = 136;
  ctx.fillStyle = d.pass ? C.okSoft : C.ngSoft;
  roundRect(ctx, LX - 8, vy, LW + 16, vh, 14);
  ctx.fill();
  ctx.fillStyle = d.pass ? C.ok : C.ng;
  ctx.font = font(44, 800);
  ctx.fillText(d.verdictText, LX + 10, vy + 56);
  ctx.fillStyle = C.ink;
  fitFont(ctx, d.reason, LW - 20, 24, 14, 600);
  ctx.fillText(d.reason, LX + 10, vy + 92);
  ctx.fillStyle = C.muted;
  fitFont(ctx, d.reasonDetail, LW - 20, 18, 12, 400);
  ctx.fillText(d.reasonDetail, LX + 10, vy + 120);

  // ----- right: pitch plot -----
  const P = { x: 580, y: 104, w: 548, h: 344 };
  const PX = (f) => P.x + f * P.w;
  const PY = (f) => P.y + (1 - f) * P.h;
  const top = P.y, bot = P.y + P.h;
  const segs = d.plot.segments;
  ctx.fillStyle = C.muted;
  ctx.font = font(20, 600);
  ctx.fillText('あなたの声の高さ', P.x, 76);
  ctx.fillStyle = C.accent;
  ctx.fillRect(P.x + 172, 68, 32, 4);
  ctx.fillStyle = C.hiBand;
  ctx.fillRect(P.x + 228, 60, 24, 18);
  ctx.fillStyle = C.muted;
  ctx.fillText('辞書で高い拍', P.x + 260, 76);
  segs.forEach((g) => {
    if (g.hi) { ctx.fillStyle = C.hiBand; ctx.fillRect(PX(g.x0), top, PX(g.x1) - PX(g.x0), bot - top); }
  });
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  const bounds = new Set();
  segs.forEach((g) => { bounds.add(g.x0); bounds.add(g.x1); });
  for (const b of bounds) {
    ctx.beginPath(); ctx.moveTo(PX(b), top); ctx.lineTo(PX(b), bot); ctx.stroke();
  }
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(P.x, bot); ctx.lineTo(P.x + P.w, bot); ctx.stroke();
  ctx.textAlign = 'center';
  segs.forEach((g) => {
    const cx = (PX(g.x0) + PX(g.x1)) / 2;
    ctx.fillStyle = g.hi ? C.accent : C.muted;
    ctx.font = font(18, 700);
    ctx.fillText(g.hi ? 'H' : 'L', cx, top + 22);
    ctx.fillStyle = C.ink;
    ctx.font = font(30, 400);
    ctx.fillText(g.label, cx, bot + 40);
  });
  // dictionary drop
  if (d.plot.expectedDropX != null) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = C.dict;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(PX(d.plot.expectedDropX), top); ctx.lineTo(PX(d.plot.expectedDropX), bot); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dict;
    ctx.font = font(18, 600);
    ctx.fillText('辞書↓', PX(d.plot.expectedDropX) + 6, bot - 10);
  }
  // your curve
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let pen = false;
  for (const p of d.plot.curve) {
    if (!p) { pen = false; continue; }
    if (pen) ctx.lineTo(PX(p[0]), PY(p[1])); else ctx.moveTo(PX(p[0]), PY(p[1]));
    pen = true;
  }
  ctx.stroke();
  for (const g of segs) {
    if (g.y == null) continue;
    ctx.beginPath();
    ctx.arc((PX(g.x0) + PX(g.x1)) / 2, PY(g.y), 8, 0, Math.PI * 2);
    ctx.fillStyle = C.accent;
    ctx.fill();
    ctx.strokeStyle = C.surface;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  if (d.plot.detectedDropX != null) {
    const c = d.pass ? C.ok : C.ng;
    const x = PX(d.plot.detectedDropX);
    ctx.strokeStyle = c;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = c;
    ctx.font = font(18, 700);
    ctx.fillText('あなた↓', x + 6, top + 48);
  }

  // mark
  ctx.textAlign = 'right';
  ctx.fillStyle = C.muted;
  ctx.font = font(20, 600);
  ctx.fillText(d.mark, CARD_W - 64, CARD_H - 60);
  ctx.restore();
}

/** Short alt text for the preview image. */
export const cardAlt = (d) => `共有カード: ${d.surface}（${d.kanaGa}）${d.verdictText}。${d.reason}。${d.reasonDetail}`;

// ---------- UI ----------
/** Wire #share-* in demo/template.html. Returns { judged(e) } for demo.js. */
export function mountShare() {
  const $ = (id) => document.getElementById(id);
  const make = $('share-make');
  if (!make) return { judged() {} };
  const out = $('share-out'), img = $('share-img'), status = $('share-status');
  const shareBtn = $('share-share'), dl = $('share-download');
  let last = null; // card data for the latest judgement
  let file = null;

  const reset = () => {
    out.hidden = true;
    img.removeAttribute('src');
    status.textContent = '';
    file = null;
  };
  const disable = () => { last = null; make.disabled = true; reset(); };
  disable();
  // Any new state (busy, idle after a word change, error) makes the card stale.
  new MutationObserver(() => { if ($('result').dataset.state !== 'done') disable(); })
    .observe($('result'), { attributes: true, attributeFilter: ['data-state'] });

  make.addEventListener('click', () => {
    if (!last) return;
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { status.textContent = 'この環境では画像を作れませんでした。'; return; }
    drawShareCard(ctx, last);
    img.src = canvas.toDataURL('image/png');
    img.alt = cardAlt(last);
    out.hidden = false;
    shareBtn.hidden = true;
    dl.hidden = true;
    status.textContent = '';
    canvas.toBlob((blob) => {
      if (!blob) return;
      file = typeof File === 'function' ? new File([blob], CARD_FILENAME, { type: 'image/png' }) : null;
      let canShare = false;
      try { canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch { canShare = false; }
      shareBtn.hidden = !canShare;
      dl.hidden = canShare || !downloadCapable();
    }, 'image/png');
  });

  shareBtn.addEventListener('click', async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'Pitch' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      status.textContent = '共有できませんでした。画像を長押し（右クリック）で保存してください。';
    }
  });
  dl.addEventListener('click', async () => {
    if (!file) return;
    if (!(await saveBlob(file, CARD_FILENAME))) status.textContent = '保存しませんでした。画像を長押し（右クリック）でも保存できます。';
  });

  return {
    judged(e) {
      reset();
      last = prepareShareCard(e);
      make.disabled = !last;
    },
  };
}
