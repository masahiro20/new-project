---
description: Run a whole-script JA↔EN consistency check (terms, names, honorifics, voice) on string tables
argument-hint: <table files...> [--glossary path]
---
<!-- オーナー向けメモ：これは /lqa-check コマンドの定義（ユーザーの Claude への指示文）です。顧客向けのため英語のままにしています。 -->

Use the `script-consistency` skill to check these files: $ARGUMENTS

If no files were given, look for string tables (*.csv, *.tsv, *.json, *.xlf, *.xliff) and a glossary in the current directory and confirm the list with me before running.
