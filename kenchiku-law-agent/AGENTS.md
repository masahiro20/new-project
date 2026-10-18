# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# Project notes (建築法令エージェント)

- 法令条文の根拠は e-Gov 法令API v2 (`lib/egov.ts`) から取得する。条番号や数値を手で書き写すときは `npm run verify-sources` で照合する。
- 知識ベースは `lib/knowledge.ts`。ルールを追加するときは必ず `cites`（法令ID＋条）を付け、`expectCaption` に条見出しを入れて検証可能にする。
