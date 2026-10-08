<!--
DRAFT — NOT PUBLISHED. Landing page copy for P5 Atlas (growth role, 2026-10-08).
Needs owner (masahiro20) approval before going live, before any announcement, and before the waitlist form collects real data.
Placeholders: {{DOMAIN}}, {{WAITLIST_FORM_URL}}, {{CONTACT_EMAIL}}, {{RULES_URL}}.
Wording rule: findings are "pattern detected" (JP: 「パターンを検出」). Never call a server/skill "malware"/"malicious";
the only exception is OSV MAL-* advisories. Unbuilt features are marked "(roadmap)".
-->

# Atlas — landing page copy (DRAFT, not published)

> Status: DRAFT · Owner approval required before publishing · Domain: `{{DOMAIN}}` · Waitlist form: `{{WAITLIST_FORM_URL}}`

---

## Hero

**Headline:** Know what you're approving before it goes on your MCP allowlist.

**Subhead:** Paste your `.mcp.json` or skill list. Atlas returns an evidence-backed verdict for every server and skill, then exports a ready-to-deploy allowlist for Claude Code and GitHub Copilot / VS Code. Static analysis only — we never run your code.

**CTA:** [Join the waitlist]({{WAITLIST_FORM_URL}}) · *Built for platform and security engineers at 50–500-person orgs.*

### Alternative headlines (A/B)
1. Your MCP allowlist controls what loads. Atlas tells you what's inside.
2. Evidence-backed verdicts for every MCP server and agent skill your team wants.
3. Approve MCP servers with receipts, not vibes.
4. From `.mcp.json` to `managed-mcp.json` — with a reviewed reason for every entry.
5. Public rules. Visible findings. Scores that can't be bought.

---

## The problem

Enterprise allowlists are now built into the tools: Claude Code has `managed-mcp.json` / `allowedMcpServers`, and GitHub Copilot / VS Code added MCP allowlists in enterprise-managed settings. **They decide what is allowed to load. They don't review what's inside.**

Registries don't fill the gap either. The official MCP registry (~40,700 entries in our count) verifies namespaces and leaves security checks to downstream consumers; large directories list tens of thousands of servers with little or no review.

That leaves your team guessing — and the public record shows why that matters:

- **postmark-mcp** — an unofficial npm package that, in a later version, BCC'd every outgoing email to an outside address. Earlier versions looked fine; the change arrived in an update.
- **ClawHavoc** — 341+ skills on ClawHub were reported to deliver an information-stealer (AMOS). Snyk's ToxicSkills study found critical issues in 13.4% of 3,984 skills reviewed.
- **CVE-2025-6514** — command injection in `mcp-remote` (CVSS 9.6), a widely used bridge to remote MCP servers.
- **Tool poisoning** — hidden instructions in tool descriptions (documented by Invariant Labs) that steer the agent without the user seeing them.

Existing scanners help, but in our review fewer than half of their flags turned out to be real risks. A verdict you can't inspect is hard to act on.

---

## How it works

1. **Paste.** Drop in your `.mcp.json` / `managed-mcp.json`, or a list of skills and plugins.
2. **Review.** Atlas checks each server or skill against public rules and returns a trust score with every finding and capability shown — what pattern was detected, where, and why it matters.
3. **Approve & export.** Approve what you're comfortable with and export a Claude Code `managed-mcp.json` / `allowedMcpServers` or a GitHub Copilot / VS Code `allowedMcpServers` block. *(Allowlist Builder is in private prototype.)*

**Then (roadmap):** version-diff alerts when an approved server or skill ships a new version that adds a network sink, new hidden-instruction pattern, or changed tools.

---

## Sample verdict card

> *Illustrative example. Not a real package or real scan result.*

```
example-files-mcp  v1.4.2  (npm)                     Trust 62 / 100  ·  Grade C
──────────────────────────────────────────────────────────────────────────────
Security 70   Provenance 45   Maintenance 55

Findings
  HIGH    IN-001  npm "postinstall" script detected — runs at install time
  MEDIUM  DP-001  Unpinned dependency ("latest")
  MEDIUM  UP-001  Launch config uses `npx -y example-files-mcp@latest` (floating version)
  LOW     FS-001  References ~/.aws/credentials (config discovery; no network sink found)

Capability badges   [reads local files] [runs shell commands] [contains code]
Provenance          ✓ repo matches package  ✓ OSI licence  ✗ no npm provenance

Suggested action    Approve pinned to v1.4.2 after reviewing postinstall  →  [Approve] [Reject]
Evidence            file:line links for every finding · rule docs at {{RULES_URL}}
```

---

## What we check

55 public rules across 13 categories (v0 ships the regex / manifest / OSV tier; deeper AST and metadata checks are roadmap):

| Category | Examples of what we look for |
|---|---|
| Tool poisoning | Hidden `<IMPORTANT>`-style tags, "do not tell the user", instructions to read `~/.ssh` |
| Obfuscation | Zero-width / bidi characters, Unicode tag smuggling, decode-then-execute |
| Command execution | `shell=True`, `child_process.exec`, `eval` — shown as capabilities, not automatic penalties |
| Remote fetch | `curl \| sh` inside code or skill instructions |
| Network | Binding `0.0.0.0`, known exfiltration endpoints (webhook.site, requestbin, ngrok, …) |
| Credentials | Bulk environment dumps, hard-coded secrets |
| Filesystem | References to credential and agent-config paths |
| Install-time | npm `postinstall`, custom `setup.py` commands |
| Dependencies | Unpinned deps; known vulnerabilities via OSV. Packages listed as malicious in OSV (`MAL-*`) are quarantined with a score of 0 |
| Auto-update | Floating versions in launch configs (`@latest`) — the vector behind postmark-mcp |
| Skills & plugins | Instructions to skip permissions, bundled scripts, shell-running hooks |

**Trust score v0:** `0.60 × Security + 0.25 × Provenance + 0.15 × Maintenance`, graded A–F. A critical finding in source caps the score at 30 until reviewed. The number never appears without its findings and capability badges.

---

## What we don't do

- **We don't run your code.** Atlas never executes, installs, or imports what it checks. Sandboxed dynamic checks are roadmap.
- **Remote-only servers get metadata only.** Around 58% of official-registry entries have no public source; for those we can check registry metadata, provenance and config, not code.
- **Static analysis can be evaded.** Researchers (Trail of Bits) have bypassed every skill scanner tested. A determined attacker can hide from pattern matching, and some data-leak paths are only visible at runtime.
- **Not a guarantee.** A verdict is evidence to support your review, not a certification that something is safe.

---

## Pricing

*Planned pricing. Nothing is billed during the waitlist.*

| Free | Team | Business | Enterprise |
|---|---|---|---|
| $0 | $99 / month | $499 / month | $6k–12k / year |
| Public verdicts and rules | Allowlist Builder for one team | Multiple teams & policies | Custom terms, procurement support |

*Tier contents are provisional — final limits TBD.* Publishers can buy a listing badge ($49–99/month, roadmap); **paying never changes a score — for publishers or customers.**

---

## FAQ

**Do you run our code?**
No. Atlas reads source, published packages and manifests statically. Nothing is installed or executed.

**Does a low score mean the tool is unsafe or compromised?**
No. A low score means patterns were detected that deserve a closer look — many are capabilities a tool legitimately needs (running shell commands, reading files). Read the findings, not just the number.

**Can a publisher pay for a better score?**
No. Scoring rules are public and identical for everyone. Paid plans buy features, never scores.

**What about servers with no public source?**
They receive a metadata-only verdict (provenance, registry data, launch config), clearly labelled.

**Which formats can I export?**
Claude Code `managed-mcp.json` / `allowedMcpServers` and GitHub Copilot / VS Code `allowedMcpServers` (Allowlist Builder in private prototype).

**What if Atlas flags something we've reviewed and accepted?**
A reviewer can accept a finding; its weight drops to zero and the decision is logged.

**Do you support Japanese compliance needs?**
We are mapping checks to Japan's AI Guidelines for Business (AI事業者ガイドライン) v1.2 (roadmap).

---

## Final CTA

**Stop approving MCP servers on trust alone.**
[Join the waitlist]({{WAITLIST_FORM_URL}}) — early teams get a hands-on review of their current MCP config.

---

## Footer note

Atlas performs static analysis only and does not execute scanned code. Findings describe detected patterns, not intent. Scores are informational, not a security guarantee. Incident references link to public reporting. Contact: `{{CONTACT_EMAIL}}` · © {{YEAR}} Atlas · `{{DOMAIN}}`

---

# 日本語版（主要セクション）

## ヒーロー

**見出し：** MCPの許可リストに載せる前に、中身を確かめる。

**サブ見出し：** `.mcp.json` やスキル一覧を貼るだけ。サーバー・スキルごとに根拠付きの判定を返し、Claude Code と GitHub Copilot / VS Code 用の許可リストをそのまま出力します。静的解析のみで、コードは一切実行しません。

**CTA：** [待機リストに登録する]({{WAITLIST_FORM_URL}})

## 3つの価値

1. **根拠が見える判定。** 0〜100の信頼スコア（A〜F）と一緒に、どのファイルのどこでどんなパターンを検出したかを必ず表示します。
2. **許可リストをそのまま出力。** 承認したものを `managed-mcp.json` / `allowedMcpServers` 形式で書き出せます（試作中）。承認済みサーバーの更新時の差分通知はロードマップです。
3. **公開ルール、買えないスコア。** 検査ルールは公開。料金を払ってもスコアは変わりません。

**なぜ今か：** 国内の企業担当者110名への調査では、「MCPの導入や普及に際して不安に感じる点」（複数回答）で最も多かったのが「セキュリティ管理が難しそう」（52.7%）でした\[注1\]。AI事業者ガイドライン（第1.2版）\[注2\]を踏まえた社内審査の根拠資料として使える形を目指します（ガイドラインとの対応表はロードマップ）。

<small>\[注1\] クラウドエース株式会社「MCP（Model Context Protocol）に関する企業意識調査」（2025年8月5日発表／調査期間：2025年7月28日〜29日／インターネット調査／対象：生成AIを業務に活用し、AIと業務システムの連携を利用中または検討中の企業の情報システム・DX推進・AI活用推進部門の担当者／有効回答 n=110）。https://prtimes.jp/main/html/rd/p/000000278.000032396.html<br>
\[注2\] 総務省・経済産業省「AI事業者ガイドライン（第1.2版）」（2026年3月31日公表）。https://www.soumu.go.jp/main_sosiki/kenkyu/ai_network/02ryutsu20_04000019.html</small>

## CTA

**「なんとなく許可」を、根拠のある承認に。**
[待機リストに登録する]({{WAITLIST_FORM_URL}})

*注：Atlas の判定は検出したパターンに基づく参考情報であり、安全性を保証するものではありません。*

---

# X / build-in-public post draft — DO NOT POST (needs owner approval; no X account yet)

> Claude Code and Copilot now let enterprises allowlist MCP servers.
> But an allowlist controls *what loads* — not *what's inside*.
>
> Building Atlas: paste your .mcp.json → evidence-backed verdict per server (public rules, findings always shown) → export managed-mcp.json.
> Static only. We never run your code. Waitlist soon.
