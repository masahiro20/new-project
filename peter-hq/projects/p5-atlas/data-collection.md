<!-- From Atlas (P5 leader), received via cross-session message and saved by HQ (original commit 15f8adc). Lightly condensed. -->
# Atlas data collection plan v0

Status: draft, 2026-10-08. Numbers were measured on that day unless marked *(unverified)*.

Goal: a deduplicated index of MCP servers and agent skills/plugins, each linked to scannable artefacts (git repo, npm/PyPI/OCI package, SKILL.md bundle).

Principles:
- Prefer official APIs.
- Respect robots.txt and ToS.
- Never execute fetched code.
- Store raw snapshots with a timestamp and source.
- Attribute sources where required.

## 1. Sources
| # | Source | Access | Size (2026-10-08) | Refresh | Priority |
|---|---|---|---|---|---|
| 1 | Official MCP Registry | Open REST, no key | **40,700 servers** (40,207 active, 493 deprecated) | Hourly incremental, weekly full | P0 |
| 2 | GitHub | REST/GraphQL, token | Not measurable here (search blocked) | Daily | P0 |
| 3 | npm | Search + packument | `keywords:mcp-server` 9,561; `modelcontextprotocol` 2,978; `mcp` 78,250 (noisy); `claude-skill` 325 | Daily | P0 |
| 4 | PyPI | Simple JSON + per-project JSON | 908,294 projects; 21,436 contain `mcp`; 3,836 `mcp-server`-style | Daily | P0 |
| 5 | Claude plugin marketplaces | git clone | `claude-plugins-official` 315 plugins; `wshobson/agents` 94 plugins / 184 SKILL.md | Daily | P0 |
| 6 | Skill repos | git clone | `anthropics/skills` 20; `awesome-claude-skills` 864; `superpowers` 15 | Daily | P0 |
| 7 | Awesome lists | git clone | `awesome-mcp-servers` about 4,100 items | Weekly | P1 |
| 8 | Smithery registry | Public JSON (no key) | 18,997 | Weekly, after ToS check | P2 |
| 9 | Glama | Key required; per-record attribution | n/a | Only with key and attribution | P2 |
| 10 | PulseMCP | v0beta returns 410 (sunset) | n/a | Only if terms allow | P3 |
| 11 | mcp.so, skillsmp.com | robots.txt disallows `/api/` | n/a | Sitemap discovery only | P3 |
| 12 | OCI (Docker Hub `mcp/*`, GHCR) | Registry API | 1,079 registry entries | On demand | P2 |

## 2. Official MCP Registry (verified)
- **Endpoints (registry 1.8.1):**
  - `GET /v0/servers` and `/v0.1/servers` take `cursor`, `limit` (maximum 100), `search`, `version`, `updated_since`, `include_deleted`.
  - Per-server history is at `/v0/servers/{name}/versions[/{version}]`. This drives rug-pull diffing (UP-002).
  - Also available: `/status`, `/v0/health`, `/v0/version`, `/openapi.yaml`.
- **Response:** `servers[].server` has `$schema, name, title, description, version, repository, websiteUrl, icons, packages[] (registryType npm|pypi|oci|mcpb|nuget|cargo, identifier, version, transport, environmentVariables), remotes[] (streamable-http|sse, url)`, plus `_meta` with official status and timestamps.
- **Schemas:** four schema versions are in use (2025-12-11, 09-29, 07-09, 10-17).

**Full crawl:**

| Metric | Value |
|---|---|
| Pages and servers | 408 pages; 40,700 unique |
| Namespaces | `io.github.*` 26,239; `com.*` 6,433; `ai.*` 1,784 |
| Distribution | **remote-only 23,704 (58%)**; package-only 14,506; both 2,005; neither 485 |
| Packages | npm 10,901; pypi 4,284; mcpb 1,494; oci 1,079; nuget 138; cargo 71 |
| Repository URL | 29,432 entries / 23,786 unique |
| Remote hosts | workers.dev 3,095; pipeworx.io 1,737; mcp.ai 1,115; vercel.app 331; apify.com 302; **trycloudflare.com 258** (ephemeral) |
| Bulk publishers | Top 4 namespaces hold about 6,000 entries |
| Growth (latest version by month) | Jul 4,072 → Aug 6,628 → **Sep 14,172** → Oct 1–8 5,745 |
| Churn | 2,048 updates in about 33 h |
| Cost | About 25 min sequential; 38.5 MB JSON |

No rate-limit headers were returned. Crawl sequentially with a 0.2 s delay, use exponential backoff on 5xx errors, and sync incrementally with `updated_since`.

**Implications:**
1. 58% of servers are remote-only, so they can only be scored on metadata. Getting their tool lists needs an isolated worker that calls `initialize` and `tools/list` without credentials (v1).
2. The registry verifies namespaces only. It does not verify repository URLs or scan packages. That gap is Atlas's value.
3. Collapse spam and template-farm namespaces in the UI.
4. The registry is built to be consumed downstream. Attribute it and link back, and re-check its terms before launch.

## 3. GitHub
- **Primary path:** the repos linked from registry, npm and PyPI entries (23,786 URLs from the registry alone).
- **Discovery (token required):**
  - Topic searches: `mcp-server`, `mcp`, `model-context-protocol`, `claude-skills`, `agent-skills`, `claude-code-plugin`.
  - Code searches: `filename:SKILL.md`, `server.json`, `.claude-plugin/marketplace.json`, `plugin.json`, `.mcp.json`.
- **Per repo:** HEAD SHA, stars, pushed_at, licence, topics, archived flag, releases. Then `git clone --depth 1 --filter=blob:limit=1m` into a sandbox. Never install or build.
- **Rate limits:** search 30/min, code search 10/min, 1,000 results per query (slice queries by date and size), core 5,000/h (15,000 for App installs). Throttle clones to 2–4 at a time.
- **ToS:** API only. No HTML scraping. Store only findings plus short snippets with links.

## 4. npm
- **Discovery:**
  - Search `GET /-/v1/search?text=keywords:mcp-server&size=250&from=N`.
  - Dependents of `@modelcontextprotocol/sdk` via deps.dev or the changes feed.
  - The 10,901 npm entries in the registry.
- **Per package:** the packument (versions, maintainers, `scripts`, `repository`, `dist.attestations`) and the tarball. Never run `npm install`.
- **Politeness:** under about 5 req/s, cached with ETag.

## 5. PyPI
- **Name list:** the PEP 691 simple index. There is no search API.
- **Per project:** `/pypi/<name>/json` and the PEP 740 provenance.
- **Better coverage:** BigQuery or deps.dev for dependents of `mcp`/`fastmcp`, plus the 4,284 PyPI entries in the registry.
- **Downloads only:** fetch sdists and wheels, and never run `pip install` (sdists run `setup.py`).

## 6. Plugin marketplaces and skills
- **Format:** `.claude-plugin/marketplace.json` lists `plugins[]` with a `source` (path, repo, or git URL with `ref`/`sha`). Each plugin has a `plugin.json` and components (`skills/*/SKILL.md`, `agents/`, `commands/`, `hooks/hooks.json`, `.mcp.json`). Docs: https://code.claude.com/docs/en/plugin-marketplaces
- **Seeds:**
  - `claude-plugins-official` (follow its external sources)
  - `anthropics/skills`
  - community marketplaces found via code search
  - awesome lists
  - npm `claude-skill`
- **Index key and dedupe:** index each skill by (repo, path, SHA). Dedupe by content hash, because copies are very common.

## 7. Other directories
- **Awesome lists:** discovery seeds only.
- **Smithery:** read its terms before any bulk use. About 213 entries overlap with the registry.
- **Glama:** needs a key and per-record attribution.
- **PulseMCP:** sunset, so skip it.
- **mcp.so and skillsmp:** sitemap discovery only. Never copy their descriptions or rankings.

## 8. Pipeline
```
registry (hourly) / npm, PyPI, GitHub, marketplaces (daily) / awesome (weekly)
  → normalise → entity resolution (repo URL, package id, content hash) → queue
  → fetch artefact (tarball / shallow clone, no exec, 50 MB cap)
  → static scan + OSV querybatch → findings DB → trust score → publish (diff vs previous → UP-002)
```
- **Entity key:** repo URL plus subpath. Package `mcpName` gives a verified link to the registry name.
- **Re-scan triggers:** a new version, a new HEAD, or a rule-set bump. A weekly full re-score is cheap.
- **Storage:** don't keep full third-party source beyond the scan job.

## 9. Estimated v0 corpus
| Bucket | Estimate |
|---|---|
| MCP servers with scannable source | about 15,000–17,000 |
| Remote-only (metadata score only) | about 24,000 |
| Skills (unique) | about 5,000–20,000 *(unverified)* |
| Plugins | about 1,000–3,000 *(unverified)* |

Biggest open item: real GitHub counts, which need a token with search access.

## 10. Legal / ToS checklist
- [ ] Registry terms reviewed; each entry attributed "Data: MCP Registry" with a link
- [ ] GitHub: API only, within limits, identifying User-Agent
- [ ] npm and PyPI: polite rate, caching, tarballs only
- [ ] Glama: key plus attribution, or skip it
- [ ] Smithery, PulseMCP, mcp.so, skillsmp: no bulk use without written permission
- [ ] Findings show short excerpts with links; authors get a takedown and right-to-respond process; wording says "pattern detected", never "malware" (except for OSV `MAL-*` hits)
