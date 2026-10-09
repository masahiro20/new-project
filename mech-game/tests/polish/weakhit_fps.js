// Measures damage per hit on bosses at a given simulated frame rate (virtual time), to check whether exposed weak points are hittable.
// usage: node weakhit_fps.js <fps> <mission 1|2> <phase 1|2>
const http = require('http'), fs = require('fs'), path = require('path');
const V = require('../media/vtime');
const DIR = process.env.DIR || path.resolve(__dirname, "../frozen-m02");
const fps = +(process.argv[2] || 60), mid = +(process.argv[3] || 2), phase = +(process.argv[4] || 2);
const srv = http.createServer((q, r) => { let f = path.join(DIR, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, async () => {
  const b = await V.launchBrowser();
  const pg = await V.openGame(b, `http://localhost:${srv.address().port}/`, { width: 480, height: 270 });
  const step = n => pg.evaluate(([n, ms]) => { for (let i = 0; i < n; i++) __vt.step(ms); }, [n, 1000 / fps]);
  await pg.evaluate(m => { __GAME.debugSetUpgrades({ armor: 5 }); __GAME.startMission(m); }, mid);
  await step(fps);
  await pg.evaluate(p => p === 2 ? __GAME.debugBossPhase2() : __GAME.debugSpawnBoss(), phase);
  await step(fps * (phase === 2 ? 4.5 : 1));
  const rows = [];
  let last = await pg.evaluate(() => ({ hp: __GAME.boss.hp, hits: __GAME.player.hits, st: __GAME.boss.state, open: __GAME.boss.open }));
  await pg.keyboard.down('KeyJ');
  const per = {}; // state -> [hpLoss, hits]
  for (let i = 0; i < 25 * fps / 5; i++) { // 25 s game time, sampling every 0.2 s
    await pg.evaluate(() => { __GAME.debugFaceNearest(); __GAME.player; });
    await step(fps / 5);
    const c = await pg.evaluate(() => { const b = __GAME.boss; return b ? { hp: b.hp, hits: __GAME.player.hits, st: b.state, open: b.open, ph: b.phase, armor: __GAME.player.armor } : null; });
    if (!c) break;
    const k = c.ph + ':' + last.st + (last.open > 0.45 ? '(open)' : '');
    per[k] = per[k] || [0, 0]; per[k][0] += last.hp - c.hp; per[k][1] += c.hits - last.hits;
    last = c;
    if (c.armor <= 0) break;
  }
  const out = {}; for (const k in per) out[k] = { hits: per[k][1], dmgPerHit: per[k][1] ? +(per[k][0] / per[k][1]).toFixed(2) : null };
  console.log(JSON.stringify({ fps, mission: mid, phase, perState: out, errors: pg.__errors }));
  await b.close(); srv.close();
});
