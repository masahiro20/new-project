// Idle survival: start mission N straight into play (hook), do nothing, report game seconds until destroyed.
// usage: node idle.js <mission> <rookie|vet> [runs]
const L = require('../qa/lib');
const id = +process.argv[2] || 1, mode = process.argv[3] || 'vet', runs = +process.argv[4] || 1;
(async () => {
  const errors = []; const b = await L.launch();
  const init = mode === 'vet' ? `try{ if(!localStorage.getItem('grandstride_save')) localStorage.setItem('grandstride_save', JSON.stringify({v:2,parts:0,up:{legs:0,core:0,armor:0},cleared:{1:true,2:true,3:true},launched:true,tutorial:true,streak:{last:'',n:0}})); localStorage.setItem('grandstride_quality','low'); }catch(e){}`
    : `try{ localStorage.setItem('grandstride_quality','low'); }catch(e){}`;
  const pg = await L.open(b, 'idle', { viewport: { width: 640, height: 360 } }, errors, init);
  const out = [];
  for (let r = 0; r < runs; r++) {
    await pg.evaluate((id) => __GAME.startMission(id), id);
    const t0 = Date.now();
    await pg.waitForFunction(() => __GAME.state === 'result', null, { timeout: 1500000, polling: 1000 });
    const res = await pg.evaluate(() => ({ t: __GAME.result.time, win: __GAME.result.win, dmg: Math.round(__GAME.result.damageTaken), armor: __GAME.player.armor, fps: __GAME.fps }));
    res.real = Math.round((Date.now() - t0) / 1000); out.push(res); console.log(JSON.stringify(res));
    await pg.evaluate(() => document.getElementById('btnToTitle').click());
    await pg.waitForFunction(() => __GAME.state === 'title');
  }
  console.log('mission', id, mode, 'idle-death seconds:', out.map(o => Math.round(o.t)).join(', '), errors.length ? errors : '');
  await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });
