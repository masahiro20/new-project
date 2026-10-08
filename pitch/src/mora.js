// Kana → mora splitting. Small ゃゅょ etc. attach to the previous kana;
// ん, っ and ー each count as their own mora (standard Tokyo phonology).

const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ']);

/** Convert katakana to hiragana (leaves ー and other characters alone). */
export function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Split a kana string into morae, e.g. "きょうと" → ["きょ","う","と"]. */
export function splitMorae(kana) {
  const out = [];
  for (const ch of toHiragana(kana)) {
    if (SMALL.has(ch) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** Consonant class of a mora from its first kana. */
export function consonantClass(mora) {
  const c = mora[0];
  if ('あいうえおー'.includes(c)) return 'vowel';
  if (c === 'っ') return 'geminate';
  if (c === 'ん') return 'moraic-nasal';
  if ('かきくけこぱぴぷぺぽたてと'.includes(c)) return 'stop';
  if ('ちつ'.includes(c)) return 'affricate';
  if ('さしすせそはひふへほ'.includes(c)) return 'fricative';
  if ('がぎぐげごだでどばびぶべぼ'.includes(c)) return 'voiced-stop';
  if ('ざじずぜぞぢづ'.includes(c)) return 'voiced-fricative';
  if ('なにぬねのまみむめも'.includes(c)) return 'nasal';
  if ('らりるれろ'.includes(c)) return 'flap';
  if ('やゆよわを'.includes(c)) return 'glide';
  return 'vowel';
}
