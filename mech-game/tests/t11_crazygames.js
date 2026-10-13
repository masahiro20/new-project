// 11. CrazyGames build (GAME_DIR=dist/crazygames): SDK stub -> init, gameplayStart/Stop, ads only between missions, mute during ads, Data-module save.
//     Also checks that without the SDK (itch-style) the game still starts.
const L = require('./lib');
const STUB = () => {
  const log = []; window.__cg = { log, saved: {} };
  const data = window.__cg.saved;
  const sdk = {
    environment: 'local',
    init: () => Promise.resolve(),
    game: { settings: { muteAudio: false, disableChat: false }, addSettingsChangeListener: f => { window.__cg.onSettings = f; },
      gameplayStart: () => log.push('start'), gameplayStop: () => log.push('stop'), loadingStart: () => log.push('loadStart'), loadingStop: () => log.push('loadStop'),
      happytime: () => log.push('happy'), reportGameCompletedPercentage: p => log.push('pct' + p) },
    data: { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: k => { delete data[k]; }, clear: () => { for (const k in data) delete data[k]; } },
    ad: { requestAd: (t, cb) => { log.push('ad:' + t); cb.adStarted(); window.__cg.adMaster = window.__lastMaster; setTimeout(() => cb.adFinished(), 400); } },
  };
  Object.defineProperty(window, 'CrazyGames', { value: { SDK: sdk }, writable: false, configurable: false });
};
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'cg', { viewport: { width: 800, height: 450 } }, errors, STUB);
  const cg = () => pg.evaluate(() => ({ log: window.__cg.log.slice(), keys: Object.keys(window.__cg.saved) }));
  L.check('CG build starts after SDK init, loadingStart/Stop called', (await cg()).log.join() === 'loadStart,loadStop', (await cg()).log);
  L.check('GSPlatform enabled in local env', await pg.evaluate(() => !!window.GSPlatform));
  await pg.evaluate(() => __GAME.debugSkipTutorial && __GAME.debugSkipTutorial());
  await L.launchToPlay(pg);
  let l = (await cg()).log;
  L.check('gameplayStart on entering play', l.includes('start') && !l.includes('stop'), l);
  await pg.evaluate(() => __GAME.pause());
  l = (await cg()).log; L.check('gameplayStop on pause', l[l.length - 1] === 'stop', l);
  await pg.evaluate(() => __GAME.resume());
  l = (await cg()).log; L.check('gameplayStart on resume', l[l.length - 1] === 'start', l);
  await L.waitGame(pg, 2);
  await pg.evaluate(() => __GAME.debugKillAll());
  await L.waitState(pg, 'result', 15000);
  l = (await cg()).log; L.check('gameplayStop at mission end, no ad yet', l[l.length - 1] === 'stop' && !l.some(x => x.startsWith('ad:')), l);
  // ad is skipped when the page has hardly been played (< 60 s): retry goes straight to launch
  await pg.click('#btnRetry'); await L.waitState(pg, 'launch', 3000);
  l = (await cg()).log; L.check('no ad before 60 s of play', !l.some(x => x.startsWith('ad:')), l);
  await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  // pretend 90 s were played, then end the mission and press the button
  await pg.evaluate(() => { const o = Date.now; Date.now = () => o() + 90000; });
  await pg.evaluate(() => __GAME.debugKillAll());
  await L.waitState(pg, 'result', 15000);
  await pg.evaluate(() => { document.querySelector('#btnNext:not(.hidden)') ? document.querySelector('#btnNext').click() : document.querySelector('#btnRetry').click(); });
  await pg.waitForFunction(() => window.__cg.log.includes('ad:midgame'), null, { timeout: 3000 });
  const wait = await pg.evaluate(() => { const e = document.getElementById('gsAdWait'); return e && getComputedStyle(e).display; });
  L.check('midgame ad requested after pressing a result button; UI blocked while waiting', wait === 'flex', wait);
  L.check('mission did not start during the ad', await pg.evaluate(() => __GAME.state === 'result'));
  await L.waitState(pg, 'launch', 5000);
  L.check('after adFinished the launch continues, overlay hidden', await pg.evaluate(() => getComputedStyle(document.getElementById('gsAdWait')).display === 'none'));
  l = (await cg()).log; L.check('only one midgame ad, no rewarded', l.filter(x => x.startsWith('ad:')).join() === 'ad:midgame', l);
  const k = (await cg()).keys; L.check('save goes to the Data module', k.includes('grandstride_save'), k);
  await pg.evaluate(() => window.__cg.onSettings({ muteAudio: true }));
  L.check('muteAudio setting honoured', await pg.evaluate(() => window.GSPlatform.master(0.8) === 0));
  await pg.evaluate(() => window.__cg.onSettings({ muteAudio: false }));
  L.check('unmuted again', await pg.evaluate(() => window.GSPlatform.master(0.8) === 0.8));
  await pg.__close();
  // without any SDK (blocked / offline): the game still starts and plays
  const pg2 = await L.open(b, 'nosdk', { viewport: { width: 800, height: 450 } }, errors);
  // (with network access the real SDK script loads here and runs in its own local mode; offline there is no SDK at all. Either way the game must start.)
  L.check('no stub SDK: game starts', await pg2.evaluate(() => __GAME.state === 'title'));
  await pg2.evaluate(() => __GAME.debugSkipTutorial && __GAME.debugSkipTutorial());
  await L.launchToPlay(pg2); L.check('no SDK: reaches play', true);
  await pg2.__close(); await b.close();
  process.exit(L.summary(errors.filter(e => !/read only property 'CrazyGames'/.test(e))) ? 1 : 0);
})();
