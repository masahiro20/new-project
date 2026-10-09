/*
 * GRANDSTRIDE — MechAudio
 * Web Audio API だけで合成する HEKATON (TYPE-04) のサウンド＆ハプティクス。
 * 外部音声ファイルなし・依存なし。window.MechAudio を定義する。
 * すべての公開関数は例外を投げず、init() 前は何もしない。
 */
(function () {
  'use strict';

  var ctx = null;          // AudioContext
  var master = null;       // マスターゲイン
  var comp = null;         // コンプレッサ
  var noiseBuf = null;     // 使い回すホワイトノイズ
  var masterLevel = 0.8;
  var hiddenSuspended = false;
  var visBound = false;

  // 持続ノード
  var eng = null;          // エンジン（炉）
  var srv = null;          // サーボ
  var wth = null;          // 天候（雨・風）MISSION 03
  var alarmTimer = null;
  var beatTimer = null;
  var fireVoices = 0;
  var MAX_FIRE_VOICES = 4;
  var lastFootT = [0, 0, 0, 0];

  // ---------------------------------------------------------------- utils
  function clamp01(v) {
    v = +v;
    if (!(v === v)) return 0; // NaN
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function now() { return ctx.currentTime; }

  function canPlay() {
    return !!ctx && !hiddenSuspended && ctx.state !== 'closed';
  }

  // ワンショット: 終了時に関連ノードをすべて切断
  function autoDisconnect(src, nodes, onDone) {
    src.onended = function () {
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch (e) { /* noop */ }
      }
      if (onDone) { try { onDone(); } catch (e2) { /* noop */ } }
    };
  }

  function makePanner(pan, dest) {
    if (pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(dest);
      return p;
    }
    return null;
  }

  // 振幅エンベロープ（指数減衰）
  function envGain(t, attack, peak, dur) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    return g;
  }

  /*
   * tone({type, f0, f1, t, dur, gain, attack, pan, dest, curve, filter:{type,f,Q}, detune})
   */
  function tone(o) {
    var t = o.t != null ? o.t : now();
    var dur = o.dur || 0.2;
    var attack = o.attack != null ? o.attack : 0.004;
    var dest = o.dest || master;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1 != null) {
      var slide = o.slide != null ? o.slide : dur;
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + slide);
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    var g = envGain(t, attack, o.gain != null ? o.gain : 0.3, dur);
    var nodes = [osc, g];
    var head = g;
    osc.connect(g);
    if (o.filter) {
      var f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.setValueAtTime(o.filter.f, t);
      if (o.filter.f1) f.frequency.exponentialRampToValueAtTime(o.filter.f1, t + dur);
      f.Q.value = o.filter.Q != null ? o.filter.Q : 0.7;
      g.connect(f);
      head = f;
      nodes.push(f);
    }
    var p = makePanner(o.pan, dest);
    if (p) { head.connect(p); nodes.push(p); } else { head.connect(dest); }
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
    autoDisconnect(osc, nodes, o.onDone);
    return osc;
  }

  /*
   * noise({t, dur, gain, attack, type, f0, f1, Q, pan, dest, rate})
   */
  function noise(o) {
    var t = o.t != null ? o.t : now();
    var dur = o.dur || 0.2;
    var attack = o.attack != null ? o.attack : 0.002;
    var dest = o.dest || master;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.slide || dur));
    f.Q.value = o.Q != null ? o.Q : 0.7;
    var g = envGain(t, attack, o.gain != null ? o.gain : 0.2, dur);
    src.connect(f);
    f.connect(g);
    var nodes = [src, f, g];
    var p = makePanner(o.pan, dest);
    if (p) { g.connect(p); nodes.push(p); } else { g.connect(dest); }
    var offset = Math.random() * (noiseBuf.duration - 0.1);
    src.start(t, offset);
    src.stop(t + attack + dur + 0.05);
    autoDisconnect(src, nodes, o.onDone);
    return src;
  }

  // 金属の軋み：狭帯域フィルタを通したノコギリ波＋揺らぎ
  function creak(t, base, dur, gain, pan) {
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.1), t + dur);
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 9 + Math.random() * 14;
    var lfoG = ctx.createGain();
    lfoG.gain.value = base * 0.06;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(base * 3.2, t);
    bp.frequency.linearRampToValueAtTime(base * 2.4, t + dur);
    bp.Q.value = 9;
    var g = envGain(t, 0.02, gain, dur);
    osc.connect(bp); bp.connect(g);
    var nodes = [osc, lfo, lfoG, bp, g];
    var p = makePanner(pan, master);
    if (p) { g.connect(p); nodes.push(p); } else { g.connect(master); }
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.08); lfo.stop(t + dur + 0.08);
    autoDisconnect(osc, nodes);
  }

  // 非整数倍音の金属リング
  function metalRing(t, base, dur, gain, pan) {
    var ratios = [1, 2.76, 5.40, 8.93];
    for (var i = 0; i < ratios.length; i++) {
      tone({ type: 'sine', f0: base * ratios[i], f1: base * ratios[i] * 0.995, t: t,
        dur: dur / (1 + i * 0.6), gain: gain / (1 + i * 0.7), attack: 0.001, pan: pan });
    }
  }

  // 重低音のドスン（サイン下降＋100-300Hz帯の成分）
  function thud(t, f0, f1, dur, gain, pan) {
    tone({ type: 'sine', f0: f0, f1: f1, t: t, dur: dur, gain: gain, attack: 0.003, slide: dur * 0.6, pan: pan });
    // スマホスピーカー向けの胴鳴り（2倍/3倍成分）
    tone({ type: 'triangle', f0: f0 * 2.1, f1: f1 * 2.4, t: t, dur: dur * 0.55, gain: gain * 0.45,
      attack: 0.002, slide: dur * 0.4, pan: pan, filter: { type: 'lowpass', f: 420, Q: 0.8 } });
  }

  // ---------------------------------------------------------------- 持続音
  function loopNoise(rate) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(0, Math.random() * (noiseBuf.duration - 0.1));
    return s;
  }

  function buildEngine() {
    var e = {};
    e.out = ctx.createGain();
    e.out.gain.value = 0;
    e.out.connect(master);

    // 炉のハム
    e.filter = ctx.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.frequency.value = 220;
    e.filter.Q.value = 2.5;
    e.hum = ctx.createGain();
    e.hum.gain.value = 1;
    e.filter.connect(e.hum);
    e.hum.connect(e.out);

    e.a = ctx.createOscillator(); e.a.type = 'sawtooth'; e.a.frequency.value = 34;
    e.b = ctx.createOscillator(); e.b.type = 'square'; e.b.frequency.value = 51; e.b.detune.value = 7;
    e.sub = ctx.createOscillator(); e.sub.type = 'sine'; e.sub.frequency.value = 34;
    e.mid = ctx.createOscillator(); e.mid.type = 'triangle'; e.mid.frequency.value = 136;
    var ga = ctx.createGain(); ga.gain.value = 0.5;
    var gb = ctx.createGain(); gb.gain.value = 0.22;
    var gs = ctx.createGain(); gs.gain.value = 0.9;
    e.midG = ctx.createGain(); e.midG.gain.value = 0.18;
    e.a.connect(ga); ga.connect(e.filter);
    e.b.connect(gb); gb.connect(e.filter);
    e.sub.connect(gs); gs.connect(e.hum);
    e.mid.connect(e.midG); e.midG.connect(e.hum);

    // heat: 振幅のざらつき（AM）
    e.grit = ctx.createOscillator(); e.grit.type = 'square'; e.grit.frequency.value = 23;
    e.gritDepth = ctx.createGain(); e.gritDepth.gain.value = 0;
    e.grit.connect(e.gritDepth); e.gritDepth.connect(e.hum.gain);

    // heat: パチパチしたノイズ
    e.heatSrc = loopNoise(0.6);
    e.heatF = ctx.createBiquadFilter(); e.heatF.type = 'bandpass'; e.heatF.frequency.value = 900; e.heatF.Q.value = 1.4;
    e.heatG = ctx.createGain(); e.heatG.gain.value = 0;
    e.heatSrc.connect(e.heatF); e.heatF.connect(e.heatG); e.heatG.connect(e.out);

    // boosting: 噴射ノイズ（別系統、e.out を通さず直接）
    e.boostSrc = loopNoise(1);
    e.boostHP = ctx.createBiquadFilter(); e.boostHP.type = 'highpass'; e.boostHP.frequency.value = 160;
    e.boostLP = ctx.createBiquadFilter(); e.boostLP.type = 'lowpass'; e.boostLP.frequency.value = 2400; e.boostLP.Q.value = 1.2;
    e.boostG = ctx.createGain(); e.boostG.gain.value = 0;
    e.boostSrc.connect(e.boostHP); e.boostHP.connect(e.boostLP); e.boostLP.connect(e.boostG); e.boostG.connect(master);
    e.boostRumble = ctx.createOscillator(); e.boostRumble.type = 'sawtooth'; e.boostRumble.frequency.value = 48;
    e.boostRumbleF = ctx.createBiquadFilter(); e.boostRumbleF.type = 'lowpass'; e.boostRumbleF.frequency.value = 260;
    e.boostRumbleG = ctx.createGain(); e.boostRumbleG.gain.value = 0;
    e.boostRumble.connect(e.boostRumbleF); e.boostRumbleF.connect(e.boostRumbleG); e.boostRumbleG.connect(master);

    var t = now();
    e.a.start(t); e.b.start(t); e.sub.start(t); e.mid.start(t); e.grit.start(t); e.boostRumble.start(t);
    return e;
  }

  function buildServo() {
    var s = {};
    s.out = ctx.createGain(); s.out.gain.value = 0; s.out.connect(master);
    s.bp = ctx.createBiquadFilter(); s.bp.type = 'bandpass'; s.bp.frequency.value = 220; s.bp.Q.value = 3;
    s.bp.connect(s.out);
    s.a = ctx.createOscillator(); s.a.type = 'sawtooth'; s.a.frequency.value = 62;
    s.b = ctx.createOscillator(); s.b.type = 'sawtooth'; s.b.frequency.value = 63.7;
    s.a.connect(s.bp); s.b.connect(s.bp);
    // 油圧の高いうなり
    s.whine = ctx.createOscillator(); s.whine.type = 'triangle'; s.whine.frequency.value = 520;
    s.whineG = ctx.createGain(); s.whineG.gain.value = 0.12;
    s.whine.connect(s.whineG); s.whineG.connect(s.out);
    // 油の流れるシュー音
    s.hiss = loopNoise(0.8);
    s.hissF = ctx.createBiquadFilter(); s.hissF.type = 'bandpass'; s.hissF.frequency.value = 1400; s.hissF.Q.value = 2;
    s.hissG = ctx.createGain(); s.hissG.gain.value = 0.25;
    s.hiss.connect(s.hissF); s.hissF.connect(s.hissG); s.hissG.connect(s.out);
    var t = now();
    s.a.start(t); s.b.start(t); s.whine.start(t);
    return s;
  }

  // 天候：雨（高域のザー＋低いうなり）と風（帯域ノイズを LFO でうねらせる）。init で1回だけ作り、weather() はゲインだけ動かす
  function buildWeather() {
    var w = {};
    w.rain = loopNoise(1);
    w.rainHP = ctx.createBiquadFilter(); w.rainHP.type = 'highpass'; w.rainHP.frequency.value = 900;
    w.rainLP = ctx.createBiquadFilter(); w.rainLP.type = 'lowpass'; w.rainLP.frequency.value = 7000;
    w.rainG = ctx.createGain(); w.rainG.gain.value = 0;
    w.rain.connect(w.rainHP); w.rainHP.connect(w.rainLP); w.rainLP.connect(w.rainG); w.rainG.connect(master);
    w.roar = loopNoise(0.35);
    w.roarF = ctx.createBiquadFilter(); w.roarF.type = 'lowpass'; w.roarF.frequency.value = 420;
    w.roarG = ctx.createGain(); w.roarG.gain.value = 0;
    w.roar.connect(w.roarF); w.roarF.connect(w.roarG); w.roarG.connect(master);
    w.wind = loopNoise(0.5);
    w.windF = ctx.createBiquadFilter(); w.windF.type = 'bandpass'; w.windF.frequency.value = 380; w.windF.Q.value = 1.6;
    w.windG = ctx.createGain(); w.windG.gain.value = 0;
    w.lfo = ctx.createOscillator(); w.lfo.type = 'sine'; w.lfo.frequency.value = 0.13;
    w.lfoG = ctx.createGain(); w.lfoG.gain.value = 140;
    w.lfo.connect(w.lfoG); w.lfoG.connect(w.windF.frequency);
    w.wind.connect(w.windF); w.windF.connect(w.windG); w.windG.connect(master);
    w.lfo.start(now());
    return w;
  }

  // ---------------------------------------------------------------- 可視性
  function onVisibility() {
    if (!ctx) return;
    try {
      if (document.hidden) {
        hiddenSuspended = true;
        if (ctx.state === 'running') ctx.suspend().catch(function () {});
      } else {
        hiddenSuspended = false;
        if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(function () {});
      }
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------- API 実装
  function init() {
    try {
      if (ctx) {
        if (ctx.state !== 'running' && ctx.state !== 'closed') {
          var r = ctx.resume(); if (r && r.catch) r.catch(function () {});
        }
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var c = new AC({ latencyHint: 'interactive' });

      var m = c.createGain();
      m.gain.value = masterLevel;
      var k = c.createDynamicsCompressor();
      k.threshold.value = -16;
      k.knee.value = 12;
      k.ratio.value = 6;
      k.attack.value = 0.003;
      k.release.value = 0.22;
      m.connect(k);
      k.connect(c.destination);

      // ノイズバッファ（2秒、1回だけ生成）
      var len = Math.floor(c.sampleRate * 2);
      var b = c.createBuffer(1, len, c.sampleRate);
      var d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      ctx = c; master = m; comp = k; noiseBuf = b;
      eng = buildEngine();
      srv = buildServo();
      wth = buildWeather();

      if (!visBound && typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', onVisibility);
        visBound = true;
      }
      var p = ctx.resume(); if (p && p.catch) p.catch(function () {});
    } catch (e) { /* noop */ }
  }

  function haptic(ms) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(Math.max(1, Math.round(+ms || 0)));
      }
    } catch (e) { /* noop */ }
  }

  function uiClick() {
    var t = now();
    tone({ type: 'square', f0: 2600, t: t, dur: 0.012, gain: 0.05, attack: 0.0008,
      filter: { type: 'bandpass', f: 2600, Q: 3 } });
    tone({ type: 'sine', f0: 1320, f1: 1180, t: t + 0.006, dur: 0.05, gain: 0.08, attack: 0.001 });
    noise({ t: t, dur: 0.008, gain: 0.08, type: 'highpass', f0: 3000 });
  }

  function launchSequence() {
    var t = now() + 0.03;
    var i;
    // 0.0s〜: 機械ロック解除（2段のクランク）
    [0, 0.38, 0.62].forEach(function (o, n) {
      noise({ t: t + o, dur: 0.07, gain: 0.35, type: 'bandpass', f0: 1800 - n * 300, Q: 1.5 });
      thud(t + o, 120, 55, 0.18, 0.4);
      metalRing(t + o + 0.01, 310 + n * 47, 0.35, 0.05);
    });
    // 0.7s〜: 油圧（シュー＋ポンプ）
    noise({ t: t + 0.7, dur: 1.1, attack: 0.12, gain: 0.22, type: 'bandpass', f0: 600, f1: 2600, Q: 1.2 });
    tone({ type: 'sawtooth', f0: 70, f1: 140, t: t + 0.75, dur: 1.0, attack: 0.2, gain: 0.12,
      filter: { type: 'lowpass', f: 380, Q: 2 } });
    creak(t + 1.1, 95, 0.7, 0.12, -0.2);
    // 1.3s〜: 計器起動ビープ列
    var beeps = [880, 988, 1175, 1319, 1568, 1760, 1976];
    for (i = 0; i < beeps.length; i++) {
      tone({ type: 'square', f0: beeps[i], t: t + 1.3 + i * 0.13, dur: 0.06, gain: 0.045,
        filter: { type: 'lowpass', f: 3500 }, pan: (i % 2 ? 0.3 : -0.3) });
    }
    tone({ type: 'sine', f0: 2349, t: t + 2.25, dur: 0.35, gain: 0.06 });
    // 2.0s〜: 炉の起動（低いうなりが上昇）
    var rs = t + 2.0, re = t + 4.4;
    var ro = ctx.createOscillator(); ro.type = 'sawtooth';
    ro.frequency.setValueAtTime(22, rs);
    ro.frequency.exponentialRampToValueAtTime(58, re);
    var ro2 = ctx.createOscillator(); ro2.type = 'sawtooth';
    ro2.frequency.setValueAtTime(33.5, rs);
    ro2.frequency.exponentialRampToValueAtTime(88, re);
    var rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.Q.value = 6;
    rf.frequency.setValueAtTime(90, rs);
    rf.frequency.exponentialRampToValueAtTime(900, re);
    var rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, rs);
    rg.gain.exponentialRampToValueAtTime(0.22, re - 0.2);
    rg.gain.linearRampToValueAtTime(0.0001, re + 0.15);
    ro.connect(rf); ro2.connect(rf); rf.connect(rg); rg.connect(master);
    ro.start(rs); ro2.start(rs); ro.stop(re + 0.2); ro2.stop(re + 0.2);
    autoDisconnect(ro, [ro, ro2, rf, rg]);
    tone({ type: 'sine', f0: 400, f1: 1600, t: rs + 0.5, dur: 3.0, attack: 2.5, gain: 0.025, slide: 3.0 });
    // 2.8s〜: 心拍（加速）
    var hb = t + 2.8, gap = 0.72;
    while (hb < t + 4.2) {
      thud(hb, 85, 38, 0.2, 0.55);
      thud(hb + 0.17, 75, 35, 0.16, 0.35);
      hb += gap; gap *= 0.86;
    }
    // 4.4s: ゲート開放の重低音インパクト（映像側の演出は5.5秒で完了）
    var gi = t + 4.4;
    thud(gi, 95, 24, 1.6, 1.0);
    tone({ type: 'sine', f0: 48, f1: 30, t: gi, dur: 2.2, gain: 0.6, attack: 0.01 });
    noise({ t: gi, dur: 1.6, gain: 0.55, type: 'lowpass', f0: 3000, f1: 140, Q: 0.5 });
    noise({ t: gi + 0.02, dur: 0.9, gain: 0.2, type: 'bandpass', f0: 250, Q: 0.9 });
    metalRing(gi + 0.01, 140, 1.4, 0.12);
    creak(gi + 0.25, 70, 1.2, 0.1, 0.25);
    setTimeout(function () { haptic(120); }, 4400);
  }

  var LEG_PITCH = [1.0, 0.96, 0.91, 0.88];
  var LEG_PAN = [-0.4, 0.4, -0.22, 0.22];

  function footstep(leg, intensity) {
    leg = (leg | 0) & 3;
    var k = clamp01(intensity == null ? 0.7 : intensity);
    var t = now();
    // 同じ脚の連打は無視（多重発音抑制）
    if (t - lastFootT[leg] < 0.06) return;
    lastFootT[leg] = t;
    var p = LEG_PITCH[leg] * (0.97 + Math.random() * 0.06);
    var pan = LEG_PAN[leg];
    var g = 0.35 + k * 0.65;
    // サブ低音（ピッチ下降）
    thud(t, 78 * p, 30 * p, 0.45 + k * 0.35, 0.9 * g, pan);
    // 地面の鈍いアタック
    noise({ t: t, dur: 0.12 + k * 0.1, gain: 0.35 * g, type: 'lowpass', f0: 900 + k * 900, f1: 160, Q: 0.6, pan: pan });
    // 砂利
    noise({ t: t + 0.015, dur: 0.25 + k * 0.2, attack: 0.01, gain: 0.12 * g, type: 'bandpass', f0: 2600 * p, f1: 1200, Q: 0.9, rate: 0.7, pan: pan });
    // 金属の軋み
    creak(t + 0.04 + Math.random() * 0.04, 110 * p + Math.random() * 20, 0.3 + k * 0.2, 0.07 * g, pan);
    if (k > 0.5) metalRing(t + 0.005, 180 * p, 0.25, 0.04 * k, pan);
    haptic(20 + 40 * k);
  }

  function engine(speed01, heat01, boosting) {
    if (!eng) return;
    var s = clamp01(speed01), h = clamp01(heat01), b = !!boosting;
    var t = now(), tc = 0.12;
    var base = 32 + s * 22 + (b ? 6 : 0);
    eng.a.frequency.setTargetAtTime(base, t, tc);
    eng.b.frequency.setTargetAtTime(base * 1.5, t, tc);
    eng.sub.frequency.setTargetAtTime(base, t, tc);
    eng.mid.frequency.setTargetAtTime(base * 4, t, tc);
    eng.filter.frequency.setTargetAtTime(160 + s * 520 + h * 420, t, tc);
    eng.out.gain.setTargetAtTime(0.1 + s * 0.1 + (b ? 0.04 : 0), t, tc);
    eng.midG.gain.setTargetAtTime(0.14 + s * 0.12, t, tc);
    eng.gritDepth.gain.setTargetAtTime(h * h * 0.7, t, 0.2);
    eng.grit.frequency.setTargetAtTime(17 + h * 26, t, 0.2);
    eng.heatG.gain.setTargetAtTime(h * h * h * 0.35, t, 0.2);
    eng.boostG.gain.setTargetAtTime(b ? 0.2 : 0, t, b ? 0.05 : 0.15);
    eng.boostLP.frequency.setTargetAtTime(b ? 3200 : 1200, t, 0.1);
    eng.boostRumbleG.gain.setTargetAtTime(b ? 0.12 : 0, t, b ? 0.05 : 0.15);
  }

  function servo(turnRate01) {
    if (!srv) return;
    var r = clamp01(Math.abs(+turnRate01 || 0));
    var t = now(), tc = 0.08;
    srv.out.gain.setTargetAtTime(r * 0.13, t, tc);
    srv.a.frequency.setTargetAtTime(58 + r * 46, t, tc);
    srv.b.frequency.setTargetAtTime(59.6 + r * 48, t, tc);
    srv.bp.frequency.setTargetAtTime(180 + r * 320, t, tc);
    srv.whine.frequency.setTargetAtTime(420 + r * 520, t, tc);
  }

  function jumpBoost() {
    var t = now();
    noise({ t: t, dur: 0.05, gain: 0.3, type: 'highpass', f0: 1500 }); // 点火
    noise({ t: t + 0.02, dur: 0.9, attack: 0.08, gain: 0.4, type: 'bandpass', f0: 300, f1: 2200, Q: 0.8, slide: 0.5 });
    tone({ type: 'sawtooth', f0: 40, f1: 85, t: t, dur: 0.9, attack: 0.06, gain: 0.3, slide: 0.6,
      filter: { type: 'lowpass', f: 300, Q: 1.5 } });
    thud(t, 70, 40, 0.35, 0.5);
    creak(t + 0.05, 85, 0.4, 0.08, 0);
    haptic(40);
  }

  function land(intensity) {
    var k = clamp01(intensity == null ? 1 : intensity);
    var t = now();
    var g = 0.55 + k * 0.45;
    thud(t, 70, 22, 0.9 + k * 0.6, 1.0 * g);
    tone({ type: 'sine', f0: 44, f1: 26, t: t + 0.02, dur: 1.2, gain: 0.5 * g });
    noise({ t: t, dur: 0.35 + k * 0.3, gain: 0.5 * g, type: 'lowpass', f0: 1800, f1: 120 });
    noise({ t: t + 0.03, dur: 0.6 + k * 0.4, attack: 0.02, gain: 0.18 * g, type: 'bandpass', f0: 2200, f1: 900, Q: 0.8, rate: 0.6 });
    metalRing(t + 0.01, 120, 0.7, 0.09 * g);
    creak(t + 0.08, 80, 0.6, 0.11 * g, -0.3);
    creak(t + 0.15, 96, 0.5, 0.09 * g, 0.3);
    noise({ t: t + 0.12, dur: 0.6, attack: 0.05, gain: 0.1 * g, type: 'bandpass', f0: 1600, Q: 1.5 }); // 油圧ダンパ
    haptic(60 + 60 * k);
  }

  function fire() {
    if (fireVoices >= MAX_FIRE_VOICES) return;
    fireVoices++;
    var t = now();
    var done = false;
    function release() { if (!done) { done = true; fireVoices = Math.max(0, fireVoices - 1); } }
    // 発砲の破裂
    noise({ t: t, dur: 0.22, gain: 0.7, type: 'lowpass', f0: 6000, f1: 260, Q: 0.6 });
    // 胸に来る低音
    tone({ type: 'sine', f0: 120, f1: 34, t: t, dur: 0.38, gain: 0.95, attack: 0.002, slide: 0.18 });
    tone({ type: 'triangle', f0: 260, f1: 90, t: t, dur: 0.16, gain: 0.4, attack: 0.001, slide: 0.1 });
    // 機構のガチャン
    tone({ type: 'square', f0: 1900, f1: 900, t: t + 0.005, dur: 0.03, gain: 0.05, attack: 0.0005 });
    // 短いテール（遠鳴り）— これの終了でボイス解放
    noise({ t: t + 0.03, dur: 0.6, attack: 0.02, gain: 0.12, type: 'bandpass', f0: 420, f1: 180, Q: 0.7, onDone: release });
    setTimeout(release, 900); // 保険
    haptic(25);
  }

  function lockOn() {
    var t = now();
    tone({ type: 'square', f0: 1480, t: t, dur: 0.045, gain: 0.05, filter: { type: 'lowpass', f: 4000 } });
    tone({ type: 'square', f0: 1480, t: t + 0.08, dur: 0.045, gain: 0.05, filter: { type: 'lowpass', f: 4000 } });
    tone({ type: 'square', f0: 1976, t: t + 0.16, dur: 0.18, gain: 0.06, filter: { type: 'lowpass', f: 4500 } });
    tone({ type: 'sine', f0: 988, t: t + 0.16, dur: 0.22, gain: 0.05 });
  }

  function hitEnemy() {
    var t = now();
    noise({ t: t, dur: 0.03, gain: 0.3, type: 'highpass', f0: 2500 });
    metalRing(t, 430 + Math.random() * 80, 0.35, 0.16, (Math.random() - 0.5) * 0.4);
    tone({ type: 'triangle', f0: 180, f1: 90, t: t, dur: 0.12, gain: 0.3 });
  }

  function explosion(size) {
    var k = clamp01(size == null ? 0.6 : size);
    var t = now();
    var d = 0.7 + k * 1.6;
    noise({ t: t, dur: d, attack: 0.005, gain: 0.45 + k * 0.4, type: 'lowpass', f0: 2500 + k * 2500, f1: 120, Q: 0.5 });
    noise({ t: t + 0.05, dur: d * 0.8, attack: 0.04, gain: 0.15 + k * 0.1, type: 'bandpass', f0: 400, f1: 180, Q: 0.8, rate: 0.5 });
    thud(t, 90 - k * 30, 22, d, 0.6 + k * 0.4);
    // 破片のパチパチ
    var n = 3 + Math.round(k * 5);
    for (var i = 0; i < n; i++) {
      noise({ t: t + 0.1 + Math.random() * d * 0.6, dur: 0.03, gain: 0.08, type: 'bandpass', f0: 1500 + Math.random() * 3000, Q: 2,
        pan: (Math.random() - 0.5) * 1.2 });
    }
    if (k > 0.6) haptic(30 + 50 * k);
  }

  function damage(amount) {
    var k = clamp01(amount == null ? 0.5 : (amount > 1 ? amount / 100 : amount));
    var t = now();
    var g = 0.5 + k * 0.5;
    // コックピットに響く衝撃
    thud(t, 110, 32, 0.6 + k * 0.4, 0.95 * g);
    noise({ t: t, dur: 0.25, gain: 0.5 * g, type: 'lowpass', f0: 2500, f1: 200 });
    metalRing(t + 0.005, 260, 0.6, 0.1 * g);
    // ガラスの軋み（高域の揺れる狭帯域音＋微小なヒビ）
    var gt = t + 0.06;
    var go = ctx.createOscillator(); go.type = 'sawtooth';
    go.frequency.setValueAtTime(2100 + Math.random() * 400, gt);
    go.frequency.linearRampToValueAtTime(1700, gt + 0.5);
    var gl = ctx.createOscillator(); gl.frequency.value = 31;
    var glg = ctx.createGain(); glg.gain.value = 120;
    gl.connect(glg); glg.connect(go.frequency);
    var gf = ctx.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 3200; gf.Q.value = 8;
    var gg = envGain(gt, 0.03, 0.05 * g, 0.5);
    go.connect(gf); gf.connect(gg); gg.connect(master);
    go.start(gt); gl.start(gt); go.stop(gt + 0.6); gl.stop(gt + 0.6);
    autoDisconnect(go, [go, gl, glg, gf, gg]);
    for (var i = 0; i < 4; i++) {
      noise({ t: gt + Math.random() * 0.35, dur: 0.012, gain: 0.08 * g, type: 'highpass', f0: 5000 });
    }
    haptic(40 + 60 * k);
  }

  function alarmTick() {
    if (!canPlay() || ctx.state !== 'running') return;
    var t = now();
    tone({ type: 'square', f0: 784, t: t, dur: 0.18, gain: 0.05, attack: 0.01, filter: { type: 'lowpass', f: 2200 } });
    tone({ type: 'square', f0: 587, t: t + 0.22, dur: 0.22, gain: 0.05, attack: 0.01, filter: { type: 'lowpass', f: 2200 } });
  }

  function alarm(on) {
    if (on) {
      if (alarmTimer) return;
      alarmTick();
      alarmTimer = setInterval(function () { try { alarmTick(); } catch (e) { /* noop */ } }, 900);
    } else if (alarmTimer) {
      clearInterval(alarmTimer);
      alarmTimer = null;
    }
  }

  function resonanceUp() {
    var t = now();
    var notes = [1047, 1319, 1568, 2093];
    for (var i = 0; i < notes.length; i++) {
      tone({ type: 'triangle', f0: notes[i], t: t + i * 0.045, dur: 0.22, gain: 0.05, pan: -0.3 + i * 0.2 });
      tone({ type: 'sine', f0: notes[i] * 2.01, t: t + i * 0.045, dur: 0.12, gain: 0.02 });
    }
  }

  function beatTick() {
    if (!canPlay() || ctx.state !== 'running') return;
    var t = now();
    thud(t, 95, 36, 0.24, 0.7);
    noise({ t: t, dur: 0.02, gain: 0.08, type: 'bandpass', f0: 1800, Q: 1 });
    thud(t + 0.18, 80, 34, 0.2, 0.45);
    tone({ type: 'sine', f0: 52, t: t, dur: 0.4, gain: 0.25, attack: 0.01 });
    haptic(25);
  }

  function overbeat(on) {
    if (on) {
      if (beatTimer) return;
      beatTick();
      beatTimer = setInterval(function () { try { beatTick(); } catch (e) { /* noop */ } }, 500);
    } else if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
  }

  function synthNote(f, t, d, g) {
    tone({ type: 'sawtooth', f0: f, t: t, dur: d, gain: g, attack: 0.01, filter: { type: 'lowpass', f: 2400, f1: 900, Q: 1 } });
    tone({ type: 'square', f0: f * 0.5, t: t, dur: d, gain: g * 0.5, attack: 0.01, detune: 6, filter: { type: 'lowpass', f: 900 } });
  }

  function victory() {
    var t = now() + 0.02;
    // 独自の上昇フレーズ（D系、4度と5度の跳躍）
    var seq = [[294, 0, 0.15], [392, 0.14, 0.15], [440, 0.28, 0.15], [587, 0.42, 0.3], [523, 0.74, 0.12], [587, 0.88, 0.12], [740, 1.02, 0.9]];
    for (var i = 0; i < seq.length; i++) synthNote(seq[i][0], t + seq[i][1], seq[i][2], 0.07);
    thud(t + 1.02, 90, 40, 0.8, 0.6);
    tone({ type: 'sine', f0: 147, t: t + 1.02, dur: 1.2, gain: 0.15, attack: 0.05 });
  }

  function defeat() {
    var t = now() + 0.02;
    var seq = [[392, 0, 0.35], [349, 0.35, 0.35], [311, 0.7, 0.35], [262, 1.05, 0.5], [233, 1.6, 1.3]];
    for (var i = 0; i < seq.length; i++) synthNote(seq[i][0], t + seq[i][1], seq[i][2], 0.06);
    tone({ type: 'sawtooth', f0: 58, f1: 29, t: t + 1.6, dur: 2.0, gain: 0.25, attack: 0.1,
      filter: { type: 'lowpass', f: 300, f1: 80, Q: 2 } });
  }

  function setMaster(v) {
    masterLevel = clamp01(v);
    if (master && ctx) {
      try { master.gain.setTargetAtTime(masterLevel, ctx.currentTime, 0.03); } catch (e) { /* noop */ }
    }
  }

  // ---------------------------------------------------------------- 追加（MISSION 02 / 整備）
  // 2回目以降の短縮出撃（約1秒）：ロック解除→ゲート開放
  function launchShort() {
    var t = now() + 0.02;
    noise({ t: t, dur: 0.07, gain: 0.3, type: 'bandpass', f0: 1600, Q: 1.5 });
    thud(t, 120, 55, 0.18, 0.4);
    for (var i = 0; i < 4; i++) {
      tone({ type: 'square', f0: 1175 + i * 200, t: t + 0.1 + i * 0.08, dur: 0.05, gain: 0.04, filter: { type: 'lowpass', f: 3500 } });
    }
    var gi = t + 0.7;
    thud(gi, 95, 24, 1.2, 0.9);
    noise({ t: gi, dur: 1.1, gain: 0.45, type: 'lowpass', f0: 3000, f1: 140, Q: 0.5 });
    metalRing(gi + 0.01, 140, 1.0, 0.1);
    haptic(80);
  }

  // 突進型の溜め：上昇する警告音（約1秒）
  function ramCharge(dur) {
    var d = Math.max(0.3, Math.min(2, +dur || 1));
    var t = now();
    tone({ type: 'sawtooth', f0: 180, f1: 900, t: t, dur: d, attack: 0.05, gain: 0.08, slide: d,
      filter: { type: 'bandpass', f: 700, f1: 2400, Q: 3 } });
    tone({ type: 'square', f0: 60, f1: 120, t: t, dur: d, attack: 0.1, gain: 0.08, slide: d,
      filter: { type: 'lowpass', f: 300 } });
    var n = Math.round(d / 0.16);
    for (var i = 0; i < n; i++) {
      tone({ type: 'square', f0: 1500, t: t + i * 0.16, dur: 0.05, gain: 0.035, filter: { type: 'lowpass', f: 3000 } });
    }
  }

  // 突進型の激突（壁・コンテナ・機体）
  function ramImpact(size) {
    var k = clamp01(size == null ? 0.7 : size);
    var t = now();
    thud(t, 100, 26, 0.9 + k * 0.5, 0.8 + k * 0.2);
    noise({ t: t, dur: 0.5 + k * 0.4, gain: 0.5, type: 'lowpass', f0: 3500, f1: 150, Q: 0.6 });
    metalRing(t + 0.005, 190, 0.9, 0.12);
    metalRing(t + 0.02, 263, 0.6, 0.07);
    creak(t + 0.1, 70, 0.7, 0.1, 0);
    haptic(60 + 80 * k);
  }

  // 殻王の形態変化：殻が剥がれる轟音
  function bossShift() {
    var t = now();
    tone({ type: 'sawtooth', f0: 55, f1: 28, t: t, dur: 2.6, attack: 0.3, gain: 0.3,
      filter: { type: 'lowpass', f: 500, f1: 120, Q: 4 } });
    tone({ type: 'sawtooth', f0: 220, f1: 660, t: t + 0.4, dur: 2.0, attack: 0.6, gain: 0.05, slide: 2.0,
      filter: { type: 'bandpass', f: 900, Q: 5 } });
    for (var i = 0; i < 5; i++) {
      var o = 0.5 + i * 0.42;
      noise({ t: t + o, dur: 0.4, gain: 0.35, type: 'lowpass', f0: 2600, f1: 200 });
      metalRing(t + o, 150 + i * 23, 0.8, 0.08);
    }
    thud(t + 2.6, 90, 22, 1.6, 1.0);
    haptic(200);
  }

  // 地面を這う衝撃波
  function shockwave() {
    var t = now();
    thud(t, 70, 20, 1.4, 1.0);
    noise({ t: t, dur: 1.4, gain: 0.45, type: 'lowpass', f0: 900, f1: 80, Q: 0.7 });
    noise({ t: t + 0.05, dur: 1.2, attack: 0.1, gain: 0.15, type: 'bandpass', f0: 300, f1: 120, Q: 1, rate: 0.5 });
    haptic(120);
  }

  // 整備（強化）：重い機械音
  function upgrade(level) {
    var k = clamp01((+level || 1) / 5);
    var t = now();
    [0, 0.16, 0.42].forEach(function (o, n) {
      thud(t + o, 110 - n * 15, 40, 0.3, 0.5);
      noise({ t: t + o, dur: 0.06, gain: 0.3, type: 'bandpass', f0: 1600 - n * 300, Q: 1.5 });
      metalRing(t + o + 0.01, 280 + n * 60 + k * 80, 0.5, 0.07);
    });
    noise({ t: t + 0.5, dur: 0.6, attack: 0.05, gain: 0.18, type: 'bandpass', f0: 500, f1: 2000, Q: 1.2 });
    tone({ type: 'triangle', f0: 880 + k * 300, t: t + 0.95, dur: 0.25, gain: 0.05 });
    tone({ type: 'triangle', f0: 1320 + k * 450, t: t + 1.05, dur: 0.35, gain: 0.05 });
    haptic(60);
  }

  // ---------------------------------------------------------------- MISSION 03（嵐）
  // 雨・風の持続音（毎フレーム呼んでよい。ノードは作らない）
  function weather(rain01, wind01) {
    if (!wth) return;
    var r = clamp01(rain01), w = clamp01(wind01), t = now();
    wth.rainG.gain.setTargetAtTime(r * 0.16, t, 0.4);
    wth.roarG.gain.setTargetAtTime(r * 0.12, t, 0.4);
    wth.windG.gain.setTargetAtTime(r > 0 ? 0.04 + w * 0.14 : 0, t, 0.6);
    wth.windF.frequency.setTargetAtTime(260 + w * 420, t, 0.8);
  }

  // 雷鳴：k=1 で至近の落雷（鋭い破裂音つき）、小さいほど遠い
  function thunder(k) {
    k = clamp01(k == null ? 0.6 : k);
    var t = now();
    if (k > 0.85) {
      noise({ t: t, dur: 0.22, gain: 0.55, type: 'highpass', f0: 1600 });
      noise({ t: t, dur: 0.5, gain: 0.45, type: 'bandpass', f0: 2400, f1: 500, Q: 0.8 });
    }
    thud(t + 0.02, 70, 24, 1.6 + k, 0.5 + 0.4 * k);
    noise({ t: t + 0.03, dur: 2.2 + k * 1.5, attack: 0.08, gain: 0.25 + 0.35 * k, type: 'lowpass', f0: 700 + k * 900, f1: 70, Q: 0.6, rate: 0.5 });
    noise({ t: t + 0.5 + Math.random() * 0.4, dur: 1.8, attack: 0.25, gain: 0.2 * k + 0.08, type: 'lowpass', f0: 380, f1: 60, Q: 0.7, rate: 0.4 });
    haptic(40 + 120 * k);
  }

  // 震動探知のピン：ソナーのような音。k が小さいと反応なし（弱く短い）
  function tremorPing(k) {
    k = clamp01(k == null ? 1 : k);
    var t = now();
    thud(t, 90, 40, 0.3, 0.35);
    tone({ type: 'sine', f0: 1180, f1: 1090, t: t + 0.02, dur: 0.5 + 0.4 * k, gain: 0.07 + 0.06 * k });
    if (k > 0.5) tone({ type: 'sine', f0: 590, t: t + 0.08, dur: 0.9, gain: 0.05, attack: 0.02 });
  }

  // 霧殻：霧を出す前のさえずり（高い3連＋低いうなり）
  function hazeChirp() {
    var t = now();
    for (var i = 0; i < 3; i++) {
      tone({ type: 'triangle', f0: 1700 + i * 260, f1: 2500 + i * 260, t: t + i * 0.11, dur: 0.08, gain: 0.05,
        filter: { type: 'bandpass', f: 2200, Q: 2 } });
    }
    tone({ type: 'sine', f0: 210, f1: 170, t: t, dur: 1.2, attack: 0.1, gain: 0.06 });
  }

  // 計器異常に入った瞬間の砂嵐
  function jam() {
    var t = now();
    noise({ t: t, dur: 0.3, gain: 0.12, type: 'bandpass', f0: 2600, Q: 1.2 });
    tone({ type: 'square', f0: 120, t: t, dur: 0.12, gain: 0.03, filter: { type: 'lowpass', f: 900 } });
  }

  // 観測塔の起動：電源が入って上がっていく音＋2つのベル
  function towerOnline() {
    var t = now();
    tone({ type: 'sawtooth', f0: 90, f1: 360, t: t, dur: 0.7, attack: 0.05, gain: 0.08, slide: 0.6, filter: { type: 'lowpass', f: 600, f1: 2400 } });
    noise({ t: t, dur: 0.6, attack: 0.1, gain: 0.08, type: 'bandpass', f0: 400, f1: 2400, Q: 1.5 });
    tone({ type: 'triangle', f0: 880, t: t + 0.65, dur: 0.4, gain: 0.07 });
    tone({ type: 'triangle', f0: 1320, t: t + 0.8, dur: 0.6, gain: 0.07 });
    metalRing(t + 0.65, 440, 0.8, 0.05);
  }

  // 渦殻王が泥の下で浮上の準備：低い地鳴り＋泡
  function maelRumble(dur) {
    var d = Math.max(0.4, Math.min(3, +dur || 1.5));
    var t = now();
    tone({ type: 'sawtooth', f0: 34, f1: 52, t: t, dur: d, attack: 0.2, gain: 0.28, slide: d, filter: { type: 'lowpass', f: 160, f1: 320 } });
    noise({ t: t, dur: d, attack: 0.2, gain: 0.3, type: 'lowpass', f0: 180, f1: 420, Q: 0.8, rate: 0.4 });
    for (var i = 0; i < 6; i++) {
      tone({ type: 'sine', f0: 180 + Math.random() * 260, f1: 420 + Math.random() * 300, t: t + Math.random() * d, dur: 0.07, gain: 0.04 });
    }
    haptic(Math.round(d * 120));
  }

  // 渦殻王の浮上（突き上げ）：泥と水しぶき
  function maelBurst() {
    var t = now();
    thud(t, 75, 22, 1.3, 1.0);
    noise({ t: t, dur: 1.3, gain: 0.55, type: 'lowpass', f0: 3200, f1: 260, Q: 0.6 });
    noise({ t: t + 0.05, dur: 0.9, attack: 0.05, gain: 0.25, type: 'highpass', f0: 2200 });
    creak(t + 0.15, 60, 0.9, 0.08, 0);
  }

  // 渦殻王が雷を呼ぶ：予告円のあいだ高まるパチパチ
  function stormCall(dur) {
    var d = Math.max(0.5, Math.min(3, +dur || 2));
    var t = now();
    noise({ t: t, dur: d, attack: d * 0.8, gain: 0.16, type: 'bandpass', f0: 700, f1: 3400, Q: 2, slide: d });
    tone({ type: 'square', f0: 70, f1: 150, t: t, dur: d, attack: 0.3, gain: 0.05, slide: d, filter: { type: 'lowpass', f: 400 } });
  }

  // ---------------------------------------------------------------- 公開
  function guard(fn, allowWhenStopped) {
    return function () {
      if (!ctx || !master || !noiseBuf) return;
      if (!allowWhenStopped && !canPlay()) return;
      try { return fn.apply(null, arguments); } catch (e) {
        // window.MECH_AUDIO_DEBUG = true で内部エラーをログ出力
        try { if (window.MECH_AUDIO_DEBUG) console.error('[MechAudio]', e); } catch (e2) { /* noop */ }
      }
    };
  }

  window.MechAudio = {
    init: init,
    uiClick: guard(uiClick),
    launchSequence: guard(launchSequence),
    footstep: guard(footstep),
    engine: guard(engine, true),
    servo: guard(servo, true),
    jumpBoost: guard(jumpBoost),
    land: guard(land),
    fire: guard(fire),
    lockOn: guard(lockOn),
    hitEnemy: guard(hitEnemy),
    explosion: guard(explosion),
    damage: guard(damage),
    alarm: guard(alarm, true),
    resonanceUp: guard(resonanceUp),
    overbeat: guard(overbeat, true),
    victory: guard(victory),
    defeat: guard(defeat),
    setMaster: function (v) { try { setMaster(v); } catch (e) { /* noop */ } },
    haptic: guard(haptic, true),
    launchShort: guard(launchShort),
    ramCharge: guard(ramCharge),
    ramImpact: guard(ramImpact),
    bossShift: guard(bossShift),
    shockwave: guard(shockwave),
    upgrade: guard(upgrade),
    weather: guard(weather, true),
    thunder: guard(thunder),
    tremorPing: guard(tremorPing),
    hazeChirp: guard(hazeChirp),
    jam: guard(jam),
    towerOnline: guard(towerOnline),
    maelRumble: guard(maelRumble),
    maelBurst: guard(maelBurst),
    stormCall: guard(stormCall)
  };
})();
