// Tokyo-dialect accent patterns for "<word> + が".
//
// A word of n morae with downstep position k (UniDic aType; 0 = no downstep):
//   k = 0      heiban     L H H … H | が H
//   k = 1      atamadaka  H L L … L | が L
//   1 < k < n  nakadaka   L H … H(k) L … L | が L
//   k = n      odaka      L H … H | が L
// The particle が is what separates odaka from heiban.

export const TYPE_NAMES = {
  heiban: { en: 'Flat (heiban)', ja: '平板型' },
  atamadaka: { en: 'Head-high (atamadaka)', ja: '頭高型' },
  nakadaka: { en: 'Mid-high (nakadaka)', ja: '中高型' },
  odaka: { en: 'Tail-high (odaka)', ja: '尾高型' },
};

/** Accent type name for downstep k in a word of n morae. */
export function accentType(k, n) {
  if (k === 0) return 'heiban';
  if (k === 1) return 'atamadaka';
  if (k === n) return 'odaka';
  return 'nakadaka';
}

/**
 * High/low pattern over word morae plus the particle (length n + 1).
 * Returns an array of 1 (high) / 0 (low).
 */
export function pitchPattern(k, n) {
  const pat = [];
  for (let i = 1; i <= n + 1; i++) {
    if (k === 1) pat.push(i === 1 ? 1 : 0);
    else if (i === 1) pat.push(0);
    else if (k === 0) pat.push(1);
    else pat.push(i <= k ? 1 : 0);
  }
  return pat;
}

/** Human-readable description of where the pitch drops. */
export function describeDrop(k, morae) {
  if (k === 0) return { en: 'no drop (が stays high)', ja: '下がり目なし（「が」も高い）' };
  if (k >= morae.length) return { en: `drop after ${morae.join('')} (on が)`, ja: `「${morae.join('')}」の後（「が」で下がる）` };
  return { en: `drop after ${morae[k - 1]}`, ja: `「${morae[k - 1]}」の後で下がる` };
}
