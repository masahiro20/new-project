# P0 減算ゼロ QA（2026-10-09、Ren）

このセッションは `peter/p4-collector-lens` にしかプッシュできないため、P0 ブランチには直接入れていません。

- `qa-report.md`：QA 報告（P0 側の `docs/qa-report.md` に置く想定）
- `fixes.patch`：小さな修正（表示・アクセシビリティ・リンク、7ファイル）と `docs/qa-report.md` を含む差分。`peter/p0-genzan-zero` の `ca22df4` に対して作成

P0 側での取り込み方（Mina さんか P0 担当）：

```bash
git checkout peter/p0-genzan-zero
git apply peter-hq/qa/p0-genzan-zero/fixes.patch   # p4 ブランチから取り出したファイルを指定
```
