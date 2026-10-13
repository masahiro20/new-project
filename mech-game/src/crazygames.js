/*
 * GRANDSTRIDE — CrazyGames 連携（CrazyGames 版のビルドにだけ入る。itch 版・単体版には含まれない）
 * - SDK v3 を初期化し、環境が local / crazygames のときだけ window.GSPlatform を有効にする
 * - ゲーム本体（game.html）は GSPlatform の関数を呼ぶだけ。GSPlatform が無ければ何もしない
 * - 広告は midgame のみ。「次の作戦へ」「再出撃」「支援モードで再出撃」を押した直後（作戦の合間）にだけ要求する
 * - セーブは SDK の Data モジュールに載せる（localStorage の代わりに差し込む）
 * ゲーム本体は window.__gsStart() で起動する（SDK の初期化とセーブの読み込みを待つため）
 */
(function () {
  'use strict';
  var SDK = null;
  var started = false;
  var playing = false;
  var playMs = 0, playSince = 0;     // 今回のページでの累計プレイ時間（広告を出してよいかの判断）
  var MIN_PLAY_MS = 60 * 1000;       // これ未満なら広告は出さない（「ある程度遊んでから」の要件）
  var AD_WATCHDOG_MS = 90 * 1000;
  var adBusy = false;
  var muteByAd = false, muteBySdk = false;

  function safe(fn) { try { return fn(); } catch (e) { /* SDK の例外でゲームを止めない */ } }
  function game() { return SDK && SDK.game; }

  function applyMaster() {
    var vol = typeof window.__gsVol === 'function' ? window.__gsVol() : 0.8;
    safe(function () { window.MechAudio.setMaster(GSPlatform.master(vol)); });
  }

  function startGame() {
    if (started) return;
    started = true;
    safe(function () { game().loadingStart(); });
    var f = window.__gsStart;
    if (typeof f === 'function') f();
    safe(function () { game().loadingStop(); });
  }

  // ---- セーブ: SDK の Data モジュール。使えない場合は通常の localStorage のまま
  function installStorage() {
    var real = window.localStorage;
    var d = SDK.data;
    var shim = {
      getItem: function (k) { try { return d.getItem(String(k)); } catch (e) { return real.getItem(k); } },
      setItem: function (k, v) { try { d.setItem(String(k), String(v)); } catch (e) { real.setItem(k, v); } },
      removeItem: function (k) { try { d.removeItem(String(k)); } catch (e) { real.removeItem(k); } },
      clear: function () { try { d.clear(); } catch (e) { real.clear(); } },
      key: function () { return null; },
      get length() { return 0; }
    };
    // 動作確認（Data モジュールが無効なら例外 → 通常の localStorage のまま）
    try { d.getItem('grandstride_save'); } catch (e) { return; }
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return shim; } }); } catch (e) { /* 差し込めなければそのまま */ }
  }

  // ---- 広告待ちの画面（ボタンを押せなくする。進行表示つき）
  function showWait() {
    var el = document.getElementById('gsAdWait');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gsAdWait';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,8,.88);color:#9fe;display:flex;align-items:center;justify-content:center;font:600 18px "Chakra Petch",sans-serif;letter-spacing:.12em;touch-action:none';
      el.textContent = 'ADVERTISEMENT … 広告';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  }
  function hideWait() { var el = document.getElementById('gsAdWait'); if (el) el.style.display = 'none'; }

  var GSPlatform = {
    // 出撃・再開で true、一時停止・作戦終了・タイトルで false
    play: function (on) {
      if (on === playing) return;
      playing = !!on;
      if (playing) { playSince = Date.now(); safe(function () { game().gameplayStart(); }); }
      else { if (playSince) playMs += Date.now() - playSince; playSince = 0; safe(function () { game().gameplayStop(); }); }
    },
    // リザルト表示時: 進捗（クリア数÷3）と、殻王撃破（ランク A 以上）の祝い
    result: function (r) {
      if (!r || r.debug) return;
      safe(function () { if (typeof r.pct === 'number') game().reportGameCompletedPercentage(r.pct); });
      safe(function () { if (r.win && r.boss && (r.rank === 'S' || r.rank === 'A')) game().happytime(); });
    },
    // ゲームが音量を設定するときに通す（CrazyGames 側のミュート指定と広告中のミュートを優先）
    master: function (v) { return muteByAd || muteBySdk ? 0 : v; },
    // 作戦の合間の広告。終わったら（または出なかったら）必ず cb を呼ぶ
    ad: function (cb) {
      var done = false;
      function finish() {
        if (done) return; done = true;
        adBusy = false; muteByAd = false; applyMaster(); hideWait(); clearTimeout(wd);
        cb();
      }
      var elapsed = playMs + (playSince ? Date.now() - playSince : 0);
      if (adBusy || !SDK || elapsed < MIN_PLAY_MS) { cb(); return; }
      adBusy = true;
      showWait();
      var wd = setTimeout(finish, AD_WATCHDOG_MS);
      try {
        SDK.ad.requestAd('midgame', {
          adStarted: function () { muteByAd = true; applyMaster(); },
          adFinished: finish,
          adError: finish   // 広告なし・クールダウン・広告ブロックなどはすべてそのまま続行
        });
      } catch (e) { finish(); }
    }
  };

  function boot() {
    var cg = window.CrazyGames && window.CrazyGames.SDK;
    if (!cg) { startGame(); return; }  // SDK を読み込めない環境でも遊べる
    var to = setTimeout(startGame, 8000);
    cg.init().then(function () {
      clearTimeout(to);
      var env = cg.environment;
      if (env !== 'local' && env !== 'crazygames') { startGame(); return; }
      SDK = cg;
      installStorage();
      window.GSPlatform = GSPlatform;
      safe(function () {
        muteBySdk = !!SDK.game.settings.muteAudio;
        SDK.game.addSettingsChangeListener(function (s) { muteBySdk = !!(s && s.muteAudio); applyMaster(); });
      });
      startGame();
    }).catch(function () { clearTimeout(to); startGame(); });
  }
  boot();
})();
