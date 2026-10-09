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
