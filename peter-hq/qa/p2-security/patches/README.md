# Budget Guard 統合パッチ（P2 セキュリティレビュー）

対象：`peter/p2-signal-lab` の `88cc595`（`signal-lab/budget-guard/`）。
パスは作業ツリーのルートからの相対パス（`signal-lab/budget-guard/...`）。形式は `git format-patch`。各ファイルの先頭に日本語の説明があります。

| # | ファイル | 指摘 | 内容 | 元パッチ |
|---|---|---|---|---|
| 0001 | `0001-r3-01-test-dryrun-does-not-block-live-stop.patch` | R3-01（high） | test の dry run は `stopTestedAt` に記録する。arm-live のときに旧データの `stoppedAt` を消す | r3-01.patch ＋移行処理 |
| 0002 | `0002-r1-06-gcm-tag-iv-length.patch` | R1-06 | GCM のタグを16バイト、IV を12バイトに固定する | r1-01.patch |
| 0003 | `0003-r1-04-dev-key-fail-closed.patch` | R1-04 | 開発用の鍵は NODE_ENV が development か test のときだけ使う | r1-02.patch（手で統合） |
| 0004 | `0004-r1-02-key-rotation.patch` | R1-02 | `TOKEN_ENCRYPTION_KEY_PREVIOUS` を使い、古い鍵で復号できるようにする | r1-03.patch（手で統合） |
| 0005 | `0005-r1-01-log-undecryptable-token.patch` | R1-01 | 復号に失敗したら `console.error` に出す | r1-04.patch |
| 0006 | `0006-r1-05-redact-provider-errors.patch` | R1-05 | プロバイダーのエラー本文を伏せ字にする | r1-05.patch |
| 0007 | `0007-r2-01-license-reveal-24h.patch` | R2-01 | checkout complete でライセンスキーを返すのは24時間以内に限る。/success に案内を出す | r2-01.patch ＋画面の調整 |
| 0008 | `0008-r2-02-server-side-signout.patch` | R2-02 | ログアウトしたらサーバー側でもセッションを失効させる（`sessionsValidAfter`）。demo portal も同じ扱い | r2-02.patch ＋ demo portal |
| 0009 | `0009-r2-03-demo-email-index.patch` | R2-03 | デモ購入では、active なメール索引を上書きしない | r2-03.patch |
| 0010 | `0010-r3-05-provider-fetch-timeout-no-redirect.patch` | R3-05 | fetch にタイムアウト（20秒、Slack は10秒）を付け、リダイレクトは追わない（manual で受けて 3xx を拒否） | r3-05.patch（変更あり） |
| 0011 | `0011-r3-07-nan-spend-is-error.patch` | R3-07 | 支出額が NaN や Infinity なら取得エラーにする | r3-07.patch |
| 0012 | `0012-r2-09-admin-stats-byte-compare.patch` | R2-09（info） | admin/stats の比較をバイト長で行う | r2-04.patch |

**指摘 ID とレビュアーのパッチ名は一致しません。** 例：R1 の `r1-01.patch` は指摘 R1-06 を直すパッチで、`r1-04.patch` は指摘 R1-01 を直すパッチです。

## 当て方

```sh
cd <peter/p2-signal-lab の作業ツリー>     # signal-lab/ を含むルート
for p in /path/to/peter-hq/qa/p2-security/patches/00*.patch; do git apply --check "$p" && git apply "$p" || break; done
# コミットも作るなら: git am /path/to/peter-hq/qa/p2-security/patches/00*.patch
cd signal-lab/budget-guard && npm ci && npm run typecheck && npm test
```

順番は 0001 から 0012 までです。後半のパッチは `tests/security-regressions.test.ts` に追記していく形なので、この順番で当ててください。

## 確認結果（2026-10-09）

- `$SP/p2` の HEAD（88cc595）のコピーに 0001〜0012 を順に `git apply --check` してから当てた。すべて OK。
- 当てたあと、`next typegen && tsc --noEmit` はエラー 0 件。`vitest run` は 17 ファイル・170 件がすべて通過した（元は 16 ファイル・149 件で、21 件増えた）。
- パッチを1つ当てるごとにも、型チェックと全テストが通ることを確認した。

## 既存テストの変更

- `tests/access.test.ts`「round-trips claims」（0008）：`verifyAccessToken` の戻り値に `iat` が加わった。このテストは戻り値を `toEqual` で比べているため、`iat: expect.any(Number)` を期待値に足した。これ以外の既存テストは変えていない。
