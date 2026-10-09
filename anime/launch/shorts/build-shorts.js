// LEDGERBREAKER launch shorts — renders 3 vertical videos (1080x1920, 30fps, H.264, no audio).
//
// Usage:  node build-shorts.js            # build all three
//         node build-shorts.js 2          # build only short 2
//         SHORTS_WORK=/some/tmp node build-shorts.js
//         node build-shorts.js 1 --at=0.5,4,16   # preview stills only, no encode
//
// Frames and prepared assets go to $SHORTS_WORK (default: <os tmpdir>/ledgerbreaker-shorts), never the repo.
// Needs: Playwright (global), Google Fonts (network), /usr/bin/ffmpeg, pdftoppm (optional, for sharper book pages).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OUT = __dirname;
const ANIME = path.resolve(__dirname, '../..');
const WORK = process.env.SHORTS_WORK || path.join(os.tmpdir(), 'ledgerbreaker-shorts');
const ASSETS = path.join(WORK, 'assets');
const FFMPEG = '/usr/bin/ffmpeg';
const W = 1080, H = 1920, FPS = 30;
const PANEL_DIR = path.join(ANIME, 'webtoon/ep01/clean/color');
const FONTS = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=block';
const C = { red: '#E5172F', ivory: '#F5EEDD', ink: '#0E0B10', ash: '#9A958C' };

// Safe area (platform UI): top 250px, bottom 400px, right 150px (shorts-scripts.md common spec).
const SAFE = { top: 250, bottom: H - 400, left: 60, right: W - 150 };
const AY = 820; // vertical anchor for the camera focus point (centre of the picture zone)

// ---------- easing / helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0), 0, 1);
const pad = (n) => String(n).padStart(2, '0');

// ---------- asset preparation ----------
function svgSize(n) {
  const svg = fs.readFileSync(path.join(PANEL_DIR, `p${pad(n)}.svg`), 'utf8');
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  return [+w, +h];
}

async function preparePanels(browser, nums) {
  for (const n of nums) {
    const out = path.join(ASSETS, `p${pad(n)}.png`);
    if (fs.existsSync(out)) continue;
    const svg = fs.readFileSync(path.join(PANEL_DIR, `p${pad(n)}.svg`), 'utf8');
    const [w, h] = svgSize(n);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>html,body{margin:0;background:${C.ink}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out });
    await page.close();
    console.log('panel', path.basename(out), `${w * 2}x${h * 2}`);
  }
}

const BOOK_PAGES = [1, 5, 7, 10, 13, 15, 16, 17, 20, 25, 28, 30];
function prepareBook() {
  const pdf = path.join(ANIME, 'book/vol0-en.pdf');
  for (const n of BOOK_PAGES) {
    const out = path.join(ASSETS, `book-${pad(n)}.png`);
    if (fs.existsSync(out)) continue;
    try { // same pages as book/sample/pages, re-rasterised at 200dpi so they stay sharp at 1080 wide
      execFileSync('pdftoppm', ['-f', n, '-l', n, '-singlefile', '-png', '-r', '200', pdf, out.replace(/\.png$/, '')].map(String));
    } catch (e) {
      fs.copyFileSync(path.join(ANIME, `book/sample/pages/en-${pad(n)}.png`), out);
    }
  }
}

// Blurred, darkened full-frame backdrop for each picture (fills the 9:16 frame behind a panel).
async function prepareBackdrops(browser, files) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const f of files) {
    const out = path.join(ASSETS, 'bg-' + path.basename(f).replace(/\.png$/, '.jpg'));
    if (fs.existsSync(out)) continue;
    const tmp = path.join(WORK, 'backdrop.html'); // file:// page so the file:// image is allowed to load
    fs.writeFileSync(tmp, `<html><body style="margin:0;background:${C.ink};overflow:hidden">
<img src="file://${f}" style="position:absolute;left:-120px;top:-120px;width:${W + 240}px;height:${H + 240}px;object-fit:cover;filter:blur(42px) brightness(.3) saturate(1.15)"></body></html>`);
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.images[0].decode());
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
  }
  await page.close();
}

// ---------- the stage page ----------
function stageHTML(allText) {
  const mark = 'file://' + path.join(ANIME, 'visuals/ledger-mark.svg');
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>
:root{--red:${C.red};--ivory:${C.ivory};--ink:${C.ink};--ash:${C.ash}}
html,body{margin:0;background:var(--ink)}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--ink)}
#bg{position:absolute;inset:0;width:${W}px;height:${H}px}
#cam{position:absolute;left:0;top:0;transform-origin:0 0}
#pic{position:absolute;left:0;top:0;display:block;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#dim{position:absolute;inset:0;background:#000;opacity:0}
#book{position:absolute;left:0;top:0;width:${W}px;height:${H}px;perspective:2600px}
#book .pg{position:absolute;transform-origin:0 50%;backface-visibility:hidden;box-shadow:0 30px 90px rgba(0,0,0,.75)}
#book .pg img{display:block;width:100%;height:100%}
#book .pg .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,0) 60%);opacity:0}
#grad{position:absolute;left:0;right:0;bottom:0;height:900px;background:linear-gradient(180deg,rgba(14,11,16,0),rgba(14,11,16,.55) 45%,rgba(14,11,16,.85));opacity:0}
#flash{position:absolute;inset:0;opacity:0}
#hook{position:absolute;left:${SAFE.left}px;width:${SAFE.right - SAFE.left}px;top:${SAFE.top}px;height:${SAFE.bottom - SAFE.top}px;display:flex;flex-direction:column;justify-content:center;opacity:0;transform-origin:50% 50%}
#hook .en{font-family:'Dela Gothic One';font-size:92px;line-height:1.12;color:var(--ivory);text-shadow:0 6px 0 #000,0 0 40px rgba(0,0,0,.8);letter-spacing:.01em}
#hook .en .r{color:var(--red);text-shadow:0 6px 0 #000,0 0 36px rgba(229,23,47,.45)}
#hook .jp{margin-top:34px;font-family:'Zen Kaku Gothic New';font-weight:900;font-size:42px;color:var(--ivory);background:rgba(14,11,16,.82);display:inline-block;align-self:flex-start;padding:10px 18px;border-left:8px solid var(--red)}
#cap{position:absolute;left:${SAFE.left}px;bottom:${H - SAFE.bottom}px;max-width:${SAFE.right - SAFE.left}px;opacity:0;background:rgba(14,11,16,.86);border-left:10px solid var(--red);padding:22px 30px 24px;box-sizing:border-box}
#cap .en{font-family:'Dela Gothic One';font-size:56px;line-height:1.16;color:var(--ivory)}
#cap .jp{margin-top:12px;font-family:'Zen Kaku Gothic New';font-weight:700;font-size:34px;line-height:1.35;color:rgba(245,238,221,.88)}
#cap.big .en{font-size:74px;color:var(--ivory)}
#cap.big .jp{font-size:40px}
#cap.mono .en{font-family:'IBM Plex Mono';font-weight:700;letter-spacing:.02em}
#price,#card{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 80% 45% at 50% 42%,#3A0E16 0%,#1A0D12 55%,var(--ink) 100%)}
.col{position:absolute;left:${SAFE.left}px;width:${SAFE.right - SAFE.left}px;top:${SAFE.top}px;height:${SAFE.bottom - SAFE.top}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mark{width:300px;height:300px;border-radius:50%;box-shadow:0 0 90px rgba(229,23,47,.35)}
.logo{margin-top:34px;font-family:'Dela Gothic One';font-size:80px;color:var(--red);letter-spacing:.02em;white-space:nowrap;text-shadow:0 0 34px rgba(229,23,47,.5)}
.logo-jp{margin-top:6px;font-family:'Zen Kaku Gothic New';font-weight:900;font-size:40px;letter-spacing:.5em;padding-left:.5em;color:var(--ivory)}
.rule{width:420px;height:3px;background:var(--red);margin:34px 0 30px;opacity:.85}
.title{font-family:'Dela Gothic One';font-size:54px;color:var(--ivory);white-space:nowrap}
.title-jp{margin-top:10px;font-family:'Zen Kaku Gothic New';font-weight:700;font-size:40px;color:var(--ivory)}
.kicker{font-family:'Dela Gothic One';font-size:46px;color:var(--ivory);margin-bottom:46px;opacity:.95}
.kicker small{display:block;font-family:'Zen Kaku Gothic New';font-weight:700;font-size:30px;margin-top:8px;opacity:.8}
.priceline{margin-top:30px;font-family:'IBM Plex Mono';font-weight:700;font-size:36px;color:var(--ivory)}
.bio{margin-top:38px;background:var(--red);color:var(--ivory);font-family:'Dela Gothic One';font-size:54px;padding:16px 46px 20px;border-radius:999px;box-shadow:0 10px 40px rgba(229,23,47,.35)}
.bio small{font-family:'Zen Kaku Gothic New';font-weight:900;font-size:30px;display:block;margin-top:2px}
.ai{margin-top:40px;font-family:'IBM Plex Mono';font-weight:500;font-size:24px;line-height:1.35;color:var(--ash);white-space:nowrap}
.ai span{display:block;margin-top:6px;font-family:'Zen Kaku Gothic New';font-weight:700;font-size:28px}
#price .big{font-family:'Dela Gothic One';font-size:150px;line-height:1;color:var(--ivory)}
#price .big .r{color:var(--red)}
#price .where{font-family:'Dela Gothic One';font-size:56px;color:var(--ivory);margin-top:14px}
#price .sub{font-family:'Zen Kaku Gothic New';font-weight:700;font-size:34px;color:rgba(245,238,221,.85);margin-top:8px}
#price .or{font-family:'IBM Plex Mono';font-weight:700;font-size:34px;color:var(--ash);margin:44px 0}
#price .spec{margin-top:56px;font-family:'IBM Plex Mono';font-weight:700;font-size:34px;color:var(--ivory)}
#preload{position:absolute;left:-9999px;top:0;width:4000px;visibility:hidden}
</style></head><body><div id="stage">
<img id="bg">
<div id="cam"><img id="pic"></div>
<div id="book"><div id="under" class="pg"><img><div class="shade"></div></div><div id="flip" class="pg"><img><div class="shade"></div></div></div>
<div id="dim"></div>
<div id="grad"></div>
<div id="flash"></div>
<div id="hook"><div class="en"></div><div class="jp"></div></div>
<div id="cap"><div class="en"></div><div class="jp"></div></div>
<div id="price"><div class="col">
  <div class="big">¥500</div><div class="where">on BOOTH</div><div class="sub">日本語版 · 通常版</div>
  <div class="or">— or —</div>
  <div class="big"><span class="r">$4</span></div><div class="where">on Ko-fi</div><div class="sub">English edition</div>
  <div class="spec">A5 · 30 pages · PDF</div>
</div></div>
<div id="card"><div class="col">
  <div class="kicker" id="kicker"></div>
  <img class="mark" src="${mark}">
  <div class="logo" id="logo">LEDGERBREAKER</div>
  <div class="logo-jp">帳簿破り</div>
  <div class="rule"></div>
  <div class="title" id="title">Book of the Ledger Vol.0</div>
  <div class="title-jp">帳簿の書 Vol.0</div>
  <div class="priceline" id="priceline"></div>
  <div class="bio">LINK IN BIO<small>リンクはプロフィールから</small></div>
  <div class="ai">Made entirely with generative AI · reviewed by the creator<span>すべて生成AIで制作（作者が確認・選定）</span></div>
</div></div>
<div id="preload"><span style="font-family:'Dela Gothic One'">${allText}</span><span style="font-family:'Zen Kaku Gothic New';font-weight:700">${allText}</span><span style="font-family:'Zen Kaku Gothic New';font-weight:900">${allText}</span><span style="font-family:'IBM Plex Mono';font-weight:700">${allText}</span><span style="font-family:'IBM Plex Mono';font-weight:500">${allText}</span></div>
</div>
<script>
const $ = (s) => document.querySelector(s);
function fitWidth(el, max, min) { // shrink font until the element fits max px
  el.style.fontSize = ''; let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > max && fs > min) { fs -= 2; el.style.fontSize = fs + 'px'; }
}
const last = {};
function setSrc(img, src) { if (img.dataset.src !== (src || '')) { img.dataset.src = src || ''; if (src) img.src = 'file://' + src; else img.removeAttribute('src'); } }
window.apply = async (s) => {
  setSrc($('#bg'), s.bg); $('#bg').style.opacity = s.bg ? (s.bgOp ?? 1) : 0;
  const pic = $('#pic');
  if (s.pic) {
    setSrc(pic, s.pic.src); pic.style.display = 'block';
    pic.style.width = s.pic.w + 'px'; pic.style.height = s.pic.h + 'px';
    pic.style.transform = 'translate(' + s.pic.x + 'px,' + s.pic.y + 'px)';
  } else pic.style.display = 'none';
  $('#dim').style.opacity = s.dim || 0;
  const book = $('#book');
  if (s.book) {
    book.style.display = 'block';
    for (const id of ['under', 'flip']) {
      const b = s.book[id], el = $('#' + id);
      if (!b) { el.style.display = 'none'; continue; }
      el.style.display = 'block'; setSrc(el.querySelector('img'), b.src);
      el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
      el.style.transform = 'rotateY(' + (b.rot || 0) + 'deg)';
      el.querySelector('img').style.filter = b.blur ? 'blur(' + b.blur + 'px)' : 'none';
      el.querySelector('.shade').style.opacity = b.shade || 0;
    }
  } else book.style.display = 'none';
  $('#grad').style.opacity = s.grad ?? 1;
  $('#flash').style.opacity = s.flash || 0; $('#flash').style.background = s.flashColor || '#fff';
  const stage = $('#stage');
  // hook
  const hook = $('#hook');
  if (s.hook) {
    if (last.hook !== s.hook.en) { hook.querySelector('.en').innerHTML = s.hook.en; hook.querySelector('.jp').textContent = s.hook.jp; fitWidth(hook.querySelector('.en'), ${SAFE.right - SAFE.left}, 50); last.hook = s.hook.en; }
    hook.style.opacity = s.hook.op; hook.style.transform = 'scale(' + s.hook.scale + ')';
  } else hook.style.opacity = 0;
  // caption
  const cap = $('#cap');
  if (s.cap) {
    const key = s.cap.en + '|' + s.cap.jp + '|' + (s.cap.cls || '');
    if (last.cap !== key) { cap.querySelector('.en').innerHTML = s.cap.en; cap.querySelector('.jp').textContent = s.cap.jp; cap.className = s.cap.cls || ''; fitWidth(cap.querySelector('.en'), ${SAFE.right - SAFE.left - 40}, 36); last.cap = key; }
    cap.style.opacity = s.cap.op; cap.style.transform = 'translateY(' + s.cap.dy + 'px)';
  } else cap.style.opacity = 0;
  $('#price').style.opacity = s.price ? s.price.op : 0;
  $('#price').style.transform = s.price ? 'scale(' + s.price.scale + ')' : '';
  const card = $('#card');
  if (s.card) {
    if (last.card !== JSON.stringify(s.card.opts)) {
      const o = s.card.opts; $('#kicker').innerHTML = o.kicker || ''; $('#kicker').style.display = o.kicker ? 'block' : 'none';
      $('#priceline').textContent = o.price || ''; $('#priceline').style.display = o.price ? 'block' : 'none';
      fitWidth($('#logo'), 860, 40); fitWidth($('#title'), 860, 30); last.card = JSON.stringify(o);
    }
    card.style.opacity = s.card.op; card.querySelector('.col').style.transform = 'scale(' + s.card.scale + ')';
  } else card.style.opacity = 0;
  stage.style.transform = s.shake ? 'translate(' + s.shake[0] + 'px,' + s.shake[1] + 'px)' : '';
  await Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().catch(() => {})));
};
</script></body></html>`;
}

// ---------- shot builders ----------
// A panel shot: camera keyframes {z, fx, fy}; z = displayed width / 1080, (fx,fy) = point of the image placed at (540, AY).
function panelShot(n, t0, t1, from, to, opts = {}) {
  const [sw, sh] = svgSize(n);
  return { kind: 'panel', src: path.join(ASSETS, `p${pad(n)}.png`), bg: path.join(ASSETS, `bg-p${pad(n)}.jpg`), ar: sh / sw, t0, t1, from, to, ...opts };
}
function cameraFor(shot, t) {
  const k = ease(prog(t, shot.t0, shot.t1));
  let z = lerp(shot.from.z, shot.to.z, k);
  const fx = lerp(shot.from.fx ?? 0.5, shot.to.fx ?? 0.5, k);
  const fy = lerp(shot.from.fy ?? 0.5, shot.to.fy ?? 0.5, k);
  let shake = null, flash = 0;
  for (const p of shot.punch || []) { // punch-in: fast zoom kick that settles to a held push
    if (t < p.t) continue;
    const d = t - p.t;
    const kick = d < 0.08 ? easeOut(d / 0.08) : 1 - (1 - (p.hold ?? 0.6)) * easeOut(clamp((d - 0.08) / 0.5, 0, 1));
    z *= 1 + p.amp * kick;
    if (d < (p.shakeDur ?? 0.35)) {
      const a = (p.shake ?? 18) * (1 - d / (p.shakeDur ?? 0.35));
      shake = [Math.round(Math.sin(d * 97) * a), Math.round(Math.cos(d * 131) * a)];
    }
    if (p.flash && d < 0.22) flash = Math.max(flash, p.flash * (1 - d / 0.22));
  }
  const w = W * z, h = w * shot.ar;
  let x = W / 2 - fx * w, y = AY - fy * h;
  if (w >= W) x = clamp(x, W - w, 0); else x = (W - w) / 2;
  if (h >= H) y = clamp(y, H - h, 0);
  return { pic: { src: shot.src, w: Math.round(w), h: Math.round(h), x: Math.round(x), y: Math.round(y) }, shake, flash, flashColor: (shot.punch || []).find((p) => t >= p.t)?.flashColor };
}

function capAt(caps, t) {
  for (const c of caps) {
    if (t >= c.t0 && t < c.t1) {
      const fin = easeOut(prog(t, c.t0, c.t0 + 0.2));
      const fout = c.t1 - t < 0.12 && !c.hold ? (c.t1 - t) / 0.12 : 1;
      return { en: c.en, jp: c.jp, cls: c.cls, op: Math.min(fin, fout), dy: Math.round((1 - fin) * 24) };
    }
  }
  return null;
}

function hookAt(hook, t) {
  if (!hook || t >= hook.t1) return null;
  const k = easeOut(prog(t, hook.t0, hook.t0 + 0.28));
  const out = hook.t1 - t < 0.15 ? (hook.t1 - t) / 0.15 : 1;
  return { en: hook.en, jp: hook.jp, op: Math.min(k, out), scale: (1.18 - 0.18 * k).toFixed(4) };
}

function cardAt(card, t) {
  if (!card || t < card.t0) return null;
  const k = easeOut(prog(t, card.t0, card.t0 + 0.4));
  return { op: k, scale: (1.05 - 0.05 * k).toFixed(4), opts: card.opts };
}

// ---------- the three shorts ----------
const T_HOOK = 1.5;
const CARD = (t0, opts = {}) => ({ t0, opts });

function short1() {
  const shots = [
    panelShot(1, 0, 1.5, { z: 1.9, fx: 0.82, fy: 0.12 }, { z: 1.5, fx: 0.7, fy: 0.2 }, { dim: 0.62 }),
    panelShot(1, 1.5, 5.0, { z: 1.2, fx: 0.5, fy: 0.3 }, { z: 1.12, fx: 0.5, fy: 0.68 }),
    panelShot(2, 5.0, 8.5, { z: 1.15, fx: 0.5, fy: 0.25 }, { z: 1.15, fx: 0.5, fy: 0.62 }),
    panelShot(3, 8.5, 11.5, { z: 1.08, fx: 0.5, fy: 0.4 }, { z: 1.25, fx: 0.62, fy: 0.6 }),
    panelShot(4, 11.5, 15.0, { z: 1.08, fx: 0.5, fy: 0.5 }, { z: 1.3, fx: 0.62, fy: 0.4 }),
    panelShot(5, 15.0, 18.5, { z: 1.1, fx: 0.45, fy: 0.42 }, { z: 1.15, fx: 0.45, fy: 0.55 }, { punch: [{ t: 15.5, amp: 0.22, hold: 0.7, flash: 0.85, shake: 22 }] }),
    panelShot(6, 18.5, 21.5, { z: 1.3, fx: 0.35, fy: 0.5 }, { z: 1.2, fx: 0.62, fy: 0.5 }),
  ];
  return {
    name: 'short1-voice-taken', dur: 25, shots,
    hook: { t0: 0, t1: T_HOOK, en: 'IN THIS CITY, IF YOU CAN\'T PAY, <span class="r">THEY TAKE YOUR VOICE.</span>', jp: 'この街では、払えなければ〈声〉を取り立てられる。' },
    caps: [
      { t0: 1.5, t1: 3.3, en: 'Midnight. Collection Day.', jp: '午前0時。取立日。' },
      { t0: 3.3, t1: 5.0, en: 'The bell tolls thirteen times.', jp: '取立日の鐘が、十三回。' },
      { t0: 5.0, t1: 6.8, en: 'Every rank is public.', jp: '格付けは、全員に公開される。' },
      { t0: 6.8, t1: 8.5, en: 'Can\'t pay? Hand over your collateral.', jp: '返済不能者は、担保を提出せよ。' },
      { t0: 8.5, t1: 11.5, en: 'Every wrist shows what you owe.', jp: '手首には、借金の残高。' },
      { t0: 11.5, t1: 13.3, en: '"Collateral: voice. Overdue."', jp: '「担保：〈声〉。期日超過。」' },
      { t0: 13.3, t1: 15.0, en: '"Executing."', jp: '「執行する」' },
      { t0: 15.0, t1: 16.8, en: 'They take it.', jp: '取り立てられる。' },
      { t0: 16.8, t1: 18.5, en: '— and the sound is gone.', jp: '——音が、消えた。' },
      { t0: 18.5, t1: 21.5, en: 'Nobody stops them.', jp: '誰も、止めない。' },
    ],
    card: CARD(21.5, { kicker: 'ONE KID REFUSES TO PAY.<small>ひとりだけ、払わない少年がいる。</small>' }),
  };
}

function short2() {
  const shots = [
    panelShot(33, 0, 1.5, { z: 1.4, fx: 0.5, fy: 0.3 }, { z: 1.25, fx: 0.5, fy: 0.32 }, { dim: 0.72 }),
    panelShot(29, 1.5, 4.0, { z: 1.9, fx: 0.5, fy: 0.52 }, { z: 2.35, fx: 0.5, fy: 0.55 }),
    panelShot(30, 4.0, 7.0, { z: 1.2, fx: 0.55, fy: 0.25 }, { z: 1.25, fx: 0.55, fy: 0.55 }),
    panelShot(31, 7.0, 9.8, { z: 1.25, fx: 0.5, fy: 0.22 }, { z: 1.25, fx: 0.5, fy: 0.62 }),
    panelShot(32, 9.8, 12.3, { z: 2.3, fx: 0.25, fy: 0.5 }, { z: 2.3, fx: 0.72, fy: 0.5 }),
    panelShot(33, 12.3, 15.0, { z: 1.2, fx: 0.5, fy: 0.22 }, { z: 1.2, fx: 0.5, fy: 0.5 }, { punch: [{ t: 13.3, amp: 0.2, hold: 0.6, flash: 0.6, flashColor: C.red, shake: 14 }] }),
    panelShot(34, 15.0, 17.6, { z: 0.94, fx: 0.5, fy: 0.55 }, { z: 0.98, fx: 0.5, fy: 0.55 }, { punch: [{ t: 15.05, amp: 0.22, hold: 0.25, flash: 0.9, shake: 24 }] }),
    panelShot(35, 17.6, 20.4, { z: 1.2, fx: 0.5, fy: 0.18 }, { z: 1.2, fx: 0.5, fy: 0.66 }),
    panelShot(36, 20.4, 23.0, { z: 1.0, fx: 0.5, fy: 0.6 }, { z: 1.04, fx: 0.5, fy: 0.6 }, { punch: [{ t: 20.55, amp: 0.2, hold: 0.5, flash: 0.7, flashColor: C.red, shake: 20 }] }),
    panelShot(37, 23.0, 25.0, { z: 1.15, fx: 0.5, fy: 0.45 }, { z: 1.2, fx: 0.5, fy: 0.45 }, { punch: [{ t: 23.1, amp: 0.38, hold: 0.7, flash: 1, shake: 34, shakeDur: 0.55 }] }),
    panelShot(38, 25.0, 26.6, { z: 1.9, fx: 0.82, fy: 0.12 }, { z: 1.75, fx: 0.78, fy: 0.13 }),
  ];
  return {
    name: 'short2-im-not-paying', dur: 30, shots,
    hook: { t0: 0, t1: T_HOOK, en: 'THEY CAME TO COLLECT. <span class="r">HE SAID NO.</span>', jp: '取り立てに来た。少年は、払わない。' },
    caps: [
      { t0: 1.5, t1: 4.0, en: 'Rank ZERO. Balance: −∞.', jp: '格付けZERO。残高 −∞。' },
      { t0: 4.0, t1: 7.0, en: '"…That colour."', jp: '「……その色は」' },
      { t0: 7.0, t1: 9.8, en: 'Collection chains from every side.', jp: '四方から、取立の鎖。' },
      { t0: 9.8, t1: 12.3, en: 'The collector reaches for him —', jp: '取立人の手が、伸びる——' },
      { t0: 12.3, t1: 15.0, en: 'He grabs back.', jp: '掴み返した。' },
      { t0: 15.0, t1: 17.6, en: 'CONTRACT SUSPENDED 00:03', jp: '契約停止 00:03', cls: 'mono' },
      { t0: 17.6, t1: 19.0, en: '"Your borrowed power —"', jp: '「お前の借り物——」' },
      { t0: 19.0, t1: 20.4, en: '"for three seconds, it\'s mine."', jp: '「三秒だけ、俺が差し押さえる。」' },
      { t0: 20.4, t1: 23.0, en: '"I\'M NOT PAYING."', jp: '「払わねえよ。」', cls: 'big' },
      { t0: 25.0, t1: 26.6, en: '00:00 — contract resumed.', jp: '契約再開。' },
    ],
    card: CARD(26.6, {}),
  };
}

function short3() {
  // Book flip. Each entry: page, start time; a page turns over in its last FLIP seconds.
  const seq = [
    [1, 0], [5, 2.3], [7, 3.5], [10, 4.7], [13, 5.9], [15, 7.1], [16, 7.9], [17, 8.7], [20, 9.5], [25, 10.3], [13, 11.3],
  ];
  const holdEnd = 13.5;
  return {
    name: 'short3-book-flip', dur: 20, book: { seq, holdEnd },
    hook: { t0: 0, t1: T_HOOK, en: '<span class="r">30 PAGES</span> OF DEBT.', jp: '借金だらけの30ページ。' },
    caps: [
      { t0: 1.5, t1: 2.3, en: 'Book of the Ledger Vol.0', jp: '設定資料集『帳簿の書 Vol.0』' },
      { t0: 2.3, t1: 3.5, en: 'The city.', jp: '都市。' },
      { t0: 3.5, t1: 4.7, en: 'The Seven Lenders.', jp: '七柱の貸主。' },
      { t0: 4.7, t1: 5.9, en: 'The rules.', jp: 'ルール。' },
      { t0: 5.9, t1: 7.1, en: 'The power.', jp: '能力〈デフォルト〉。' },
      { t0: 7.1, t1: 10.3, en: '8 characters.', jp: '主要8人。' },
      { t0: 10.3, t1: 11.3, en: 'Episode 1.', jp: '第1話・脚本抜粋。' },
      { t0: 11.3, t1: 13.5, en: 'A5 · 30 pages · PDF', jp: 'A5・30ページ・PDF', cls: 'mono' },
    ],
    price: { t0: 13.5, t1: 16.6 },
    card: CARD(16.6, { price: '¥500 BOOTH · $4 Ko-fi' }),
  };
}

const FLIP = 0.32;
const BOOK_W = 780;
function bookAt(spec, t) {
  const { seq, holdEnd } = spec;
  const ar = 1653 / 1167;
  const src = (n) => path.join(ASSETS, `book-${pad(n)}.png`);
  let i = seq.length - 1;
  while (i > 0 && t < seq[i][1]) i--;
  const [n, s] = seq[i];
  const e = i + 1 < seq.length ? seq[i + 1][1] : holdEnd;
  // zoom: cover slams in during the hook; final p13 pushes into the diagram
  let z = 1 + 0.03 * prog(t, s, e), fx = 0.5, fy = 0.5;
  if (i === 0) z = t < 0.3 ? lerp(1.7, 1, easeOut(t / 0.3)) : 1 + 0.02 * prog(t, 0.3, e);
  if (i === seq.length - 1) { const k = ease(prog(t, s + 0.2, holdEnd)); z = lerp(1, 1.5, k); fy = lerp(0.5, 0.42, k); }
  const w = BOOK_W * z, h = w * ar;
  const x = W / 2 - fx * w, y = AY - 20 - fy * h;
  const geo = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  const blur = (pn) => (pn === 25 ? 7 : 0); // keep the screenplay excerpt unreadable (reason to buy)
  const turning = i + 1 < seq.length && t > e - FLIP;
  if (!turning) return { under: { src: src(n), ...geo, blur: blur(n) }, flip: null, slam: i === 0 && t < 0.35 ? 1 - t / 0.35 : 0 };
  const k = ease(prog(t, e - FLIP, e));
  const nn = seq[i + 1][0];
  const g2 = { x: Math.round(W / 2 - 0.5 * BOOK_W), y: Math.round(AY - 20 - 0.5 * BOOK_W * ar), w: BOOK_W, h: Math.round(BOOK_W * ar) };
  return {
    under: { src: src(nn), ...g2, blur: blur(nn), shade: 0.6 * (1 - k) },
    flip: { src: src(n), ...geo, rot: -100 * k, blur: blur(n), shade: 0.5 * k },
  };
}

function stateAt(sp, t) {
  const s = { grad: 1 };
  s.hook = hookAt(sp.hook, t);
  s.cap = capAt(sp.caps, t);
  s.card = cardAt(sp.card, t);
  if (sp.shots) {
    const shot = sp.shots.find((x) => t >= x.t0 && t < x.t1) || sp.shots[sp.shots.length - 1];
    if (!s.card || s.card.op < 1) {
      const cam = cameraFor(shot, t);
      Object.assign(s, { pic: cam.pic, shake: cam.shake, flash: cam.flash, flashColor: cam.flashColor, bg: shot.bg, dim: shot.dim || 0 });
      // quick dip at every cut
      const sinceCut = t - shot.t0;
      if (shot.t0 > 0 && sinceCut < 0.1) s.dim = Math.max(s.dim, 1 - sinceCut / 0.1);
    }
  }
  if (sp.book) {
    if (t < sp.book.holdEnd + 0.4) {
      const b = bookAt(sp.book, t);
      s.book = { under: b.under, flip: b.flip };
      s.bg = path.join(ASSETS, 'bg-book-01.png'.replace('.png', '.jpg'));
      if (b.slam) { s.flash = 0.7 * b.slam; }
      if (t < T_HOOK) s.dim = 0.55;
    }
    if (sp.price && t >= sp.price.t0 && t < sp.card.t0 + 0.4) {
      const k = easeOut(prog(t, sp.price.t0, sp.price.t0 + 0.35));
      s.price = { op: k, scale: (1.06 - 0.06 * k).toFixed(4) };
    }
  }
  if (s.hook) s.grad = 0.4;
  return s;
}

function allText(specs) {
  const bits = ['LEDGERBREAKER 帳簿破り Book of the Ledger Vol.0 帳簿の書 Vol.0 LINK IN BIO リンクはプロフィールから Made entirely with generative AI · reviewed by the creator すべて生成AIで制作（作者が確認・選定） ¥500 on BOOTH 日本語版 · 通常版 — or — $4 on Ko-fi English edition A5 · 30 pages · PDF 0123456789−∞'];
  for (const sp of specs) {
    bits.push(sp.hook.en.replace(/<[^>]+>/g, ''), sp.hook.jp);
    for (const c of sp.caps) bits.push(c.en, c.jp);
    if (sp.card.opts.kicker) bits.push(sp.card.opts.kicker.replace(/<[^>]+>/g, ' '));
    if (sp.card.opts.price) bits.push(sp.card.opts.price);
  }
  return bits.join(' ').replace(/</g, '&lt;');
}

// ---------- main ----------
(async () => {
  const want = process.argv.slice(2).filter((a) => /^[123]$/.test(a)).map(Number);
  const builders = [short1, short2, short3];
  const which = want.length ? want : [1, 2, 3];
  fs.mkdirSync(ASSETS, { recursive: true });
  const browser = await chromium.launch();
  await preparePanels(browser, [1, 2, 3, 4, 5, 6, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]);
  prepareBook();
  await prepareBackdrops(browser, [...[1, 2, 3, 4, 5, 6, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38].map((n) => path.join(ASSETS, `p${pad(n)}.png`)), path.join(ASSETS, 'book-01.png')]);

  const specs = which.map((i) => builders[i - 1]());
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const htmlPath = path.join(WORK, 'stage.html');
  fs.writeFileSync(htmlPath, stageHTML(allText(specs)));
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))]);
  console.log('fonts loaded:', loaded.join(', '));
  if (loaded.length < 3) throw new Error('Google Fonts did not load');

  const at = (process.argv.find((a) => a.startsWith('--at=')) || '').slice(5);
  if (at) { // preview mode: render chosen times only, no encode
    const pdir = path.join(WORK, 'preview'); fs.mkdirSync(pdir, { recursive: true });
    for (const sp of specs) for (const t of at.split(',').map(Number)) {
      await page.evaluate((s) => window.apply(s), stateAt(sp, t));
      await page.screenshot({ path: path.join(pdir, `${sp.name}-${t}.jpg`), type: 'jpeg', quality: 85 });
    }
    await browser.close(); return;
  }
  for (const sp of specs) {
    const dir = path.join(WORK, 'frames', sp.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const frames = Math.round(sp.dur * FPS);
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      await page.evaluate((s) => window.apply(s), stateAt(sp, t));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
      if (f % 150 === 0) console.log(sp.name, `frame ${f}/${frames}`, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    const out = path.join(OUT, sp.name + '.mp4');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'),
      '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', String(FPS), '-movflags', '+faststart', out]);
    console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
