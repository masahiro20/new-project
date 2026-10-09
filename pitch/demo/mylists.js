// 自分の単語リスト（創設サポーター向け）— 辞書の語を名前つきのリストにまとめる。
//
// 純粋な部分（作成・名前変更・削除・語の追加と削除）は test/supporter.test.js でテストします。
// mountLists() は #mylists 節をつなぎます。保存先はこの端末の localStorage だけ（pitch-lists-v1）。
// 無料版ではリストを操作できませんが、保存済みのリストは消しません（キーを入れ直せば戻る）。
import { TYPE_NAMES } from '../src/accent.js';
import { STORAGE_KEYS } from './supporter.js';

export const MAX_NAME = 40;
export const emptyLists = () => ({ v: 1, lists: [], active: null });

/** 保存データを検証して、使える形にする（壊れていたら空）。 */
export function sanitizeLists(raw) {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.lists)) return emptyLists();
  const lists = raw.lists
    .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.words))
    .map((l) => ({ id: l.id, name: l.name.slice(0, MAX_NAME), words: [...new Set(l.words.filter((w) => typeof w === 'string'))] }));
  const active = lists.some((l) => l.id === raw.active) ? raw.active : (lists[0]?.id ?? null);
  return { v: 1, lists, active };
}

const cleanName = (name, fallback) => (String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fallback);
const nextId = (state) => `l${1 + Math.max(0, ...state.lists.map((l) => Number(l.id.slice(1)) || 0))}`;

/** 新しいリスト（作ったリストを選ぶ）。→ { state, id } */
export function createList(state, name) {
  const id = nextId(state);
  const list = { id, name: cleanName(name, `単語リスト ${state.lists.length + 1}`), words: [] };
  return { state: { ...state, lists: [...state.lists, list], active: id }, id };
}
export function renameList(state, id, name) {
  return { ...state, lists: state.lists.map((l) => (l.id === id ? { ...l, name: cleanName(name, l.name) } : l)) };
}
export function deleteList(state, id) {
  const lists = state.lists.filter((l) => l.id !== id);
  return { ...state, lists, active: state.active === id ? (lists[0]?.id ?? null) : state.active };
}
export const setActive = (state, id) => (state.lists.some((l) => l.id === id) ? { ...state, active: id } : state);
/** 語を追加（重複は1つに、順番は追加順）。→ { state, added } */
export function addWords(state, id, wordIds) {
  let added = 0;
  const lists = state.lists.map((l) => {
    if (l.id !== id) return l;
    const have = new Set(l.words);
    const words = [...l.words];
    for (const w of wordIds) if (!have.has(w)) { have.add(w); words.push(w); added++; }
    return { ...l, words };
  });
  return { state: { ...state, lists }, added };
}
export function removeWord(state, id, wordId) {
  return { ...state, lists: state.lists.map((l) => (l.id === id ? { ...l, words: l.words.filter((w) => w !== wordId) } : l)) };
}
export const activeList = (state) => state.lists.find((l) => l.id === state.active) ?? null;
/** リストの語（辞書にない id は飛ばす）。 */
export const listWords = (list, byId) => (list ? list.words.map((id) => byId.get(id)).filter(Boolean) : []);

/**
 * #mylists 節をつなぐ。
 * ctx: { byId, getCurrent(), selectWord(w), listed() → 検索結果の語, isOpen() → 使えるか, storage }
 * 返り値 { refresh(), activeWords(), activeName() }
 */
export function mountLists(ctx) {
  const $ = (id) => document.getElementById(id);
  if (!$('mylists')) return { refresh() {}, activeWords: () => [], activeName: () => '' };
  const { storage } = ctx;
  let memory = null;
  const load = () => sanitizeLists(storage.getJSON(STORAGE_KEYS.lists) ?? memory);
  let state = load();
  const listeners = new Set();
  const save = (s) => {
    state = s;
    memory = s;
    if (!storage.setJSON(STORAGE_KEYS.lists, s)) status('この端末に保存できないため、ページを閉じるとリストは消えます。');
    render();
    for (const fn of listeners) fn();
  };
  const status = (t) => { $('list-status').textContent = t; };
  let confirmTimer = 0;

  function render() {
    const open = ctx.isOpen();
    $('lists-locked').hidden = open;
    $('lists-body').hidden = !open;
    if (!open) return;
    const sel = $('list-select');
    const frag = document.createDocumentFragment();
    for (const l of state.lists) frag.append(Object.assign(document.createElement('option'), { value: l.id, textContent: `${l.name}（${l.words.length} 語）` }));
    sel.replaceChildren(frag);
    const list = activeList(state);
    sel.disabled = !list;
    if (list) sel.value = list.id;
    for (const id of ['list-rename', 'list-delete', 'list-add-current', 'list-add-results', 'list-next']) $(id).disabled = !list;
    const cur = ctx.getCurrent();
    $('list-add-current').textContent = cur ? `この単語（${cur.surface}）を追加` : 'この単語を追加';
    const n = ctx.listed().length;
    $('list-add-results').textContent = `検索結果（${n} 語）をまとめて追加`;
    if (n === 0) $('list-add-results').disabled = true;
    const words = listWords(list, ctx.byId);
    $('list-next').disabled = words.length === 0;
    $('list-count').textContent = !list
      ? 'まだリストがありません。名前を入れて「リストを作る」を押してください。'
      : words.length ? `「${list.name}」${words.length} 語 — 語を押すと、その語を判定画面で選びます。` : `「${list.name}」は空です。上のボタンで語を追加してください。`;
    const ul = $('list-words');
    const items = document.createDocumentFragment();
    for (const w of words) {
      const li = document.createElement('li');
      li.className = 'list-item';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'list-pick';
      pick.textContent = `${w.surface}（${w.kana}）${TYPE_NAMES[w.type]?.ja ?? ''}`;
      pick.setAttribute('aria-current', String(cur?.id === w.id));
      pick.addEventListener('click', () => { ctx.selectWord(w); render(); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'list-del';
      del.textContent = '×';
      del.setAttribute('aria-label', `${w.surface}をリストから外す`);
      del.addEventListener('click', () => { save(removeWord(state, list.id, w.id)); status(`${w.surface}をリストから外しました。`); });
      li.append(pick, del);
      items.append(li);
    }
    ul.replaceChildren(items);
  }

  $('list-select').addEventListener('change', () => save(setActive(state, $('list-select').value)));
  $('list-create').addEventListener('click', () => {
    const r = createList(state, $('list-name').value);
    $('list-name').value = '';
    save(r.state);
    status(`「${activeList(state).name}」を作りました。`);
  });
  $('list-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('list-create').click(); } });
  $('list-rename').addEventListener('click', () => {
    const list = activeList(state);
    if (!list) return;
    if (!$('list-name').value.trim()) { status('新しい名前を上の欄に入れてから「名前を変える」を押してください。'); $('list-name').focus(); return; }
    save(renameList(state, list.id, $('list-name').value));
    $('list-name').value = '';
    status(`名前を「${activeList(state).name}」に変えました。`);
  });
  $('list-delete').addEventListener('click', () => {
    const list = activeList(state);
    if (!list) return;
    const b = $('list-delete');
    if (b.dataset.confirm !== 'true') {
      b.dataset.confirm = 'true';
      b.textContent = `「${list.name}」を本当に削除する`;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'リストを削除'; }, 5000);
      return;
    }
    clearTimeout(confirmTimer);
    b.dataset.confirm = '';
    b.textContent = 'リストを削除';
    save(deleteList(state, list.id));
    status(`「${list.name}」を削除しました。`);
  });
  $('list-add-current').addEventListener('click', () => {
    const list = activeList(state);
    const w = ctx.getCurrent();
    if (!list || !w) return;
    const r = addWords(state, list.id, [w.id]);
    save(r.state);
    status(r.added ? `${w.surface}を「${list.name}」に追加しました。` : `${w.surface}はもう「${list.name}」に入っています。`);
  });
  $('list-add-results').addEventListener('click', () => {
    const list = activeList(state);
    if (!list) return;
    const r = addWords(state, list.id, ctx.listed().map((w) => w.id));
    save(r.state);
    status(`${r.added} 語を「${list.name}」に追加しました。`);
  });
  $('list-next').addEventListener('click', () => {
    const words = listWords(activeList(state), ctx.byId);
    if (!words.length) return;
    const i = words.findIndex((w) => w.id === ctx.getCurrent()?.id);
    ctx.selectWord(words[(i + 1) % words.length]);
    render();
    document.getElementById('h-how')?.scrollIntoView({ block: 'start' });
  });
  // 判定画面で単語や検索結果が変わったら、ボタンの表示を合わせる（anki.js と同じ方法）。
  new MutationObserver(() => render()).observe($('word-surface'), { childList: true, characterData: true, subtree: true });
  new MutationObserver(() => render()).observe($('word-select'), { childList: true });
  render();

  return {
    refresh: render,
    activeWords: () => listWords(activeList(state), ctx.byId),
    activeName: () => activeList(state)?.name ?? '',
    onChange: (fn) => listeners.add(fn),
  };
}
