> **【オーナー向けの説明（日本語）・社外に出す前にこの枠ごと削除する】**
> - **何の資料か：** 企業の情報システム・セキュリティ担当者に渡す、Atlas の英語の1枚資料（MCP サーバーとスキルの許可リストの紹介と、パイロットの案内）。`atlas/docs/enterprise-one-pager.html` と同じ内容の Markdown 版で、両方をそろえて保つ。
> - **状態：** 下書き。オーナーの承認があるまで、社外への送付・印刷・提示はしない。精度の数字は載せず、ホールドアウトの規模の数字（41,320 ファイル、100件）だけを載せている（`atlas/reports/stage3-holdout.md`）。
> - **埋める箇所：** 末尾の連絡先 `{{CONTACT_EMAIL}}` と `{{DOMAIN}}`（リーダーが埋める）。価格表（Team／Business／Enterprise）は予定の価格で、プランの中身は未確定。
> - **文言：** 判定は "pattern detected"（パターンを検出）。OSV の MAL-* は ID で参照するだけにし、認証や準拠をうたう表現は入れない。以下の英語の本文は変えていない。

<!--
DRAFT - NOT FOR EXTERNAL USE. Atlas enterprise one-pager (English), Growth role, 2026-10-09.
Markdown twin of atlas/docs/enterprise-one-pager.html (keep both in sync).
Needs owner (masahiro20) approval before it is sent, printed for, or shown to anyone outside the team.
Placeholders the leader fills: {{CONTACT_EMAIL}}, {{DOMAIN}}. Holdout numbers filled 2026-10-09 (atlas/reports/stage3-holdout.md).
Wording: findings are "pattern detected"; OSV MAL-* referenced by id only; no certification/compliance claims.
-->

> **DRAFT** — internal only. Needs owner approval before any external use. Accuracy figures are withheld until the scanner is re-validated on a fresh random sample.

**Atlas** · Enterprise brief · MCP servers & agent skills

# Know what you're approving before it goes on your MCP allowlist.

Atlas reviews every MCP server and agent skill your teams request, shows the evidence behind each verdict, and exports a ready-to-deploy allowlist for Claude Code and GitHub Copilot / VS Code. Static analysis only — we never run your code.

## The problem

Claude Code (`managed-mcp.json` / `allowedMcpServers`) and GitHub Copilot / VS Code now ship enterprise MCP allowlists. **They control what is allowed to load — not what's inside.** Registries verify names, not code. The public record shows why that gap matters:

- **postmark-mcp** — an unofficial npm package that, in a later version, was reported to BCC every outgoing email to an outside address. Earlier versions looked fine.
  *Source: [Koi Security](https://www.koi.security/blog/postmark-mcp-npm-malicious-backdoor-email-theft), Sept 2025 · [OSV MAL-2025-47604](https://osv.dev/vulnerability/MAL-2025-47604)*
- **ClawHavoc / ClawHub** — 341+ skills were reported to deliver an information-stealer; Snyk's ToxicSkills study found critical issues in 13.4% of 3,984 skills reviewed.
  *Source: [Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/) and public security reporting*
- **CVE-2025-6514** — command injection (CVSS 9.6) in `mcp-remote`, a widely used bridge to remote MCP servers.
  *Source: [CVE record](https://www.cve.org/CVERecord?id=CVE-2025-6514)*

*Summaries of third-party public reporting, not Atlas findings.*

## How Atlas works

1. **Paste.** Drop in your `.mcp.json` or VS Code `mcp.json`, or a list of skills and plugins.
2. **Review.** Each server or skill is checked against public rules and gets **approve / review / deny**, with every pattern detected shown and why it matters.
3. **Approve & export.** Approve what you accept and export Claude Code `managed-mcp.json` + `allowedMcpServers`, or a Copilot / VS Code `allowedMcpServers` block.

## What you get

- **Verdicts with evidence.** A grade never appears without its findings: rule, file, line, snippet and reason. *(CLI today)*
- **Exportable allowlists** for Claude Code and Copilot / VS Code. *(Private prototype)*
- **CI gate.** `atlas-scan` CLI (MIT) emits SARIF 2.1.0; a GitHub Action uploads it to code scanning and fails the job by severity. *(Works today)* CLI not yet on npm; Action not on Marketplace — used from source, pinned by commit.
- **Version-diff alerts** when an approved server ships a version that adds a network sink, hidden-instruction pattern or changed tools. *(Roadmap)*

## How we measure accuracy

Numbers come only from a **holdout set** kept apart from tuning: 41,320 files across 100 public repositories, randomly sampled with a fixed seed, with no repository or owner overlap with the tuning set. Each high/critical finding is labelled in two independent review passes that cannot see the scanner's decision; disagreements are adjudicated.

| Metric | Holdout result |
|---|---|
| Files analysed statically | 41,320 |
| Randomly sampled registry servers | 100 |
| Lines of scanned code executed | 0 |

Precision on this first holdout was below our bar: most high/critical flags came from security tools' own detection rules and test vectors. We publish accuracy figures only after the fix is re-validated on a fresh random sample.

*Noise reduction lowers severity and flags a finding for review; it never deletes it, and never allowlists by repository name or owner.*

## What we don't do

- **Static only.** We never execute, install or import what we check. Sandboxed dynamic checks are roadmap.
- **Remote-only servers get metadata only** — registry data, provenance and launch config, clearly labelled. No code review without source.
- **Static analysis can be evaded.** A determined author can hide from pattern matching; some data paths are visible only at runtime.
- **Not a guarantee or certification.** A verdict is evidence for your review. Mapping to Japan's AI Guidelines for Business (AI事業者ガイドライン) is roadmap.

## Pilot offer

| Plan | Price | For |
|---|---|---|
| Team | $99 / mo | Allowlist Builder for one team |
| Business | $499 / mo | Multiple teams & policies |
| Enterprise | $6k–12k / yr | Custom terms, procurement support |

*Planned pricing; tier contents provisional. Paying never changes a score.*

**Pilot: nothing billed.** Send us your current MCP config. We return a reviewed verdict for each server and skill, plus a draft allowlist your team can deploy — and you tell us what's missing.

---

**Contact: {{CONTACT_EMAIL}} · {{DOMAIN}}**
Findings describe detected patterns, not intent. Scores are informational, not a security guarantee.
