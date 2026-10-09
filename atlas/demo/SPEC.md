# Allowlist Builder デモ：共通インターフェース（Atlas、2026-10-08）

オフラインで動く1枚の HTML ページ。実行時にネットワーク通信はしない。検出の文言は「パターンを検出」／"pattern detected" とする。
自分たちの文言に "malware"・"malicious"・「マルウェア」は書かない（OSV の advisory の id や summary をそのまま引用する場合だけ例外）。

## ファイル
- `engine.js`：純粋な JS、依存なし。ブラウザ（`window.AtlasEngine`）と Node（`module.exports`）の両方で動く。（Builder A）
- `engine.test.js`：`node --test atlas/demo/engine.test.js` で実行する。（Builder A）
- `samples.json`：静的なデータ。`build_samples.py` が atlas/data/index.json とレポートから生成する。（Builder B）
- `page.html`：UI のテンプレート。`/*__ENGINE__*/` と `/*__SAMPLES__*/` のプレースホルダーを持つ。（リーダー）
- `build.py`：engine.js と samples.json を埋め込み、`dist/allowlist-builder-demo.html` を作る。（リーダー）

## サンプルのレコード（samples.json = {"generated", "source", "note", "samples": [Sample]}）
```
Sample = {
  "id": "slug", "name": "display name", "repo": "https://github.com/..." | null,
  "packages": [{"eco": "npm"|"pypi"|"oci", "name": "pkg"}],
  "category": "control" | "reference" | "typical" | "capability" | "osv",   // デモに入れた理由
  "grade": "A".."F", "trust": 0-100 | null,
  "recommendation": "approve"|"review"|"deny",
  "reasons": ["日本語の根拠 1文", ...],
  "counts": {"critical":n,"high":n,"medium":n,"low":n},
  "findings": [{"rule":"ATL-TP-001","sev":"critical","title":"...","file":"path","line":13,"ctx":"src","snippet":"redacted, <=160 chars","why":"optional"}],  // 最大12件程度、重大度順
  "osv": [{"id":"MAL-2025-47604","summary":"...","source":"api.osv.dev (fetched by the CLI, not by this page)"}],
  "config": {"command":"npx","args":["-y","pkg@1.2.3"]} | null    // 「自分の設定に追加」ボタン用の、もっともらしい起動設定
}
```
- `findings[].snippet` は伏せ字処理済みで、160文字以内。`why` は省略できる。
- `osv[].source` は、OSV を照会したのが CLI であり、このページではないことを示す。

## エンジンの API
```
AtlasEngine.parseConfig(text) -> {format: "claude"|"vscode"|"desktop", servers: [{name, cfg, key}], error?: "日本語メッセージ"}
```
- `{"mcpServers":{...}}`（.mcp.json／Claude Desktop）と `{"servers":{...}}`（VS Code の mcp.json）を受け付ける。`//` コメントと末尾のカンマ（VS Code の JSONC）も許容する。

```
AtlasEngine.evaluate(text, {samples}) -> {format, error?, items: [Item]}
Item = {name, kind:"mcp", cfg, sanitized, packages:[{eco,name,version,pinned,raw}], urls:[...],
        findings:[{rule, sev, title, titleJa, ptr, snippet(redacted), note}],
        recommendation: "approve"|"review"|"deny", reasons:["日本語の根拠"], sample: Sample|null}
```

```
AtlasEngine.buildOutputs(items, approvedNames:Set|Array) -> {
   managedMcp: {"mcpServers": {...}},
   claudeSettings: {"allowManagedMcpServersOnly": true, "allowedMcpServers": [matchers]},
   copilotSettings: {"allowedMcpServers": [matchers]} }
```
- `managedMcp`：Claude Code の managed-mcp.json。設定は伏せ字処理済みで、`_claude_server_entry` と同じ形に正規化する。
- matcher は `{serverUrl}` または `{serverCommand:[argv]}`。
- 出力に入るのは承認した項目だけ。deny の項目は、approvedNames に含まれ、**かつ**呼び出し側が `{allowDeny:true, reasons:{name:"..."}}` を渡した場合を除き、決して含めない（UI ではこの選択肢を出さなくてよい）。

```
AtlasEngine.decisionsMarkdown(items, approvedNames, {reasons, generated}) -> string
```
- decisions.md の監査記録を返す。承認の扱いは buildOutputs で決める（deny は承認されない）。本文はすべて伏せ字処理済み。
