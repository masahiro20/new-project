// 練習の記録 — 日ごとの判定数・合格数と、アクセント型ごとの合格率（この端末の中だけ）。
//
// 録音ファイルで判定できたとき（判定画面と「最小対で練習」の言い分け）だけ記録します。
// 合成音声のサンプルと聞き分けドリルは記録しません。保存は日ごとの集計だけで、音声も
// 単語名も残しません（pitch-history-v1）。無料版は直近の数日、サポーターは全期間を表示します
// （記録そのものは同じように残すので、解除すれば古い日も見られます）。
import { TYPE_NAMES } from '../src/accent.js';
import { STORAGE_KEYS, localDay, countsAsJudgement } from './supporter.js';

export const TYPES = Object.keys(TYPE_NAMES); // heiban, atamadaka, nakadaka, odaka
export const emptyHistory = () => ({ v: 1, days: {} });

export function sanitizeHistory(raw) {
  if (!raw || raw.v !== 1 || typeof raw.days !== 'object' || !raw.days) return emptyHistory();
  const days = {};
  for (const [d, e] of Object.entries(raw.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !e) continue;
    const t = {};
    for (const k of TYPES) if (Array.isArray(e.t?.[k])) t[k] = [Number(e.t[k][0]) || 0, Number(e.t[k][1]) || 0];
    days[d] = { n: Number(e.n) || 0, pass: Number(e.pass) || 0, t };
  }
  return { v: 1, days };
}

/** 判定1回を足す。type: 辞書の型（heiban など）。 */
export function recordJudgement(state, { day, type, pass }) {
  const prev = state.days[day] ?? { n: 0, pass: 0, t: {} };
  const t = { ...prev.t };
  if (TYPES.includes(type)) {
    const [n, p] = t[type] ?? [0, 0];
    t[type] = [n + 1, p + (pass ? 1 : 0)];
  }
  return { ...state, days: { ...state.days, [day]: { n: prev.n + 1, pass: prev.pass + (pass ? 1 : 0), t } } };
}

/** 'YYYY-MM-DD' に日数を足す（ローカルの暦で）。 */
export function addDays(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

/**
 * 表示用の集計。window: 直近の日数（今日を含む）、Infinity = 全期間。
 * → { days: [{ day, n, pass }]（新しい順）, total: { n, pass }, byType: { type: { n, pass } }, hiddenDays }
 */
export function summarize(state, { today, window = Infinity }) {
  const from = Number.isFinite(window) ? addDays(today, -(window - 1)) : '';
  const days = [];
  const total = { n: 0, pass: 0 };
  const byType = Object.fromEntries(TYPES.map((k) => [k, { n: 0, pass: 0 }]));
  let hiddenDays = 0;
  for (const [day, e] of Object.entries(state.days).sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    if (day < from || day > today) { if (day < from) hiddenDays++; continue; }
    days.push({ day, n: e.n, pass: e.pass });
    total.n += e.n;
    total.pass += e.pass;
    for (const k of TYPES) if (e.t[k]) { byType[k].n += e.t[k][0]; byType[k].pass += e.t[k][1]; }
  }
  return { days, total, byType, hiddenDays };
}

const pct = (p, n) => (n ? `${Math.round((100 * p) / n)}%` : '—');

/**
 * #progress 節をつなぐ。ctx: { storage, window() → 表示する日数, now?() }
 * 返り値 { judged(e), refresh() }
 */
export function mountProgress(ctx) {
  const $ = (id) => document.getElementById(id);
  if (!$('progress')) return { judged() {}, refresh() {} };
  const now = ctx.now ?? (() => new Date());
  let memory = null;
  const load = () => sanitizeHistory(storage().getJSON(STORAGE_KEYS.history) ?? memory);
  const storage = () => ctx.storage;
  let confirmTimer = 0;

  const cell = (tag, text, attrs = {}) => Object.assign(document.createElement(tag), { textContent: text, ...attrs });
  function table(id, headers, rows) {
    const t = $(id);
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of headers) hr.append(cell('th', h, { scope: 'col' }));
    thead.append(hr);
    const tb = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      r.forEach((v, i) => tr.append(cell(i === 0 ? 'th' : 'td', v, i === 0 ? { scope: 'row' } : {})));
      tb.append(tr);
    }
    t.replaceChildren(thead, tb);
    t.hidden = rows.length === 0;
  }

  function render() {
    const win = ctx.window();
    const today = localDay(now());
    const s = summarize(load(), { today, window: win });
    $('progress-range').textContent = Number.isFinite(win)
      ? `直近${win}日（今日を含む）：判定 ${s.total.n} 回・合格 ${s.total.pass} 回（${pct(s.total.pass, s.total.n)}）`
      : `全期間：判定 ${s.total.n} 回・合格 ${s.total.pass} 回（${pct(s.total.pass, s.total.n)}）`;
    $('progress-empty').hidden = s.days.length > 0;
    table('progress-days', ['日付', '判定', '合格', '合格率'], s.days.map((d) => [d.day, `${d.n}`, `${d.pass}`, pct(d.pass, d.n)]));
    table('progress-types', ['辞書の型', '判定', '合格', '合格率'],
      TYPES.filter((k) => s.byType[k].n > 0).map((k) => [TYPE_NAMES[k].ja, `${s.byType[k].n}`, `${s.byType[k].pass}`, pct(s.byType[k].pass, s.byType[k].n)]));
    const more = $('progress-more');
    more.hidden = !Number.isFinite(win);
    more.textContent = Number.isFinite(win)
      ? `無料版では直近${win}日分を表示します${s.hiddenDays ? `（それより前の ${s.hiddenDays} 日分もこの端末に残っています）` : ''}。創設サポーターは全期間の記録を見られます。`
      : '';
    $('progress-clear').disabled = Object.keys(load().days).length === 0;
    window.__progress = { window: Number.isFinite(win) ? win : 'all', ...s };
  }

  $('progress-clear').addEventListener('click', () => {
    const b = $('progress-clear');
    if (b.dataset.confirm !== 'true') {
      b.dataset.confirm = 'true';
      b.textContent = '本当に記録をすべて消す';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { b.dataset.confirm = ''; b.textContent = '記録を消す'; }, 5000);
      return;
    }
    clearTimeout(confirmTimer);
    b.dataset.confirm = '';
    b.textContent = '記録を消す';
    memory = null;
    storage().remove(STORAGE_KEYS.history);
    render();
  });
  render();

  return {
    judged(e) {
      if (!countsAsJudgement(e)) return;
      const next = recordJudgement(load(), { day: localDay(now()), type: e.word.type, pass: !!e.result.pass });
      memory = next;
      storage().setJSON(STORAGE_KEYS.history, next);
      render();
    },
    refresh: render,
  };
}
