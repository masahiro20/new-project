#!/usr/bin/env bash
# 6. Forbidden-term grep over the built game and the shipped docs.
# world-bible.md lists the forbidden words itself (the ban list) — that one line is allowed; everything else must be clean.
cd /home/user/new-project/mech-game
PAT='使徒|A\.T|AT[ ・]?フィールド|エントリープラグ|シンクロ|LCL|暴走|エヴァ|EVA|プラグスーツ'
fail=0
for f in index.html src/game.html src/audio.js docs/*.md; do
  hits=$(grep -nE "$PAT" "$f" | grep -v '^3:既存作品（エヴァンゲリオン等）' )
  if [ "$f" = docs/world-bible.md ]; then hits=$(grep -nE "$PAT" "$f" | grep -v '禁止'); fi
  if [ -n "$hits" ]; then echo "FAIL $f"; echo "$hits" | cut -c1-200; fail=1; else echo "PASS $f"; fi
done
echo "--- case-insensitive 'eva' word check in index.html:"; grep -noiE '\beva\b' index.html | head
exit $fail
