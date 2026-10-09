# Design decisions

Short, dated notes. Newest at the bottom of each section.

## 最小対で練習 (minimal-pair practice) — 2026-10-09

- 2026-10-09: A "minimal pair" = same-kana words whose accent differs. Words with identical accent sets merge into one option (紙・髪 → one answer), so 川・皮・革 or 雲・蜘蛛 are not pairs.
- 2026-10-09: Multi-accent words: an option is usable only if it has a *distinctive* k no other option accepts (鹿[0,2] vs 歯科[1,2] → 0 vs 1). A group needs ≥ 2 usable options; 巣/酢, 脳/能, 錨/怒り, 機械/機会, 鳴き声/泣き声 are dropped. Result on the 2,000-word lexicon: 29 groups (of 61 same-kana groups, 34 with differing accent).
- 2026-10-09: Synth samples, drill questions and the H/L display use each option's distinctive k, so the drill never plays an ambiguous pattern.
- 2026-10-09: Classification is exact-k only (`classifyAgainstPair`): match / ambiguous (target and another option share k) / other / none. No "nearest k" fallback — numeric k distance is not perceptual distance (0 vs n differ only on が).
- 2026-10-09: Recording is judged with `judge()` against the target word; the pair verdict comes from detected k, not from `r.pass`.
- 2026-10-09: File pipeline (decode → pickUtterance → F0 → judge) and `play()` moved to `demo/pipeline.js`, shared by demo.js and practice.js. practice.js gets the pipeline injected via `initPractice(deps)`, so its pure functions load in Node tests without the browser.
- 2026-10-09: One section on the main page (with a jump link in the header) rather than tabs: keeps the existing checker DOM/QA contract untouched. Practice writes `window.__practiceLast` / `window.__practiceDrill`, never `__pitchLast` or `#result`.
- 2026-10-09: Drill score is session-only (no localStorage): nothing to clear, nothing persisted on shared devices. Drill voices vary (seed, base 115–200 Hz) so the learner listens to the contour, not one fixed sample.

## 結果の共有カード画像・Anki への書き出し — 2026-10-09

- 2026-10-09: Code lives in `demo/share.js` and `demo/anki.js`; demo.js only imports `mountShare`/`mountAnki` and calls one `afterJudge({ result, word, track, source })` after each judgement. Stale-card handling watches `#result[data-state]` and the Anki 検索結果 count watches `#word-select` via MutationObserver, so no further demo.js hooks are needed.
- 2026-10-09: Share card = 1200×630 PNG from `drawShareCard(ctx, prepareShareCard(…))`. Data prep is pure (normalised 0–1 coordinates, H/L, short reason) and unit-tested; drawing is tested on a recording stub context. Light theme tokens always; system Japanese font stack. No file name, no audio.
- 2026-10-09: The card is always shown as an `<img src="data:…">` preview with 「画像を長押し（右クリック）で保存できます」 — that is the one path that works in the claude.ai Artifact. 「共有」 appears only when `navigator.canShare({ files })` is true (rejection → message, AbortError ignored); otherwise a download button only in a top-level page.
- 2026-10-09: "Can download" = `window.top === window.self`. The Artifact runs in a sandboxed iframe (downloads silently blocked); the PWA and a locally opened file are top-level. Copy + `<textarea readonly>` (all text selected, `execCommand('copy')` fallback) is offered everywhere for the Anki text.
- 2026-10-09: Anki file = TSV with `#separator:tab`, `#html:true`, `#notetype:Basic`, `#deck:Pitch::Accent`, `#columns`, `#tags column:3`, then a `#` comment with "Accent data: UniDic (NINJAL), BSD licence" (TSV has no deck-description field). Fields are HTML-escaped (incl. `"`), newlines → `<br>`, tabs → space, so a row is always exactly 3 fields.
- 2026-10-09: Back side uses inline styles only (stock Basic note type has no CSS): overline on high morae, right border at the drop, が dimmed, plus an `L H ＋L` text line, 「尾高型［2］ 「はし」の後、「が」で下がる」 and the gloss. Multi-accent words list each accepted accent. Tags: `pitch::<type>` per accepted type, `p3pitch`, plus `pitch::minimal-pair` / `pitch::failed` by scope.
- 2026-10-09: Minimal-pair scope reuses `buildMinimalPairs` from demo/practice.js (same definition as the practice mode), falling back to "same kana, ≥ 2 distinct accents" if its shape ever changes.
- 2026-10-09: 「この回で不合格だった単語」 counts only real recordings judged in the checker; synthetic samples (including the auto sample on load) are excluded. Practice-mode attempts are not counted (they don't pass through the checker). Session-only, nothing stored.

## 2026-10-09 — "wrong" sample avoids drops on っ/ん/ー (Kana)
- `wrongK` no longer picks a downstep on a special mora. A drop on っ is inaudible (no F0), so after the segmentation fix (っ slots carry no pitch) such a sample is indistinguishable from flat and is not a meaningful wrong reading (筆者 [1,0] used k=2). The judge itself is unchanged by this; only which contrast the demo plays as "wrong".
