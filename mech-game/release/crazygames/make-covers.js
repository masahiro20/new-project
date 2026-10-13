// CrazyGames のカバー3種（16:9 1920x1080 / 2:3 800x1200 / 1:1 800x800）を作る。
// 使い方: cd mech-game && bash build.sh && GAME_DIR=dist/itch node release/crazygames/make-covers.js
// タイトル画面の3D背景（UI なし）に「GRANDSTRIDE」だけを重ねる。枠・ロゴ・"NEW" 等の文字は入れない（CrazyGames の規定）。
const L = require('../../tests/lib');
const path = require('path');
const OUT = path.join(__dirname, 'covers');
const SIZES = [['landscape-1920x1080', 1920, 1080, 0.11], ['portrait-800x1200', 800, 1200, 0.16], ['square-800x800', 800, 800, 0.14]];
(async () => {
  const b = await L.launch();
  for (const [name, w, h, fs] of SIZES) {
    const errors = [];
    const pg = await L.open(b, name, { viewport: { width: w, height: h }, deviceScaleFactor: 1 }, errors);
    await pg.evaluate((fs) => {
      for (const id of ['title', 'launch', 'pause', 'result', 'hangar']) document.getElementById(id).classList.add('hidden');
      for (const el of document.querySelectorAll('#app > *')) { if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden'; }
      document.querySelectorAll('canvas').forEach(c => { c.style.visibility = 'visible'; });
      const t = document.createElement('div');
      const tall = innerWidth <= innerHeight;
      t.innerHTML = tall ? 'GRAND<br>STRIDE' : 'GRANDSTRIDE';
      t.style.cssText = `position:fixed;left:0;right:0;top:${tall ? '6' : '7'}%;text-align:center;z-index:99999;line-height:1.02;font:700 ${tall ? Math.round(innerWidth * 0.19) : Math.round(innerHeight * fs * 1.4)}px "Chakra Petch",sans-serif;letter-spacing:.04em;color:#eaffff;text-shadow:0 0 18px rgba(80,240,230,.65),0 4px 0 rgba(0,20,30,.8)`;
      document.body.appendChild(t);
    }, fs);
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('wrote', name, errors.length ? errors.join('|') : '');
    await pg.__close();
  }
  await b.close();
})();
