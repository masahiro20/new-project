# Kotomark plugin (thin client)

Adds the `script-consistency` skill, the `/lqa-check` command and the `kotomark` remote MCP server to Claude Code.

```bash
export KOTOMARK_MCP_URL=https://<your-endpoint>/mcp   # default: http://localhost:8787/mcp
export KOTOMARK_TOKEN=<your token>
claude --plugin-dir ./plugin        # local testing
```

All reasoning runs in your own Claude Code session. The server only runs deterministic checks and returns review packets; it does not store your files.
