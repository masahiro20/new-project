<!-- From Atlas (P5 leader), received via cross-session message and saved by HQ (original commit 15f8adc). Lightly condensed. -->
# Atlas scan rules v0 (first edition)

Status: draft, 2026-10-08. Scope: statically detectable danger patterns in **MCP servers** (source repo, published npm/PyPI/OCI package, `server.json`, tool descriptions extractable without running) and **agent skills / Claude Code plugins** (`SKILL.md`, bundled `scripts/`, `.claude-plugin/plugin.json`, `marketplace.json`, `hooks/hooks.json`, `.mcp.json`).

Hard constraint: Atlas never executes, installs or imports scanned code. Dynamic `tools/list` is a future sandboxed stage (v1).

Prototype `scanner/scan.py` implements the rules marked **[P]** (22 rule IDs).

## 0. Conventions
| Field | Meaning |
|---|---|
| ID | `ATL-<CAT>-NNN`, stable, never reused |
| Severity | `critical` (block/quarantine), `high`, `medium`, `low`, `info` (shown, not scored) |
| Method | `regex`, `AST` (v1), `manifest`, `OSV`, `meta` (registry/git metadata diff) |
| Context | `src`, `skill`, `docs`, `example`, `test` — changes score weight |

Categories: TP tool poisoning, OB obfuscation, CE command execution, RF remote fetch, NW network, CR credentials, FS filesystem, IN install-time, DP dependencies, UP auto-update/rug pull, PM permissions/manifest, SK skill, PL plugin.

## 1. Rules

### 1.1 Tool poisoning / hidden instructions
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **TP-001 [P]** | high | regex | Pseudo-XML tags in descriptions: `<IMPORTANT>`, `<SYSTEM>`, `<INSTRUCTIONS>`, `<HIDDEN>`, `<OVERRIDE>` (Invariant PoC) | Benign output formatting (DesktopCommander). Critical only with TP-002/TP-004 in same string |
| **TP-002 [P]** | high | regex | Concealment: `do not (tell\|mention\|notify) the user` | Prompting docs; down-weight in `docs` |
| **TP-003 [P]** | high | regex | `ignore (previous\|prior\|system) instructions`, `disregard ... guidelines` (Cisco YARA) | Security tools quote it; only `src`/`skill` scored |
| **TP-004 [P]** | high | regex | Verb within 80 chars of credential/agent-config paths (`~/.ssh`, `id_rsa`, `~/.aws/credentials`, `~/.cursor/mcp.json`, `~/.claude.json`, `.npmrc`, `.netrc`, `.git-credentials`, `.kube/config`) | Bare-path variant split to FS-001 after 280 README hits |
| **TP-005 [P]** | medium | regex | Coercive ordering / shadowing: `before using this tool ... read/send`, `always call this tool first` | Escalate if it names another server's tool |
| TP-006 | high | manifest+regex | Description mentions a tool name of a different known server | Needs Atlas tool-name index |
| TP-007 | medium | regex | Hidden parameter smuggling (`pass its content as 'sidenote'`) | Rare |
| TP-008 | medium | regex | Description > 2,000 chars or > 5× server median, or > 3 imperatives to "you" | Measure natural language only |
| TP-009 | high | regex | ANSI escapes / OSC-8 in descriptions or output templates (Trail of Bits) | Only inside descriptions/templates |

### 1.2 Obfuscation
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **OB-001 [P]** | high | regex | Zero-width / bidi controls (Trojan Source) | Tuned from 869 to 3 hits: ignore leading BOM and ZWJ/ZWNJ not between ASCII |
| **OB-002 [P]** | critical | regex | Unicode TAG block U+E0000–E007F (ASCII smuggling) | Exempt subdivision flag emoji |
| **OB-003 [P]** | high | regex/AST | Decode-then-execute (`eval(atob(`, `exec(base64.b64decode(`, `base64 -d \| sh`) | Near-zero FP |
| **OB-004 [P]** | medium | regex | Base64 literal of 400+ chars | Embedded PNG; v1 sniffs magic bytes |
| OB-005 | medium | AST | JS mangling / packers, PyArmor, `marshal.loads` | Only published entrypoints without source |
| OB-006 | high | manifest | Bundled binaries (ELF, PE, `.node`, `.so`, `.pyc` without source) | Whitelist known native addons by hash |

### 1.3 Command execution
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **CE-001 [P]** | medium | regex (v1 taint) | `shell=True`, `os.system`, `child_process.exec`, template-literal exec | Capability disclosure, not malice; high only with tool-arg→sink taint |
| **CE-002 [P]** | medium | regex/AST | `eval(`, `new Function(`, `vm.runInNewContext` | Warning strings; AST in v1 |
| CE-003 | high | regex | Reverse shells / LOLBAS (`/dev/tcp/`, `nc -e`, `powershell -enc`) | Label pentest tools as "offensive tooling" |
| CE-004 | medium | regex | Destructive commands (`rm -rf /`, `mkfs`, force-push main, `DROP DATABASE`) | Only `src`/`skill` |

### 1.4 Remote code fetch
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **RF-001 [P]** | critical (src/skill) / low (docs) | regex | Pipe-to-shell (`curl \| sh`, `iwr \| iex`) | Known installer domains → low; SKILL.md telling the agent to run it → critical |
| RF-002 | high | regex/AST | Runtime download-and-execute, `npx -y pkg@latest` spawned from code | Flag unpinned specifically |
| RF-003 | high | regex | Skill/description says to fetch and follow instructions from a URL | Only with follow/execute/obey |

### 1.5 Network
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **NW-001 [P]** | medium | regex/AST | Binds `0.0.0.0` (CVE-2025-49596 class) | Docker; high only with NW-003 |
| **NW-002 [P]** | high | regex | Exfil endpoints (webhook.site, requestbin, pipedream, ngrok, interact.sh, Discord webhooks, Telegram bot API, transfer.sh, pastebin raw) | Discord/Telegram servers; key on hard-coded tokens |
| NW-003 | high | AST/manifest | HTTP/SSE transport without auth, CORS `*` | Info for read-only public remotes |
| NW-004 | medium | regex | DNS exfil | Rare |
| NW-005 | high | regex | Natural-language exfil instructions (`silently send ... to`) | Require "silently" modifiers |

### 1.6 Credentials
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **CR-001 [P]** | high | regex/AST | Bulk env dump (`JSON.stringify(process.env)`, `dict(os.environ)`) | Child-process env inheritance; v1 needs network/log sink |
| CR-002 | medium | regex | Reads secrets of unrelated services | Needs declared purpose |
| CR-003 | high | regex | Hard-coded secrets (`AKIA…`, `ghp_…`, `sk-ant-`, `xoxb-`, PEM) | Fake test keys; entropy + checksum |
| CR-004 | medium | regex | Browser/keychain/wallet stores | Browser automation uses its own profile |

### 1.7 Filesystem
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **FS-001 [P]** | low | regex | References to credential/agent-config paths | Config discovery by design; info unless with NW sink |
| FS-002 | medium | AST | File tools accept absolute paths without root allowlist | v1 |
| FS-003 | high | regex | Persistence writes (`~/.bashrc`, crontab, LaunchAgents, agent MCP configs) | Flag only at import/postinstall time |

### 1.8 Install-time
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **IN-001 [P]** | high (pre/post/install) / info (prepare) | manifest | npm lifecycle scripts (DesktopCommander `postinstall` telemetry was the one real hit) | `prepare` → info; `node-gyp` → medium |
| **IN-002 [P]** | high | manifest/AST | `setup.py` custom `cmdclass` or network/exec in setup | C extensions |
| IN-003 | medium | manifest | Dockerfile `curl \| sh`, `ADD https://`, `:latest`, root + host mounts | Medium only |

### 1.9 Dependencies
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **DP-001 [P]** | medium | manifest | Unpinned / non-registry deps (`*`, `latest`, git, URL tarballs) | Workspace refs excluded |
| DP-002 | high / critical | OSV | Known vulnerable deps via `api.osv.dev/v1/querybatch`; **`MAL-*` = critical hard fail** | No lockfile → "estimated"; dev deps ×0.3 |
| DP-003 | high | meta | Typosquat (Damerau-Levenshtein ≤ 2 / homoglyph vs top 1,000) | Require > 100× download asymmetry |
| DP-004 | medium | meta | Package contents ≠ tagged source; registry `repository.url` is unverified | Diff source files only |
| DP-005 | low | meta | New package, single maintainer, expired email domain, no provenance | Feeds provenance score |

### 1.10 Auto-update / rug pull
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| UP-001 | medium | manifest | Floating versions in launch config (`npx -y pkg@latest`, `uvx pkg`, `:latest`) — postmark-mcp vector | Systemic signal, not malice |
| UP-002 | high | meta | Description drift: new TP-* hits or new network sink between versions | Only new high/critical |
| UP-003 | medium | regex | Self-update code or remote config that changes tools | Notify-only checkers OK |

### 1.11 Manifest / permissions
| ID | Sev | Method | Pattern |
|---|---|---|---|
| PM-001 | medium | manifest | Excessive declared scopes/secrets for read-only tools |
| PM-002 | low | manifest | Missing or inconsistent tool annotations (`destructiveHint`, `readOnlyHint`) |
| PM-003 | info | manifest | Capability badges: untrusted input, private data, external comms (lethal trifecta → "toxic flow" warning) |

### 1.12 Skills
| ID | Sev | Method | Pattern | FP notes |
|---|---|---|---|---|
| **SK-001 [P]** | high | regex | Instructions to disable safety (`--dangerously-skip-permissions`, `bypassPermissions`, `--yolo`, `auto-approve all`) | Docs warning against them |
| **SK-002 [P]** | info | manifest | Executable scripts bundled with a skill → run all code rules at `skill` weight, "contains code" badge | Informational |
| SK-003 | high | regex | Frontmatter `description` containing override/conceal phrases; unrestricted `allowed-tools: Bash` | Trigger guidance is normal |
| SK-004 | medium | regex | Skill reads/prints secrets or sends files to URLs | High only if secret leaves machine |
| SK-005 | low | manifest | Missing/malformed SKILL.md | Quality |

### 1.13 Plugins
| ID | Sev | Method | Pattern |
|---|---|---|---|
| **PL-001 [P]** | low | manifest | Hooks running shell commands → re-run code rules on targets |
| PL-002 | high | manifest | `marketplace.json` third-party source on mutable ref (no `sha`), or bundled `.mcp.json` with `@latest` |

**Count:** 55 rules (22 implemented). Public v0 ships the ~35 `regex`/`manifest`/`OSV` rules; `AST`/`meta` are v1.

## 2. Reference tools
- **Snyk Agent Scan (ex-Invariant mcp-scan):** issue codes E001/E002, W015–W020, skill risk names. It runs stdio servers — Atlas must not, outside a sandbox. https://github.com/snyk/agent-scan
- **Invariant research:** https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks · https://github.com/invariantlabs-ai/mcp-injection-experiments
- **Cisco mcp-scanner:** YARA rules, Apache-2.0. https://github.com/cisco-ai-defense/mcp-scanner
- **DataDog GuardDog:** about 55 YARA/semgrep rules plus metadata heuristics, Apache-2.0. https://github.com/DataDog/guarddog
- **OSV / OSV-Scanner / OpenSSF malicious-packages:** https://google.github.io/osv.dev/api/
- **Semgrep rules:** check the licence before bundling. https://github.com/semgrep/semgrep-rules
- **Socket.dev:** taxonomy reference only.
- **Trail of Bits:**
  - https://blog.trailofbits.com/2025/04/21/jumping-the-line-how-mcp-servers-can-attack-you-before-you-ever-use-them/
  - https://blog.trailofbits.com/2025/04/29/deceiving-users-with-ansi-terminal-codes-in-mcp/
- **Unicode smuggling:**
  - https://embracethered.com/blog/posts/2024/hiding-and-finding-text-with-unicode-tags/
  - https://trojansource.codes/
- **OpenSSF Scorecard:** https://github.com/ossf/scorecard
- **MCP security best practices:** https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
- **Incidents:**
  - https://www.koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft
  - CVE-2025-49596
  - CVE-2025-6514
- **Lethal trifecta:** https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/

## 3. Trust score v0 (0–100)
```
Trust = round(0.60*Security + 0.25*Provenance + 0.15*Maintenance), then caps

Security = max(0, 100 - Σ RulePenalty(r))
RulePenalty(r) = W[sev] * C[ctx_max] * (1 + 0.25*min(n_r - 1, 4))
W: critical 40, high 20, medium 8, low 3, info 0
C: src 1.0, skill 1.0, docs 0.4, example 0.3, test 0.15
```
**Provenance (additive):**

| Signal | Points |
|---|---|
| Verified registry namespace | 25 |
| Repo URL matches the package (DP-004 clean) | 20 |
| npm provenance / Trusted Publishing / Sigstore | 20 |
| Pinned launch config | 10 |
| OSI licence | 10 |
| Repo age > 90 days and > 1 maintainer | 15 |

**Maintenance:**
- 5 × Scorecard score (maximum 50)
- +30 for a commit in the last 90 days
- +20 if there are no open OSV advisories in direct dependencies
- If Scorecard data is unavailable, the score is a neutral 25.

**Caps:**

| Condition | Effect |
|---|---|
| OSV `MAL-*` | Trust = 0, quarantined |
| Critical finding in `src`/`skill` | Trust ≤ 30 until manual review |
| UP-002 | Trust ≤ 50 and a "changed behaviour" banner |
| Reviewer accepts a finding | Weight ×0, logged |

**Grades:** A 85–100, B 70–84, C 50–69, D 30–49, F 0–29. The findings list and capability badges are always shown next to the number.

**Worked examples:**
- `mcp-injection-experiments`: Security 0, grade F.
- `modelcontextprotocol/servers`: Security 92. The only finding is an embedded PNG; after the v1 magic-byte check it becomes 100.

## 4. Prototype run v0 (2026-10-08)
- **Setup:** `python3 -I scanner/scan.py` with the standard library only, read-only. It covered 19 shallow-cloned repos (about 6,600 files) in about 18 s, with nothing installed or executed.
- **Sample:** 10 MCP servers, 5 skill/plugin repos, a positive control (`invariantlabs-ai/mcp-injection-experiments`), 2 scanners (expected false positives), and 1 awesome list.

| Rule | All | src | Notes |
|---|---|---|---|
| TP-001 | 24 | 10 | Control 6/6; DesktopCommander formatting tag benign |
| TP-002 | 10 | 3 | Control 2; one benign comment |
| TP-003 | 42 | 10 | Mostly security tools quoting the attack |
| TP-004 | 26 | 4 | Control 2 true |
| TP-005 | 6 | 2 | All true attack text |
| OB-001 | 3 | 0 | Was 869 before tuning |
| OB-003 | 1 | 0 | Cisco eval corpus |
| OB-004 | 1 | 1 | Embedded PNG (FP) |
| CE-001 | 116 | 25 | Capability, not malice |
| CE-002 | 31 | 8 | Warning strings, tests |
| CR-001 | 12 | 4 | Env inheritance (FP for exfil) |
| FS-001 | 106 | 40 | Config discovery |
| IN-001 | 7 | 7 | 1 real `postinstall`, 6 `prepare` |
| NW-001 | 7 | 2 | OAuth callback, templates |
| RF-001 | 33 | 9 | Installer one-liners |
| SK-001 | 5 | 0 | Docs warning against the flag |
| SK-002 | 231 | 170 | Informational |
| PL-001 | 10 | 10 | Informational |
| DP-001 | 0 | 0 | 4 before workspace exclusion |

**Take-aways:**
1. The regex tier finds the canonical poisoning patterns with full recall on the control set.
2. Negation and quoting are the main false-positive class. v1 needs a negation window and a check of whether the match is in docs/strings or in code, using the AST.
3. Capability rules (CE-001, FS-001) should feed badges, not penalties, unless taint analysis shows a tool argument flowing to a sink.
4. Add an LLM second pass only for TP-* hits in `src`/`skill`.
