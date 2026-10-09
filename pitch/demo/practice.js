// 最小対で練習 — minimal-pair practice for the demo page.
//
// A minimal pair (or triple) here = lexicon words with the same kana whose accent
// differs (箸1・橋2・端0, 雨1・飴0 …). Same-kana words with the *same* accent (紙2・髪2)
// are one option, not a pair. Multi-accent words: an option is usable only if it has a
// "distinctive" k that no other option of the group accepts (鹿[0,2] vs 歯科[1,2]: 0 vs 1);
// a group needs ≥ 2 usable options (巣[0,1] vs 酢[1] keeps only 巣 → no pair).
//
// The pure functions are exported for tests (test/practice.test.js); initPractice()
// wires the DOM and gets the audio pipeline injected by demo.js, so this module has no
// browser-only imports.

import { pitchPattern, accentType, TYPE_NAMES } from '../src/accent.js';
import { fold } from './lexicon.js';

// ---------------------------------------------------------------- pure logic

const uniqSorted = (ks) => [...new Set(ks)].sort((a, b) => a - b);

/**
 * Group words into minimal pairs.
 * @returns {Array<{id, kana, morae, options: Option[], dropped: Option[]}>} in lexicon order, where
 *   Option = { id, words, label, accent (sorted), distinct (ks only this option accepts), k (synth/display k) }
 */
export function buildMinimalPairs(words) {
  const byKana = new Map();
  for (const w of words) {
    if (!byKana.has(w.kana)) byKana.set(w.kana, []);
    byKana.get(w.kana).push(w);
  }
  const groups = [];
  for (const [kana, ws] of byKana) {
    if (ws.length < 2) continue;
    // Merge words with identical accent sets into one option (紙・髪).
    const opts = new Map();
    for (const w of ws) {
      const key = uniqSorted(w.accent).join(',');
      if (!opts.has(key)) opts.set(key, { id: w.id, words: [], accent: uniqSorted(w.accent) });
      opts.get(key).words.push(w);
    }
    const all = [...opts.values()];
    if (all.length < 2) continue;
    for (const o of all) {
      const others = new Set(all.filter((x) => x !== o).flatMap((x) => x.accent));
      o.distinct = o.accent.filter((k) => !others.has(k));
      // Prefer the first word's own order (its main accent first) among the distinctive ks.
      o.k = o.words[0].accent.find((k) => o.distinct.includes(k)) ?? o.words[0].accent[0];
      o.label = o.words.map((w) => w.surface).join('・');
    }
    const options = all.filter((o) => o.distinct.length > 0);
    if (options.length < 2) continue;
    groups.push({ id: kana, kana, morae: ws[0].morae, options, dropped: all.filter((o) => o.distinct.length === 0) });
  }
  return groups;
}

/**
 * Which option(s) of the group a detected downstep k sounds like, relative to a target.
 * verdict: 'match' (only the target accepts k) · 'ambiguous' (target and another option)
 *          'other' (only other option(s)) · 'none' (no option accepts k)
 */
export function classifyAgainstPair(detectedK, group, targetId) {
  const target = group.options.find((o) => o.id === targetId) ?? group.options[0];
  const matches = group.options.filter((o) => o.accent.includes(detectedK));
  const matchesTarget = matches.includes(target);
  let verdict;
  if (matches.length === 0) verdict = 'none';
  else if (matchesTarget) verdict = matches.length === 1 ? 'match' : 'ambiguous';
  else verdict = 'other';
  return { detectedK, target, matches, others: matches.filter((o) => o !== target), matchesTarget, verdict };
}

/** Pairs whose kana, surfaces or English glosses match the query (folded like the word search). */
export function filterPairs(groups, query) {
  const q = fold(query ?? '');
  if (!q) return groups;
  return groups.filter((g) => fold(g.kana).includes(q)
    || g.options.some((o) => o.words.some((w) => fold(w.surface).includes(q) || (q.length >= 2 && w.gloss.toLowerCase().includes(q)))));
}

/** A listening-drill question: a random option of the group, its k, a synth seed and voice. */
export function drillQuestion(group, rand = Math.random, prevId = null) {
  // Avoid repeating the previous answer twice in a row too often: re-draw once.
  let o = group.options[Math.floor(rand() * group.options.length)];
  if (o.id === prevId && group.options.length > 1) o = group.options[Math.floor(rand() * group.options.length)];
  return { optionId: o.id, k: o.k, seed: 1 + Math.floor(rand() * 9973), baseHz: Math.round(115 + rand() * 85) };
}

/** Session score after an answer. */
export function scoreAnswer(score, correct) {
  return { correct: score.correct + (correct ? 1 : 0), total: score.total + 1, streak: correct ? score.streak + 1 : 0 };
}
export const emptyScore = () => ({ correct: 0, total: 0, streak: 0 });

// ---------------------------------------------------------------- Japanese copy

const typeJa = (k, n) => TYPE_NAMES[accentType(k, n)].ja;
/** Where the pitch drops, in plain Japanese (same wording as the main checker). */
export function dropJa(k, morae, kana = morae.join('')) {
  if (k === 0) return '下がり目なし（「が」まで高い）';
  if (k >= morae.length) return `「${kana}」の後、「が」で下がる`;
  return `「${morae[k - 1]}」の後で下がる`;
}
const name = (o) => `『${o.label}』`;
const typeK = (k, g) => `${typeJa(k, g.morae.length)}［${k}］`;

/** Verdict + explanation for a classification: { pass, verdict, reason }. */
export function describeClassification(c, group) {
  const t = c.target;
  const g = group;
  const tGloss = t.words.map((w) => w.gloss).join(' / ');
  switch (c.verdict) {
    case 'match':
      return { pass: true, verdict: `✓ ${name(t)}に聞こえます`, reason: `下がり目の位置がターゲット${name(t)}（${tGloss}）の${typeK(t.k, g)}と一致しました。` };
    case 'ambiguous':
      return { pass: true, verdict: `✓ ${name(t)}の型です`, reason: `ターゲットの型と一致しました。ただしこの型（${typeK(c.detectedK, g)}）は${c.others.map(name).join('・')}にもあるため、この組では聞き分けの決め手になりません。${typeK(t.k, g)}で言うとはっきり区別できます。` };
    case 'other':
      return { pass: false, verdict: `✗ ${c.others.map(name).join('・')}に聞こえます`, reason: `あなたの発音は${typeK(c.detectedK, g)}（${dropJa(c.detectedK, g.morae, g.kana)}）でした。ターゲット${name(t)}は${typeK(t.k, g)}: ${dropJa(t.k, g.morae, g.kana)}。` };
    default:
      return { pass: false, verdict: '✗ どの語の型とも一致しません', reason: `あなたの発音は${typeK(c.detectedK, g)}（${dropJa(c.detectedK, g.morae, g.kana)}）でした。この組の型は ${g.options.map((o) => `${o.label}＝${typeK(o.k, g)}`).join('、')} です。ターゲット${name(t)}: ${dropJa(t.k, g.morae, g.kana)}。` };
  }
}

// ---------------------------------------------------------------- DOM wiring

const ERROR_TEXT = {
  'no-voice': '声が検出できませんでした。静かな場所で、スマホを口から15〜20 cm 離し、はっきり録音し直してください。',
  'too-short': '録音が短すぎます。単語だけでなく「が」まで続けて言ってください。',
};

/**
 * Wire the 「最小対で練習」 section. Does nothing if the section is not in the page.
 * deps: { words, loadUtterance, judgeSamples, play, synthesizeWord, sampleRate, sampleSeed, onJudged? }
 * onJudged(e): 判定のたびに呼ぶ（評価協力モード。e = { result, word, track, source, samples, rate, practice }）
 */
export function initPractice(deps) {
  const $ = (id) => document.getElementById(id);
  if (!$('practice')) return null;
  const { words, loadUtterance, judgeSamples, play, synthesizeWord, sampleRate = 16000, sampleSeed } = deps;
  const groups = buildMinimalPairs(words);
  const byId = new Map(groups.map((g) => [g.id, g]));
  let group = byId.get('はし') ?? groups[0];
  let targetId = null;
  let runId = 0;
  let score = emptyScore();
  let question = null;
  let lastAudio = null;

  if (!group) { $('practice').hidden = true; return null; }

  const synth = (o, opts = {}) => synthesizeWord(group.morae, opts.k ?? o.k, { sampleRate, baseHz: 140, seed: 7, ...opts });
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));

  // ----- pair list
  function renderSelect() {
    const list = filterPairs(groups, $('pair-search').value);
    const sel = $('pair-select');
    const frag = document.createDocumentFragment();
    for (const g of list) {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = `${g.kana} — ${g.options.map((x) => x.label).join('／')}`;
      frag.append(o);
    }
    sel.replaceChildren(frag);
    sel.disabled = list.length === 0;
    $('pair-count').textContent = list.length === groups.length
      ? `${groups.length} 組（読みが同じでアクセントだけ違う語）`
      : `${list.length} / ${groups.length} 組${list.length === 0 ? '（該当なし）' : ''}`;
    if (list.length === 0) return;
    if (list.includes(group)) sel.value = group.id;
    else selectPair(list[0]);
  }

  function moraeBox(k) {
    const n = group.morae.length;
    const pat = pitchPattern(k, n);
    const box = document.createElement('div');
    box.className = 'morae';
    [...group.morae, 'が'].forEach((m, i) => {
      const d = document.createElement('span');
      d.className = `mora${pat[i] ? ' hi' : ''}${i === n ? ' particle' : ''}${k > 0 && i === k - 1 ? ' drop-after' : ''}`;
      const tone = document.createElement('span');
      tone.className = 'tone';
      tone.textContent = pat[i] ? 'H' : 'L';
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = m;
      d.append(tone, kk);
      box.append(d);
    });
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `高低パターン: ${[...group.morae, 'が'].map((m, i) => `${m}${pat[i] ? '高' : '低'}`).join(' ')}`);
    return box;
  }

  function selectPair(g) {
    group = g;
    runId++;
    question = null;
    targetId = g.options.some((o) => o.id === targetId) ? targetId : (g.options.find((o) => o.words.some((w) => w.surface === '橋')) ?? g.options[0]).id;
    $('pair-select').value = g.id;
    const n = g.morae.length;
    const list = $('pair-contrast');
    const frag = document.createDocumentFragment();
    g.options.forEach((o, i) => {
      const card = document.createElement('div');
      card.className = 'pair-card';
      const label = document.createElement('label');
      label.className = 'pair-opt';
      label.htmlFor = `pair-target-${i}`;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'pair-target';
      radio.id = `pair-target-${i}`;
      radio.value = o.id;
      radio.checked = o.id === targetId;
      radio.addEventListener('change', () => { if (radio.checked) setTarget(o.id); });
      const head = document.createElement('span');
      head.className = 'pair-head';
      const sf = document.createElement('b');
      sf.className = 'pair-surface';
      sf.textContent = o.label;
      const gl = document.createElement('span');
      gl.className = 'en';
      gl.textContent = o.words.map((w) => w.gloss).join(' / ');
      head.append(sf, gl);
      const ty = document.createElement('span');
      ty.className = 'pair-type small';
      const also = o.accent.filter((k) => k !== o.k);
      ty.textContent = `${typeK(o.k, g)} ${dropJa(o.k, g.morae, g.kana)}${also.length ? `（${also.map((k) => typeK(k, g)).join('・')}とも）` : ''}`;
      label.append(radio, head, ty, moraeBox(o.k));
      const pb = document.createElement('button');
      pb.type = 'button';
      pb.className = 'pair-play';
      pb.id = `pair-play-${i}`;
      pb.textContent = '▶';
      pb.setAttribute('aria-label', `${o.label}のお手本を再生（合成音声）`);
      pb.addEventListener('click', () => { const { audio, sampleRate: sr } = synth(o); play(audio, sr); });
      card.append(label, pb);
      frag.append(card);
    });
    list.replaceChildren(frag);
    const note = $('pair-note');
    const extra = [];
    if (g.options.some((o) => o.words.length > 1)) extra.push(`${g.options.filter((o) => o.words.length > 1).map((o) => o.label).join('、')}は同じ型なので1つにまとめています。`);
    if (g.dropped.length) extra.push(`${g.dropped.map((o) => o.label).join('、')}はほかの語と同じ型も持つため、練習から外しています。`);
    note.textContent = extra.join(' ');
    note.hidden = extra.length === 0;
    $('pair-n').textContent = `${n} 拍＋「が」`;
    setTarget(targetId);
    renderDrill();
  }

  function setTarget(id) {
    targetId = id;
    runId++;
    const t = group.options.find((o) => o.id === id);
    for (const c of $('pair-contrast').children) c.classList.toggle('is-target', c.querySelector('input').value === id);
    $('pair-say').textContent = `「${group.kana}が」`;
    $('pair-say-word').textContent = `${t.label}（${typeK(t.k, group)}）`;
    setIdle();
  }

  // ----- say it (record → judge against the target)
  function setIdle() {
    $('pair-result').dataset.state = 'idle';
    $('pair-source').textContent = '';
    $('pair-verdict').textContent = '—';
    $('pair-verdict').dataset.pass = 'false';
    $('pair-reason').textContent = `ターゲットの型で「${group.kana}が」と言った録音を選ぶと、どの語に聞こえるかを判定します。`;
    $('pair-detected').hidden = true;
    $('pair-replay').disabled = !lastAudio;
  }

  function showError(msg) {
    $('pair-result').dataset.state = 'error';
    $('pair-verdict').textContent = '✗ 判定できません';
    $('pair-verdict').dataset.pass = 'false';
    $('pair-reason').textContent = msg;
    $('pair-detected').hidden = true;
  }

  function analyze(samples, rate, source, id) {
    const t = group.options.find((o) => o.id === targetId);
    const w = t.words[0];
    lastAudio = { samples, rate };
    $('pair-replay').disabled = false;
    const { tr, r } = judgeSamples(samples, rate, w);
    if (id !== runId) return;
    deps.onJudged?.({ result: r, word: w, track: tr, source, samples, rate, practice: { group: group.id, target: t.id, targetK: t.k, classification: r.error ? null : classifyAgainstPair(r.detectedK, group, targetId).verdict } });
    if (r.error) {
      showError(ERROR_TEXT[r.error] ?? r.error);
      window.__practiceLast = { result: r, classification: null, group: group.id, target: t.id, source };
      return;
    }
    const c = classifyAgainstPair(r.detectedK, group, targetId);
    const d = describeClassification(c, group);
    $('pair-result').dataset.state = 'done';
    $('pair-verdict').textContent = d.verdict;
    $('pair-verdict').dataset.pass = String(d.pass);
    $('pair-reason').textContent = d.reason + (r.flat ? ' 声の高さがほとんど平らでした（高低差が小さいため平板型として判定）。' : '');
    const det = $('pair-detected');
    det.hidden = false;
    det.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted small', textContent: 'あなたの型' }), moraeBox(r.detectedK));
    window.__practiceLast = { result: r, classification: { verdict: c.verdict, matchesTarget: c.matchesTarget, matches: c.matches.map((o) => o.id), detectedK: c.detectedK }, group: group.id, target: t.id, source };
  }

  async function runSample() {
    const id = ++runId;
    const t = group.options.find((o) => o.id === targetId);
    $('pair-result').dataset.state = 'busy';
    $('pair-source').textContent = `合成音声のサンプル（${t.label}・${typeK(t.k, group)}）`;
    await nextFrame();
    if (id !== runId) return;
    const seed = sampleSeed ? sampleSeed(t.words[0], t.k) : 7;
    const { audio, sampleRate: sr } = synth(t, { seed });
    analyze(audio, sr, { kind: 'sample', k: t.k }, id);
  }

  async function runFile(file) {
    if (!file) return;
    const id = ++runId;
    $('pair-result').dataset.state = 'busy';
    $('pair-source').textContent = `${file.name} を読み込み中…`;
    $('pair-verdict').textContent = '解析中…';
    await nextFrame();
    try {
      const u = await loadUtterance(file);
      if (id !== runId) return;
      const via = u.decoder && u.decoder !== 'native' ? '・内蔵デコーダで読み込み' : '';
      $('pair-source').textContent = `${file.name}（全体 ${u.duration.toFixed(1)} 秒のうち ${u.start.toFixed(1)}–${u.end.toFixed(1)} 秒を判定${via}）`;
      analyze(u.samples, u.rate, { kind: 'file', name: file.name, duration: u.duration, start: u.start, end: u.end, decoder: u.decoder }, id);
    } catch (e) {
      console.warn(e);
      if (id !== runId) return;
      $('pair-source').textContent = file.name;
      showError(e && e.message ? e.message : 'ファイルを読み込めませんでした。');
      window.__practiceLast = { result: null, error: String(e && e.message), group: group.id, target: targetId, source: { kind: 'file', name: file.name } };
    }
  }

  // ----- listening drill
  function renderScore() {
    $('drill-score').textContent = score.total
      ? `正解 ${score.correct} / ${score.total}（${Math.round((100 * score.correct) / score.total)}%）${score.streak >= 2 ? `・${score.streak} 問連続正解` : ''}`
      : 'スコア: まだ解答していません（このページを閉じるとリセット）';
    $('drill-reset').disabled = score.total === 0;
  }

  /** Answer buttons for the current pair; any open question is dropped. */
  function renderDrill() {
    question = null;
    const box = $('drill-answers');
    const frag = document.createDocumentFragment();
    group.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'drill-answer';
      b.id = `drill-answer-${i}`;
      b.dataset.option = o.id;
      b.textContent = o.label;
      b.disabled = true;
      b.addEventListener('click', () => answer(o.id));
      frag.append(b);
    });
    box.replaceChildren(frag);
    $('drill-play').textContent = '▶ 問題を再生';
    $('drill-replay').disabled = true;
    $('drill-feedback').textContent = '「▶ 問題を再生」を押して、どの語に聞こえたかを選んでください。';
    $('drill-feedback').dataset.state = 'idle';
  }

  function playQuestion() {
    const o = group.options.find((x) => x.id === question.optionId);
    const { audio, sampleRate: sr } = synth(o, { k: question.k, seed: question.seed, baseHz: question.baseHz });
    play(audio, sr);
  }

  function newQuestion() {
    question = { ...drillQuestion(group, Math.random, question?.optionId), answered: false };
    for (const b of $('drill-answers').children) { b.disabled = false; b.dataset.mark = ''; }
    $('drill-feedback').textContent = 'どの語に聞こえましたか？';
    $('drill-feedback').dataset.state = 'asking';
    $('drill-replay').disabled = false;
    $('drill-play').textContent = '▶ 次の問題';
    window.__practiceDrill = { group: group.id, optionId: question.optionId, k: question.k, answered: false };
    playQuestion();
  }

  function answer(id) {
    if (!question || question.answered) return;
    question.answered = true;
    const ok = id === question.optionId;
    score = scoreAnswer(score, ok);
    const right = group.options.find((o) => o.id === question.optionId);
    const picked = group.options.find((o) => o.id === id);
    for (const b of $('drill-answers').children) {
      b.disabled = true;
      b.dataset.mark = b.dataset.option === right.id ? 'right' : b.dataset.option === id ? 'wrong' : '';
    }
    const fb = $('drill-feedback');
    fb.dataset.state = ok ? 'right' : 'wrong';
    fb.textContent = ok
      ? `✓ 正解！ ${name(right)} — ${typeK(right.k, group)}・${dropJa(right.k, group.morae, group.kana)}`
      : `✗ ${name(picked)}ではなく${name(right)}でした — ${typeK(right.k, group)}・${dropJa(right.k, group.morae, group.kana)}。「もう一度聞く」で確かめられます。`;
    window.__practiceDrill = { group: group.id, optionId: question.optionId, k: question.k, answered: true, picked: id, correct: ok, score };
    renderScore();
  }

  // ----- wiring
  let searchTimer = 0;
  $('pair-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderSelect, 150); });
  $('pair-select').addEventListener('change', () => { const g = byId.get($('pair-select').value); if (g) selectPair(g); });
  $('pair-random').addEventListener('click', () => {
    const others = groups.filter((g) => g !== group);
    if (!others.length) return;
    $('pair-search').value = '';
    selectPair(others[Math.floor(Math.random() * others.length)]);
    renderSelect();
  });
  $('pair-file').addEventListener('change', () => { runFile($('pair-file').files[0]); $('pair-file').value = ''; });
  $('pair-sample').addEventListener('click', runSample);
  $('pair-replay').addEventListener('click', () => { if (lastAudio) play(lastAudio.samples, lastAudio.rate); });
  $('drill-play').addEventListener('click', newQuestion);
  $('drill-replay').addEventListener('click', () => { if (question) playQuestion(); });
  $('drill-reset').addEventListener('click', () => { score = emptyScore(); renderScore(); });
  const drop = $('pair-drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); runFile(e.dataTransfer?.files?.[0]); });

  renderSelect();
  selectPair(group);
  renderScore();
  return { groups };
}
