// P3 Pitch — Anki export (tab-separated text with HTML fields, Anki "Import File").
//
// Pure part (tested in test/anki.test.js): field builders, escaping, minimal-pair grouping,
// the whole TSV text. UI part (mountAnki): scope picker, download in a normal browser / the
// PWA, clipboard + <textarea readonly> fallback everywhere (the claude.ai Artifact blocks
// downloads). Nothing is sent anywhere. Also home of the small save/download helpers that
// demo/share.js reuses.
import { pitchPattern, accentType, TYPE_NAMES } from '../src/accent.js';
import * as practice from './practice.js';

export const ANKI_FILENAME = 'Pitch-anki.txt';
export const ANKI_DECK = 'Pitch::Accent';
export const ATTRIBUTION = 'Accent data: UniDic (NINJAL), BSD licence';

// ---------- text helpers (shared with share.js) ----------
const nMorae = (w) => w.morae.length;

/** Where the pitch drops, in plain Japanese (same wording as the page). */
export function dropJa(k, w) {
  if (k === 0) return '下がり目なし（「が」まで高い）';
  if (k >= nMorae(w)) return `「${w.kana}」の後、「が」で下がる`;
  return `「${w.morae[k - 1]}」の後で下がる`;
}
/** 「頭高型［1］」 */
export const typeLabel = (k, w) => `${TYPE_NAMES[accentType(k, nMorae(w))].ja}［${k}］`;

// ---------- escaping ----------
/** HTML-escape, and make the value safe for one TSV field: no tab, no line break, no quote. */
export function escapeField(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r\n?|\n/g, '<br>')
    .replace(/\t/g, ' ');
}
/** For values that are already HTML (built here): only strip TSV separators. */
const tsvSafe = (html) => String(html).replace(/\r\n?|\n/g, ' ').replace(/\t/g, ' ');

// ---------- fields ----------
export function ankiFront(w) {
  return `<div style="font-size:2em">${escapeField(w.surface)}</div><div>${escapeField(w.kana)}</div>`;
}

/**
 * Kana + が with the H/L pattern as an overline that breaks where the pitch drops
 * (inline styles only, so the stock Basic note type renders it), then type, drop and gloss.
 */
export function patternHtml(k, w) {
  const n = nMorae(w);
  const pat = pitchPattern(k, n);
  const spans = [...w.morae, 'が'].map((m, i) => {
    const st = ['display:inline-block', 'padding:2px 1px 0', `border-top:2px solid ${pat[i] ? 'currentColor' : 'transparent'}`];
    if (k > 0 && i === k - 1) st.push('border-right:2px solid currentColor');
    if (i === n) st.push('opacity:.55');
    return `<span class="${pat[i] ? 'h' : 'l'}" style="${st.join(';')}">${escapeField(m)}</span>`;
  }).join('');
  const hl = pat.map((p, i) => `${i === n ? '＋' : ''}${p ? 'H' : 'L'}`).join(' ');
  return `<div style="font-size:1.6em;line-height:1.6">${spans}</div><div style="font-size:.8em;opacity:.7">${hl}</div>`;
}

export function ankiBack(w) {
  const blocks = w.accent.map((k) => `${patternHtml(k, w)}<div>${escapeField(`${typeLabel(k, w)} ${dropJa(k, w)}`)}</div>`);
  return `${blocks.join('<div style="opacity:.7">または</div>')}<div style="opacity:.7">${escapeField(w.gloss)}</div>`;
}

export function ankiTags(w, extra = []) {
  const types = [...new Set(w.accent.map((k) => accentType(k, nMorae(w))))];
  return [...types.map((t) => `pitch::${t}`), ...extra, 'p3pitch'].map((t) => t.replace(/\s+/g, '_')).join(' ');
}

// ---------- deck ----------
export function ankiHeader(count) {
  return [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:${ANKI_DECK}`,
    '#columns:Front\tBack\tTags',
    '#tags column:3',
    `# P3 Pitch — ${count} notes. ${ATTRIBUTION}. Word list and glosses: P3 Pitch.`,
  ];
}

/** The whole import file. words: lexicon entries; opts.tags: extra tags per note. */
export function buildAnkiTsv(words, opts = {}) {
  const seen = new Set();
  const rows = [];
  for (const w of words) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    rows.push([ankiFront(w), ankiBack(w), ankiTags(w, opts.tags)].map(tsvSafe).join('\t'));
  }
  return `${[...ankiHeader(rows.length), ...rows].join('\n')}\n`;
}

/** Homophones with at least two different accents, e.g. 箸・橋・端 (grouped by kana, lexicon order). */
export function groupMinimalPairs(words) {
  const byKana = new Map();
  for (const w of words) {
    if (!byKana.has(w.kana)) byKana.set(w.kana, []);
    byKana.get(w.kana).push(w);
  }
  return [...byKana.values()].filter((g) => new Set(g.map((w) => w.accent[0])).size >= 2);
}

/**
 * Minimal-pair groups as word lists: demo/practice.js buildMinimalPairs() when present (it
 * also drops options with no distinctive accent, e.g. 巣[0,1] vs 酢[1]); else groupMinimalPairs().
 */
export function minimalPairGroups(words) {
  try {
    if (typeof practice.buildMinimalPairs === 'function') {
      const groups = practice.buildMinimalPairs(words).map((g) => (g.options ?? []).flatMap((o) => o.words ?? []));
      if (groups.length && groups.every((g) => g.length >= 2 && g.every((w) => w && w.kana))) return groups;
    }
  } catch { /* fall through */ }
  return groupMinimalPairs(words);
}

/** Words with at least one failed judgement in the session list ({ word, pass }). */
export function failedWords(session) {
  const out = new Map();
  for (const e of session) if (!e.pass && e.word) out.set(e.word.id, e.word);
  return [...out.values()];
}

// ---------- saving files ----------
/** Downloads work in a top-level page (PWA, normal browser), not in the sandboxed Artifact iframe. */
export function downloadCapable() {
  try { return window.top === window.self && typeof document.createElement('a').download === 'string'; } catch { return false; }
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- UI ----------
const SCOPES = {
  current: 'この単語',
  results: '検索結果',
  pairs: '同音で型が違う語',
  failed: 'この回で不合格だった単語',
};

/**
 * Wire the Anki panel (#anki-* in demo/template.html).
 * ctx: { words, byId, getCurrent(), pairs? } — pairs: optional builder (words) → word groups.
 * Returns { judged(e) } for demo.js to call after each judgement.
 */
export function mountAnki(ctx) {
  const $ = (id) => document.getElementById(id);
  const scope = $('anki-scope');
  if (!scope) return { judged() {} };
  const session = []; // { word, pass } per judged recording (synthetic samples excluded)
  const groups = (ctx.pairs ?? minimalPairGroups)(ctx.words);
  const listed = () => [...$('word-select').options].map((o) => ctx.byId.get(o.value)).filter(Boolean);
  const pick = (s) => {
    if (s === 'current') return [ctx.getCurrent()];
    if (s === 'results') return listed();
    if (s === 'pairs') return groups.flat();
    return failedWords(session);
  };
  const extraTags = (s) => (s === 'pairs' ? ['pitch::minimal-pair'] : s === 'failed' ? ['pitch::failed'] : []);
  const canDownload = downloadCapable();
  $('anki-download').hidden = !canDownload;
  const text = $('anki-text');

  function refresh() {
    const counts = { current: 1, results: listed().length, pairs: groups.flat().length, failed: failedWords(session).length };
    for (const o of scope.options) {
      o.textContent = o.value === 'current'
        ? `${SCOPES.current}（${ctx.getCurrent().surface}）`
        : `${SCOPES[o.value]}（${counts[o.value]} 語${o.value === 'pairs' ? `・${groups.length} 組` : ''}）`;
    }
    const nNow = counts[scope.value];
    $('anki-copy').disabled = nNow === 0;
    $('anki-download').disabled = nNow === 0;
    $('anki-status').textContent = nNow === 0 && scope.value === 'failed'
      ? '録音ファイルで不合格になった単語がまだありません（合成音声のサンプルは数えません）。'
      : '';
    $('anki-text-wrap').hidden = true;
  }

  const tsv = () => buildAnkiTsv(pick(scope.value), { tags: extraTags(scope.value) });

  $('anki-download').addEventListener('click', () => {
    const t = tsv();
    saveBlob(new Blob([t], { type: 'text/plain;charset=utf-8' }), ANKI_FILENAME);
    $('anki-status').textContent = `${ANKI_FILENAME} を保存しました。Anki の「ファイル → 読み込む」で選んでください。`;
  });

  $('anki-copy').addEventListener('click', async () => {
    const t = tsv();
    text.value = t;
    $('anki-text-wrap').hidden = false;
    text.focus();
    text.select();
    let ok = false;
    try {
      await navigator.clipboard.writeText(t);
      ok = true;
    } catch {
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    text.select();
    $('anki-status').textContent = ok
      ? 'コピーしました。テキストエディタに貼り付けて .txt で保存し、Anki の「ファイル → 読み込む」で選んでください。'
      : 'コピーできませんでした。下のテキストを全選択してコピーしてください。';
  });

  scope.addEventListener('change', refresh);
  // The search list is re-rendered by demo.js; keep the 検索結果 count in step.
  new MutationObserver(refresh).observe($('word-select'), { childList: true });
  new MutationObserver(refresh).observe($('word-surface'), { childList: true, characterData: true, subtree: true });
  refresh();

  return {
    judged(e) {
      if (!e.result || e.result.error || e.source?.kind === 'sample') return;
      session.push({ word: e.word, pass: !!e.result.pass });
      refresh();
    },
    session,
  };
}
