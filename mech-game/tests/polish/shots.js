// Phone layouts (hasTouch): title / play HUD / result / hangar. usage: node shots.js [WxH ...]
const L = require('../qa/lib');
const sizes = (process.argv.slice(2).length ? process.argv.slice(2) : ['844x390', '390x844', '360x740', '568x320']).map(s => s.split('x').map(Number));
const SAVE = JSON.stringify({v:2,parts:840,up:{legs:2,core:1,armor:0},cleared:{1:true,2:true,3:true},launched:true,tutorial:true,streak:{last:'',n:3},
  medals:{1:[true,true,false],2:[true,false,false],3:[true,false,true]},hardClear:{1:true},hard:false,assist:false,loses:{}});
(async () => {
  const errors = []; const b = await L.launch();
  for (const [w, h] of sizes) {
    const tag = w + 'x' + h;
    const init = `try{ if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.setItem('grandstride_save', ${JSON.stringify(SAVE)}); localStorage.setItem('grandstride_quality','low'); } }catch(e){}`;
    const pg = await L.open(b, tag, { viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, errors, init);
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: `s_${tag}_title.png` });
    const ov = await pg.evaluate(() => {
      const r = id => { const e = document.getElementById(id); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
      const ids = ['logo', 'missionSel', 'modeRow', 'titleBtns', 'howto', 'daily', 'titleOpts', 'allClear', 'titleNote', 'credit'];
      const bx = {}; for (const i of ids) bx[i] = r(i);
      const hits = [];
      for (let a = 0; a < ids.length; a++) for (let c = a + 1; c < ids.length; c++) {
        const A = bx[ids[a]], B = bx[ids[c]]; if (!A || !B) continue;
        if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) hits.push(ids[a] + '/' + ids[c]);
      }
      const t = document.getElementById('title');
      return { hits, scroll: t.scrollHeight > t.clientHeight + 1, sh: t.scrollHeight, ch: t.clientHeight, hScroll: document.documentElement.scrollWidth > innerWidth };
    });
    console.log(tag, 'title overlaps:', JSON.stringify(ov));
    await pg.evaluate(() => __GAME.openHangar()); await pg.waitForTimeout(300);
    await pg.screenshot({ path: `s_${tag}_hangar.png` });
    await pg.evaluate(() => __GAME.closeHangar());
    await pg.evaluate(() => __GAME.startMission(1)); await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `s_${tag}_play.png` });
    const hud = await pg.evaluate(() => {
      const ids = ['stickBase', 'tBoost', 'tDash', 'tFire', 'dash', 'radarWrap', 'topStats', 'radio', 'tPause'];
      const bx = {}; for (const i of ids) { const b = document.getElementById(i).getBoundingClientRect(); bx[i] = b; }
      const hits = [];
      for (let a = 0; a < ids.length; a++) for (let c = a + 1; c < ids.length; c++) { const A = bx[ids[a]], B = bx[ids[c]]; if (A.width && B.width && A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom) hits.push(ids[a] + '/' + ids[c]); }
      const lbl = document.querySelector('#dash .lbl'); const m = getComputedStyle(document.getElementById('dash')).transform;
      const sc = (m.match(/matrix\(([^,]+)/) || [])[1];
      return { hits, lblPx: +(parseFloat(getComputedStyle(lbl).fontSize) * +sc).toFixed(1), scale: +(+sc).toFixed(2) };
    });
    console.log(tag, 'hud overlaps:', JSON.stringify(hud));
    await pg.evaluate(() => __GAME.debugKillAll());
    await pg.waitForFunction(() => __GAME.state === 'result', null, { timeout: 30000 }); await pg.waitForTimeout(1200);
    await pg.screenshot({ path: `s_${tag}_result.png` });
    const rs = await pg.evaluate(() => { const c = document.querySelector('#result .card').getBoundingClientRect(); const r = document.getElementById('result'); return { cardH: Math.round(c.height), vh: innerHeight, scroll: r.scrollHeight > r.clientHeight + 1, cardW: Math.round(c.width), vw: innerWidth }; });
    console.log(tag, 'result:', JSON.stringify(rs));
    await pg.__close();
  }
  console.log('errors:', errors);
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
