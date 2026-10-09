# Kotomark プラグイン（薄いクライアント）

Claude Code に、`script-consistency` スキル、`/lqa-check` コマンド、リモート MCP サーバー `kotomark` を追加します。

```bash
export KOTOMARK_MCP_URL=https://<your-endpoint>/mcp   # default: http://localhost:8787/mcp
export KOTOMARK_TOKEN=<your token>
claude --plugin-dir ./plugin        # local testing
```

- `KOTOMARK_MCP_URL`：サーバーの URL（既定は `http://localhost:8787/mcp`）。
- `KOTOMARK_TOKEN`：あなたのトークン。
- `claude --plugin-dir ./plugin`：ローカルでの試験用です。

推論はすべて、あなた自身の Claude Code のセッションで行います。サーバーは決まったルールでの検査だけを行い、レビュー用パケットを返します。あなたのファイルは保存しません。
