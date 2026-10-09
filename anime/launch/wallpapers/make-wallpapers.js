// Generates the three bonus phone wallpapers (SVG) for 『帳簿の書 Vol.0』.
// Canvas: 1179 x 2556 (modern iPhone). Top ~22% (0–562px) is kept calm for the clock;
// key details stay between ~600 and ~2200px so the dock / home indicator / Android crop are safe.
// Usage: node make-wallpapers.js && node render-wallpapers.js
const fs = require('fs');
const path = require('path');
const W = 1179, H = 2556, CX = W / 2;
const OUT = __dirname;

const FONTS = `<style>@import url('https://fonts.googleapis.com/css2?family=Dela+Gothic+One&amp;family=IBM+Plex+Mono:wght@500;700&amp;family=Zen+Kaku+Gothic+New:wght@700;900&amp;display=block');</style>`;

function head(title, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
  <title id="t">${title}</title>
  <desc id="d">${desc}</desc>
  ${FONTS}`;
}

// small wordmark used on all three
function wordmark(y, color = '#E5172F', sub = '#9A958C') {
  return `<g text-anchor="middle">
    <text x="${CX}" y="${y}" font-family="'Dela Gothic One',sans-serif" font-size="40" letter-spacing="10" fill="${color}">LEDGERBREAKER</text>
    <text x="${CX}" y="${y + 44}" font-family="'Zen Kaku Gothic New',sans-serif" font-weight="700" font-size="22" letter-spacing="16" fill="${sub}">帳簿破り</text>
  </g>`;
}

// seeded RNG so the city is the same every build
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const r1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- (a) ledger mark
function wallMark() {
  const s = 1.55, cy = 1290; // emblem scale and centre
  const t = `translate(${CX - 300 * s} ${cy - 300 * s}) scale(${s})`;
  let rules = '';
  for (let y = 660; y < H; y += 72) rules += `M0 ${y}H${W}`;
  return `${head('LEDGERBREAKER wallpaper — Ledger Mark', 'Minimal phone wallpaper: the red ledger-mark emblem (struck-through zero inside a double-ruled wristband with seven lender notches) centred on Vault Night, small LEDGERBREAKER wordmark below.')}
  <defs>
    <radialGradient id="bg" cx="${CX}" cy="${cy}" r="1500" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#262B3F"/>
      <stop offset="0.45" stop-color="#1B1F2E"/>
      <stop offset="1" stop-color="#11131C"/>
    </radialGradient>
    <radialGradient id="halo" cx="${CX}" cy="${cy}" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E5172F" stop-opacity="0.22"/>
      <stop offset="0.6" stop-color="#7A0614" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#7A0614" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="calm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B1F2E" stop-opacity="1"/>
      <stop offset="1" stop-color="#1B1F2E" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- faint ledger paper -->
  <path d="${rules}" stroke="#E5172F" stroke-opacity="0.06" stroke-width="1.5"/>
  <path d="M104 0V${H}M116 0V${H}" stroke="#E5172F" stroke-opacity="0.14" stroke-width="2"/>
  <rect width="${W}" height="760" fill="url(#calm)"/>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>

  <g transform="${t}">
    <g fill="none" stroke="#E5172F">
      <circle cx="300" cy="300" r="232" stroke-width="10"/>
      <circle cx="300" cy="300" r="214" stroke-width="3"/>
      <circle cx="300" cy="300" r="152" stroke-width="3" stroke-opacity="0.7"/>
    </g>
    <!-- ledger ticks between the band rules -->
    <g stroke="#E5172F" stroke-opacity="0.5" stroke-width="2">
      ${Array.from({ length: 56 }, (_, i) => {
        const a = (i / 56) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        return `<path d="M${r1(300 + 218 * c)} ${r1(300 + 218 * sn)}L${r1(300 + 226 * c)} ${r1(300 + 226 * sn)}"/>`;
      }).join('')}
    </g>
    <!-- seven lender notches -->
    <g stroke="#0E0B10" stroke-width="3">
      <circle cx="300" cy="68" r="11" fill="#E5172F"/>
      <circle cx="481.4" cy="155.4" r="9" fill="#9AA3AD"/>
      <circle cx="526.2" cy="351.6" r="9" fill="#FF5A1F"/>
      <circle cx="400.7" cy="509" r="9" fill="#F0921E"/>
      <circle cx="199.3" cy="509" r="9" fill="#2FC48D"/>
      <circle cx="73.8" cy="351.6" r="9" fill="#4F63E8"/>
      <circle cx="118.6" cy="155.4" r="9" fill="#FFDC5A"/>
    </g>
    <g filter="url(#glow)">
      <path fill="#E5172F" fill-rule="evenodd"
        d="M300 168 C 380 168 432 226 432 300 C 432 378 376 432 300 432 C 222 432 168 376 168 300 C 168 222 222 168 300 168 Z
           M300 214 C 254 214 222 252 224 302 C 226 350 256 388 302 386 C 348 384 378 348 376 298 C 374 250 344 214 300 214 Z"/>
      <path fill="#E5172F" d="M160 352 L 440 221 L 450 243 L 170 374 Z"/>
      <path fill="#1B1F2E" d="M172 352 L 438 229 L 440 235 L 174 358 Z" opacity="0.9"/>
    </g>
    <g fill="#E5172F">
      <path d="M262 424 C 262 436 260 446 264 452 C 270 460 284 458 284 448 C 284 440 282 434 284 428 Z"/>
      <path d="M318 430 C 317 436 318 440 321 444 C 325 448 334 447 334 441 C 334 437 333 434 334 428 Z"/>
    </g>
    <path d="M269 434 C 268 440 268 444 270 448" stroke="#FF6B7A" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M220 250 C 236 214 268 194 304 190" stroke="#FF6B7A" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.7"/>
  </g>
  <!-- one falling drop, far below -->
  <path d="M${CX - 20} 1760 C ${CX - 27} 1772 ${CX - 26} 1784 ${CX - 20} 1784 C ${CX - 14} 1784 ${CX - 13} 1772 ${CX - 20} 1760 Z" fill="#E5172F" opacity="0.7"/>

  <text x="${CX}" y="1905" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-weight="500" font-size="26" letter-spacing="8" fill="#5C5466">BALANCE  −∞</text>
  ${wordmark(2030)}
</svg>
`;
}

// ---------------------------------------------------------------- (b) 払わねえよ。
function wallNotPaying() {
  let rules = '';
  for (let y = 660; y < H; y += 64) rules += `M0 ${y}H${W}`;
  // forearm geometry (Jin's LEFT arm, raised, seen from behind; red mark wrist to elbow)
  const forearm = 'M206 1716 C 214 1470 318 1200 360 1004 L 480 1022 C 474 1250 430 1500 392 1742 Z';
  const bands = [0.12, 0.32, 0.52, 0.72].map((k) => {
    // interpolate along the forearm centreline from wrist (420,1013) to elbow (299,1729)
    const x = 420 + (299 - 420) * k, y = 1013 + (1729 - 1013) * k;
    const hw = 62 + 26 * k; // half width grows toward the elbow
    const nx = 0.986, ny = 0.167;
    const a = `M${r1(x - hw * nx)} ${r1(y - hw * ny)}L${r1(x + hw * nx)} ${r1(y + hw * ny)}`;
    const b = `M${r1(x - hw * nx)} ${r1(y - hw * ny + 16)}L${r1(x + hw * nx)} ${r1(y + hw * ny + 16)}`;
    return a + b;
  }).join('');
  return `${head('LEDGERBREAKER wallpaper — 払わねえよ。', 'Typographic phone wallpaper: the line 払わねえよ。 set vertically in large type, I\'M NOT PAYING. beside it, and Jin\'s raised left arm with the red ledger mark from wrist to elbow, on Ink Black ledger paper. Small LEDGERBREAKER wordmark.')}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E0B10"/>
      <stop offset="0.55" stop-color="#140D13"/>
      <stop offset="1" stop-color="#0E0B10"/>
    </linearGradient>
    <radialGradient id="aura" cx="400" cy="1250" r="760" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E5172F" stop-opacity="0.30"/>
      <stop offset="0.5" stop-color="#7A0614" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#7A0614" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="calm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E0B10" stop-opacity="1"/>
      <stop offset="1" stop-color="#0E0B10" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FF2A44"/>
      <stop offset="0.55" stop-color="#E5172F"/>
      <stop offset="1" stop-color="#9E0C22"/>
    </linearGradient>
    <linearGradient id="upper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1A1420"/>
      <stop offset="0.7" stop-color="#0E0B10"/>
      <stop offset="1" stop-color="#0E0B10"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="1742" x2="0" y2="2020" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E5172F" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#E5172F" stop-opacity="0"/>
    </linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="${rules}" stroke="#E5172F" stroke-opacity="0.07" stroke-width="1.5"/>
  <path d="M104 0V${H}M116 0V${H}" stroke="#E5172F" stroke-opacity="0.16" stroke-width="2"/>
  <rect width="${W}" height="760" fill="url(#calm)"/>
  <rect width="${W}" height="${H}" fill="url(#aura)"/>

  <!-- ===== the arm ===== -->
  <!-- upper arm, silhouette, runs off the bottom-left (no key detail down there) -->
  <path d="M206 1716 L 392 1742 C 350 1960 300 2200 236 ${H} L -140 ${H} C -40 2230 110 1960 206 1716 Z" fill="url(#upper)"/>
  <path d="M392 1742 C 370 1850 352 1940 336 2020" fill="none" stroke="url(#rim)" stroke-width="4"/>
  <!-- elbow -->
  <ellipse cx="300" cy="1732" rx="96" ry="40" fill="#1A1420" transform="rotate(8 300 1732)"/>

  <!-- red mark: wrist to elbow -->
  <path d="${forearm}" fill="#E5172F" filter="url(#blur)" opacity="0.9"/>
  <path d="${forearm}" fill="url(#mark)" stroke="#0E0B10" stroke-width="4"/>
  <path d="${bands}" stroke="#7A0614" stroke-width="5"/>
  <path d="M232 1690 C 244 1460 330 1210 370 1024" fill="none" stroke="#FF6B7A" stroke-width="6" stroke-linecap="round" opacity="0.75"/>
  <text transform="translate(424 1150) rotate(9.6)" font-family="'IBM Plex Mono',monospace" font-weight="700" font-size="46" fill="#FFD0D6" text-anchor="middle">−∞</text>

  <!-- fist (back of the hand toward the viewer), silhouette with red rim -->
  <g transform="translate(436 900) rotate(9.6)">
    <path d="M-66 100 C -76 40 -80 -20 -72 -64 Q -68 -98 -36 -96 Q -20 -112 0 -100 Q 20 -114 38 -98 Q 66 -104 70 -66 C 78 -10 74 50 62 104 Z" fill="#15101A" stroke="#E5172F" stroke-width="5" filter="url(#glow)"/>
    <path d="M-36 -96 C -40 -80 -40 -70 -34 -60 M0 -100 C -4 -84 -4 -72 2 -62 M38 -98 C 34 -82 34 -72 40 -62" fill="none" stroke="#3A2A36" stroke-width="4" stroke-linecap="round"/>
    <path d="M-72 -20 C -96 -10 -100 30 -78 52" fill="#15101A" stroke="#E5172F" stroke-width="4"/>
  </g>
  <!-- ink droplets lifting off the mark -->
  <g fill="#E5172F">
    <circle cx="540" cy="1320" r="9"/><circle cx="566" cy="1220" r="7" opacity="0.8"/>
    <circle cx="548" cy="1110" r="5.5" opacity="0.6"/><circle cx="590" cy="1020" r="4.5" opacity="0.45"/>
    <circle cx="570" cy="900" r="3.5" opacity="0.3"/><circle cx="604" cy="800" r="2.5" opacity="0.2"/>
    <path d="M534 1400 C 523 1418 525 1436 536 1436 C 547 1436 549 1418 534 1400 Z"/>
  </g>

  <!-- ===== the line ===== -->
  <path d="M732 690V2010M744 690V2010" stroke="#E5172F" stroke-width="3" stroke-opacity="0.8"/>
  <text x="920" y="700" style="writing-mode: vertical-rl" font-family="'Dela Gothic One',sans-serif" font-size="232" fill="#F5EEDD" letter-spacing="2">払わねえよ。</text>
  <text transform="translate(690 700) rotate(90)" font-family="'IBM Plex Mono',monospace" font-weight="700" font-size="40" letter-spacing="10" fill="#E5172F">I'M NOT PAYING.</text>

  ${wordmark(2130)}
</svg>
`;
}

// ---------------------------------------------------------------- (c) Kanegura at night
function wallCity() {
  seed = 7;
  const spineTop = 960, spineBot = 2556;
  // ribs: one pair per tier, from the spine outward and down
  const ribs = [];
  for (let k = 0; k < 7; k++) {
    const y0 = 1040 + k * 175;
    const reach = 250 + k * 70;
    const rise = 90 + k * 8;
    const drop = 300 + k * 20;
    ribs.push({ y0, reach, rise, drop, w: 22 + k * 3, k });
  }
  const ribPath = (rb, dir) => {
    const x0 = CX + dir * 30, x3 = CX + dir * (rb.reach + 40);
    return { x0, y0: rb.y0, c1x: CX + dir * (rb.reach * 0.35), c1y: rb.y0 - rb.rise, c2x: CX + dir * (rb.reach * 0.95), c2y: rb.y0 - rb.rise * 0.7, x3, y3: rb.y0 + rb.drop };
  };
  const bez = (p, t) => {
    const u = 1 - t;
    return [
      u * u * u * p.x0 + 3 * u * u * t * p.c1x + 3 * u * t * t * p.c2x + t * t * t * p.x3,
      u * u * u * p.y0 + 3 * u * u * t * p.c1y + 3 * u * t * t * p.c2y + t * t * t * p.y3,
    ];
  };

  // buildings: sit on each rib, behind the bone
  const winColors = ['#F0921E', '#FFDC5A', '#E9E1CF', '#2FC48D', '#E5172F'];
  let bld = '', win = '';
  for (const rb of ribs) {
    const tier = rb.k <= 1 ? 'top' : rb.k <= 3 ? 'mid' : 'low';
    for (const dir of [-1, 1]) {
      const p = ribPath(rb, dir);
      for (let t = 0.06; t < 0.78; t += 0.035 + rnd() * 0.03) {
        const [x, y] = bez(p, t);
        if (x < -40 || x > W + 40) continue;
        const bw = 26 + rnd() * 40;
        const maxH = tier === 'top' ? 150 : tier === 'mid' ? 190 : 130;
        const bh = 50 + rnd() * maxH * (1 - t * 0.5);
        const bx = x - bw / 2, by = y - bh + 6;
        const base = tier === 'top' ? '#2A2333' : tier === 'mid' ? '#241C26' : '#1A2226';
        bld += `<rect x="${r1(bx)}" y="${r1(by)}" width="${r1(bw)}" height="${r1(bh + 14)}" fill="${base}"/>`;
        if (rnd() < 0.3) bld += `<path d="M${r1(bx)} ${r1(by)}L${r1(bx + bw / 2)} ${r1(by - 18 - rnd() * 14)}L${r1(bx + bw)} ${r1(by)}Z" fill="${base}"/>`;
        // windows
        for (let wy = by + 10; wy < by + bh - 8; wy += 14) {
          for (let wx = bx + 6; wx < bx + bw - 6; wx += 11) {
            if (rnd() < (tier === 'low' ? 0.16 : 0.24)) {
              let c = winColors[Math.floor(rnd() * 3)];
              if (tier === 'low' && rnd() < 0.5) c = '#7FA9A8';
              if (tier === 'mid' && rnd() < 0.08) c = winColors[3 + Math.floor(rnd() * 2)];
              win += `<rect x="${r1(wx)}" y="${r1(wy)}" width="5" height="7" fill="${c}" opacity="${r1(0.5 + rnd() * 0.5)}"/>`;
            }
          }
        }
      }
    }
  }
  const ribSvg = ribs.map((rb) => [-1, 1].map((dir) => {
    const p = ribPath(rb, dir);
    const d = `M${r1(p.x0)} ${r1(p.y0)} C ${r1(p.c1x)} ${r1(p.c1y)} ${r1(p.c2x)} ${r1(p.c2y)} ${r1(p.x3)} ${r1(p.y3)}`;
    return `<path d="${d}" stroke="#0E0B10" stroke-width="${rb.w + 8}"/><path d="${d}" stroke="#E9E1CF" stroke-width="${rb.w}"/><path d="${d}" stroke="#B8AE98" stroke-width="${rb.w * 0.35}" transform="translate(0 ${rb.w * 0.28})"/>`;
  }).join('')).join('');

  let vert = '';
  for (let y = spineTop; y < spineBot; y += 46) {
    const w = 64 + Math.min(30, (y - spineTop) / 40);
    vert += `<rect x="${r1(CX - w / 2)}" y="${y}" width="${r1(w)}" height="38" rx="12" fill="#E9E1CF" stroke="#0E0B10" stroke-width="4"/><rect x="${r1(CX - w / 2 + 6)}" y="${y + 26}" width="${r1(w - 12)}" height="8" rx="4" fill="#B8AE98"/>`;
  }
  // lift cabins on the spine
  const lifts = [1180, 1520, 1890].map((y) => `<rect x="${CX - 18}" y="${y}" width="36" height="44" rx="4" fill="#2A2333" stroke="#C9A24A" stroke-width="3"/><rect x="${CX - 10}" y="${y + 10}" width="20" height="14" fill="#FFDC5A" opacity="0.85"/>`).join('');

  let stars = '';
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W, y = rnd() * 1100;
    const o = y < 600 ? 0.12 + rnd() * 0.18 : 0.2 + rnd() * 0.4;
    stars += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.9 + rnd() * 1.6)}" fill="#E9E1CF" opacity="${r1(o)}"/>`;
  }
  // sewage falls in the Underledger
  const falls = [180, 300, 880, 1010].map((x, i) => `<rect x="${x}" y="${1880 + i * 30}" width="${4 + i % 2 * 3}" height="${520}" fill="#7FA9A8" opacity="0.18"/>`).join('');

  return `${head('LEDGERBREAKER wallpaper — Kanegura at night', 'Phone wallpaper: the vertical city of Kanegura at night, built on the white ribcage and spine of a dead god, the gold-domed Bourse at the summit in front of a red ledger-lined moon, lit windows on every rib, the Underledger fading into teal fog. Small LEDGERBREAKER wordmark.')}
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E0B10"/>
      <stop offset="0.3" stop-color="#151827"/>
      <stop offset="0.55" stop-color="#1B1F2E"/>
      <stop offset="1" stop-color="#101518"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="${CX}" cy="1150" r="720" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E5172F" stop-opacity="0.45"/>
      <stop offset="0.45" stop-color="#7A0614" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#7A0614" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="moon" cx="0.45" cy="0.4" r="0.7">
      <stop offset="0" stop-color="#F0293F"/>
      <stop offset="1" stop-color="#B70F25"/>
    </radialGradient>
    <clipPath id="moonClip"><circle cx="${CX}" cy="1150" r="340"/></clipPath>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3E5A5C" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#3E5A5C" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#0E0B10" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0E0B10" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#0E0B10" stop-opacity="0.94"/>
      <stop offset="1" stop-color="#0E0B10" stop-opacity="1"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g>${stars}</g>
  <rect width="${W}" height="${H}" fill="url(#moonGlow)"/>

  <!-- red moon with ledger lines -->
  <circle cx="${CX}" cy="1150" r="340" fill="url(#moon)"/>
  <g clip-path="url(#moonClip)" stroke="#7A0614" stroke-opacity="0.55" stroke-width="3">
    ${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${830 + i * 48}H${W}"/>`).join('')}
    <path d="M${CX - 250} 800V1500" stroke-width="2.5"/>
  </g>
  <!-- rating ring around the moon -->
  <circle cx="${CX}" cy="1150" r="430" fill="none" stroke="#C9A24A" stroke-opacity="0.45" stroke-width="2.5" stroke-dasharray="3 10"/>
  <circle cx="${CX}" cy="1150" r="470" fill="none" stroke="#C9A24A" stroke-opacity="0.25" stroke-width="1.5"/>

  <!-- city -->
  <g>${bld}</g>
  <g>${win}</g>
  <g fill="none" stroke-linecap="round">${ribSvg}</g>
  <g>${vert}</g>
  ${lifts}

  <!-- the Bourse at the summit -->
  <g transform="translate(${CX} 0)">
    <rect x="-120" y="930" width="240" height="40" fill="#E9E1CF" stroke="#0E0B10" stroke-width="4"/>
    <rect x="-100" y="870" width="200" height="62" fill="#F5EEDD" stroke="#0E0B10" stroke-width="4"/>
    ${[-76, -46, -16, 14, 44, 74].map((x) => `<rect x="${x - 6}" y="880" width="12" height="44" fill="#C9A24A" opacity="0.85"/>`).join('')}
    <path d="M-130 872 L0 820 L130 872 Z" fill="#E9E1CF" stroke="#0E0B10" stroke-width="4"/>
    <rect x="-46" y="760" width="92" height="62" fill="#F5EEDD" stroke="#0E0B10" stroke-width="4"/>
    <rect x="-28" y="776" width="12" height="30" fill="#7A0614"/><rect x="-6" y="776" width="12" height="30" fill="#7A0614"/><rect x="16" y="776" width="12" height="30" fill="#7A0614"/>
    <path d="M-56 762 C -56 690 -26 660 0 656 C 26 660 56 690 56 762 Z" fill="#C9A24A" stroke="#0E0B10" stroke-width="4" filter="url(#glow)"/>
    <path d="M-30 740 C -30 700 -16 680 0 674" stroke="#FFDC5A" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M0 656 V 612" stroke="#C9A24A" stroke-width="5"/>
    <circle cx="0" cy="608" r="8" fill="#FFDC5A"/>
  </g>
  <!-- public rating plates -->
  <g font-family="'IBM Plex Mono',monospace" font-weight="700" font-size="24" text-anchor="middle">
    <rect x="300" y="905" width="86" height="40" fill="#0E0B10" stroke="#C9A24A" stroke-width="3"/><text x="343" y="934" fill="#FFDC5A">AAA</text>
    <rect x="796" y="985" width="86" height="40" fill="#0E0B10" stroke="#C9A24A" stroke-width="3"/><text x="839" y="1014" fill="#FFDC5A">AA+</text>
  </g>

  ${falls}
  <rect y="1700" width="${W}" height="${H - 1700}" fill="url(#fog)"/>
  <rect y="1880" width="${W}" height="${H - 1880}" fill="url(#foot)"/>

  ${wordmark(2170)}
</svg>
`;
}

const files = {
  'ledgerbreaker-wallpaper-1-ledger-mark.svg': wallMark(),
  'ledgerbreaker-wallpaper-2-not-paying.svg': wallNotPaying(),
  'ledgerbreaker-wallpaper-3-kanegura-night.svg': wallCity(),
};
for (const [n, s] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, n), s);
  console.log(n, s.length, 'bytes');
}
