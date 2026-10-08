"""Build atlas/demo/samples.json for the Allowlist Builder demo (stdlib only).

    python3 -I atlas/demo/build_samples.py

Reads the 100-repo scan (atlas/data/index.json) and the per-repo CSV
(atlas/reports/stage2-scan-100-per-repo.csv) and writes a small set of
representative samples in the shape described in atlas/demo/SPEC.md.

Grade = A-F bucket of the security score (same thresholds as
atlas/scanner/trust.py; provenance/maintenance were not collected in the
100-repo run). Recommendation follows allowlist_core.recommend():
critical in src/skill -> deny; A/B approve, C review, D/F deny; high in a
skill -> review. One documented override: the scanner repo (expected false
positive, hand-classified in stage2-scan-100.md section 3) is shown as review.

Wording: findings are "patterns" (パターンを検出). Our own text never uses the
words listed in FORBIDDEN; the only exception is the verbatim OSV summary.
"""
import csv
import datetime as _dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.normpath(os.path.join(HERE, ".."))
INDEX = os.path.join(ATLAS, "data", "index.json")
CSV = os.path.join(ATLAS, "reports", "stage2-scan-100-per-repo.csv")
OUT = os.path.join(HERE, "samples.json")

SEV_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
CTX_ORDER = {"skill": 0, "src": 1, "ci": 2, "docs": 3, "example": 4, "test": 5}
MAX_FINDINGS = 12
SNIPPET_MAX = 160
FORBIDDEN = re.compile(r"malware|malicious|マルウェア", re.I)

# same patterns as allowlist_core.SECRET_RES (copied so this script stays import-free)
SECRET_RES = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{10,}"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bglpat-[A-Za-z0-9_\-]{20,}"),
]


def redact(s):
    s = str(s)
    for r in SECRET_RES:
        s = r.sub(lambda m: m.group(0)[:4] + "…[REDACTED]", s)
    return s


def has_secret(s):
    return any(r.search(str(s)) for r in SECRET_RES)


def grade(score):
    return "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D" if score >= 30 else "F"


def recommend(g, findings, kind="mcp"):
    """Mirror of allowlist_core.recommend() for index data (no launch-config findings here)."""
    if any(f["sev"] == "critical" and f["ctx"] in ("src", "skill") for f in findings):
        return "deny"
    rec = "approve" if g in ("A", "B") else "review" if g == "C" else "deny"
    if rec == "approve" and any(f["sev"] == "critical" for f in findings):
        rec = "review"  # critical outside shipped code: never auto-approve
    if rec == "approve" and any(f["sev"] == "high" and f["ctx"] == "skill" for f in findings):
        rec = "review"
    return rec


def clean_snippet(s):
    s = " ".join(str(s).split())
    s = redact(s)
    if len(s) > SNIPPET_MAX:
        s = s[:SNIPPET_MAX - 1] + "…"
    return s


def pick_findings(raw):
    live = [f for f in raw if not f.get("suppressed")]
    live.sort(key=lambda f: (-SEV_ORDER.get(f["sev"], 0), CTX_ORDER.get(f.get("ctx"), 9),
                             f["rule"], f["file"], f.get("line") or 0))
    out = []
    for f in live:
        text = " ".join(str(f.get(k, "")) for k in ("snippet", "title", "why", "file"))
        if FORBIDDEN.search(text):
            continue  # keep the page free of that wording; counts still include it
        rec = {"rule": f["rule"], "sev": f["sev"], "title": f.get("title", ""),
               "file": f["file"], "line": f.get("line") or 0, "ctx": f.get("ctx", "src"),
               "snippet": clean_snippet(f.get("snippet", ""))}
        if f.get("why"):
            rec["why"] = f["why"]
        assert not has_secret(rec["snippet"])
        out.append(rec)
        if len(out) >= MAX_FINDINGS:
            break
    return out


def counts(raw):
    c = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in raw:
        if not f.get("suppressed"):
            c[f["sev"]] = c.get(f["sev"], 0) + 1
    return c


def parse_pkgs(pkgs):
    out = []
    for p in pkgs:
        eco, _, name = p.partition(":")
        out.append({"eco": eco, "name": name})
    return out


def npx(name, ver="latest"):
    return {"command": "npx", "args": ["-y", f"{name}@{ver}"]}


# --- sample selection ------------------------------------------------------
# key = owner/repo; each entry: category, why-selected reason, launch config,
# optional packages filter (subset of the repo's packages), optional override.
PICKS = [
    {"repo": "invariantlabs-ai/mcp-injection-experiments", "id": "mcp-injection-experiments",
     "name": "mcp-injection-experiments (陽性対照)", "category": "control", "config": None,
     "reasons": ["既知のツールポイズニング手法を集めた研究用リポジトリで、陽性対照として収録しています。",
                 "ツール説明文の <IMPORTANT> タグと、~/.ssh や ~/.cursor/mcp.json を読ませる指示のパターンを検出しました（手作業の確認でも攻撃型と分類）。"]},
    {"repo": "modelcontextprotocol/servers", "id": "mcp-reference-servers",
     "name": "MCP reference servers (server-everything ほか)", "category": "reference",
     "config": npx("@modelcontextprotocol/server-everything"),
     "reasons": ["MCP 公式の参照サーバー群です。",
                 "get-env ツールが環境変数をすべて出力するパターンを検出しました。手作業の確認では、テスト用サーバーの意図された機能（正当な用途）と分類しています。",
                 "本番の端末で使う場合は、環境変数に秘密情報が入っていないことを確認してください。"]},
    {"repo": "github/github-mcp-server", "id": "github-mcp-server",
     "name": "GitHub MCP Server", "category": "reference",
     "config": {"command": "docker", "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
                                              "ghcr.io/github/github-mcp-server"],
                "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"}},
     "reasons": ["GitHub 公式の MCP サーバー（OCI イメージ）です。",
                 "high 以上のパターンはテストコード内でのみ検出しました（出荷コード src での検出は medium 以下）。"]},
    {"repo": "wonderwhy-er/DesktopCommanderMCP", "id": "desktop-commander",
     "name": "Desktop Commander MCP", "category": "capability",
     "config": npx("@wonderwhy-er/desktop-commander"),
     "reasons": ["npm の postinstall でスクリプトを実行するパターンを検出しました（導入時のテレメトリー送信を含む）。手作業の確認では正当な用途と分類しています。",
                 "src/tools/prompts.ts の <INSTRUCTION> タグ（ATL-TP-001）は出力整形用の文字列で、手作業の確認では誤検知と分類しています。",
                 "シェル実行など強い権限を持つ機能を提供するため、承認前に人が確認してください。"]},
    {"repo": "Holetron-lab/fleet-memory", "id": "fleet-memory",
     "name": "fleet-memory (skills)", "category": "capability",
     "config": npx("fleet-memory-mcp"),
     "reasons": ["SKILL.md がエージェントに `curl … | bash` でリモートスクリプトを実行させる指示のパターンを検出しました。",
                 "スキル内の critical パターンのため拒否推奨です。インストーラーの取得元を確認し、手動で導入する運用を検討してください。"]},
    {"repo": "cisco-ai-defense/mcp-scanner", "id": "cisco-mcp-scanner",
     "name": "Cisco MCP Scanner (スキャナー自身)", "category": "fp",
     "config": None, "override_rec": "review",
     "reasons": ["MCP 向けセキュリティスキャナー自身のリポジトリで、誤検知の例として収録しています。",
                 "脅威分類の説明文に引用された攻撃文のパターンを検出しましたが、手作業の確認では引用されたドキュメントであり誤検知と分類しています。",
                 "critical の検出はすべて example / test の文脈（評価用データやサンプルコード）にあり、src / skill にはありません。",
                 "等級だけで判定すると拒否推奨になりますが、このデモでは誤検知の扱い方を示すため要レビューとしています。"]},
    {"repo": "upstash/context7", "id": "context7", "name": "Context7 MCP", "category": "typical",
     "config": npx("@upstash/context7-mcp"),
     "reasons": ["よく使われる文書検索サーバーです。high 以上のパターンは検出されませんでした。"]},
    {"repo": "geelen/mcp-remote", "id": "mcp-remote", "name": "mcp-remote", "category": "typical",
     "config": {"command": "npx", "args": ["-y", "mcp-remote@latest", "https://example.com/mcp"]},
     "reasons": ["リモート MCP サーバーへの中継ツールです。info 相当のパターン1件のみを検出しました。"]},
    {"repo": "CommonNinja/sendraven-mcp-server", "id": "sendraven-mcp", "name": "SendRaven MCP",
     "category": "typical", "config": npx("@sendraven/mcp"),
     "reasons": ["MCP Registry から無作為に選んだサーバーです。パターンは検出されませんでした。"]},
    {"repo": "RoscoNL/intodns-mcp-server", "id": "intodns-mcp", "name": "IntoDNS MCP", "category": "typical",
     "config": npx("intodns-mcp"),
     "reasons": ["MCP Registry から無作為に選んだ DNS 診断サーバーです。info 相当のパターン1件のみを検出しました。"]},
]

OSV_SUMMARY = "Malicious code in postmark-mcp (npm)"  # verbatim OSV summary (allowlist/README.md)
POSTMARK = {
    "id": "postmark-mcp", "name": "postmark-mcp (npm)", "repo": None,
    "packages": [{"eco": "npm", "name": "postmark-mcp"}],
    "category": "osv", "grade": "F", "trust": 0, "quarantined": True, "recommendation": "deny",
    "reasons": [
        "OSV に MAL-2025-47604 として登録（1.0.16 以降）されているため、隔離（quarantine）扱いで拒否推奨です。",
        "公開報道によると、後の版で送信メールを外部アドレスに BCC で転送するパターンが追加されていました。",
        "この OSV 結果は CLI が api.osv.dev を照会して得たもので、このページ自身は照会していません。",
    ],
    "counts": {"critical": 1, "high": 0, "medium": 0, "low": 0, "info": 0},
    "findings": [{"rule": "ATL-DP-OSV", "sev": "critical", "title": "Listed in OSV (MAL-2025-47604)",
                  "file": "npm:postmark-mcp", "line": 0, "ctx": "src",
                  "snippet": "OSV MAL-2025-47604: affected from 1.0.16",
                  "why": "OSV の MAL-* 登録に該当するパターンを検出（CLI のライブ照会結果）"}],
    "osv": [{"id": "MAL-2025-47604", "summary": OSV_SUMMARY, "affected": ">=1.0.16",
             "source": "api.osv.dev (fetched by the CLI on 2026-10-08, not by this page)"}],
    "config": npx("postmark-mcp", "1.0.16"),
    "note": "repo スキャンは index.json に無し。OSV 結果は CLI のライブ照会（2026-10-08）によるもので、このページからの照会ではありません。",
}

REQUIRED = ("id", "name", "repo", "packages", "category", "grade", "trust", "recommendation",
            "reasons", "counts", "findings", "osv", "config")


def main():
    with open(INDEX, encoding="utf-8") as fh:
        idx = json.load(fh)
    by_repo = {e["repo"].rstrip("/").lower(): e for e in idx["entries"]}
    with open(CSV, encoding="utf-8", newline="") as fh:
        rows = {r["repo"].rstrip("/").lower(): r for r in csv.DictReader(fh)}

    samples = []
    for p in PICKS:
        url = "https://github.com/" + p["repo"]
        e, row = by_repo[url.lower()], rows[url.lower()]
        score = int(row["security_score"])
        g = grade(score)
        raw = [f for f in e["findings"] if not f.get("suppressed")]
        rec = recommend(g, raw)
        derived = rec
        if p.get("override_rec"):
            rec = p["override_rec"]
        c = counts(raw)
        reasons = list(p["reasons"])
        n = sum(c.values())
        if n:
            reasons.append(f"静的スキャンで {n} 件のパターンを検出しました（critical {c['critical']} / high {c['high']} / "
                           f"medium {c['medium']} / low {c['low']}、抑制済み {sum(e['suppressed_counts'].values())} 件は除外）。")
        else:
            reasons.append("静的スキャンではパターンを検出しませんでした（パターン検出なし）。")
        reasons.append(f"安全性スコア {score}/100（等級 {g}）。出所・保守状況はこの調査では未収集です。")
        s = {"id": p["id"], "name": p["name"], "repo": url, "packages": parse_pkgs(e["packages"]),
             "category": p["category"], "grade": g, "trust": score, "recommendation": rec,
             "reasons": reasons, "counts": c, "findings": pick_findings(raw), "osv": [],
             "config": p["config"], "commit": e.get("commit"), "kind": row["kind"],
             "badges": row["badges"].split() if row["badges"] else []}
        if derived != rec:
            s["derived_recommendation"] = derived
        samples.append(s)
    samples.append(POSTMARK)

    doc = {
        "generated": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": (f"atlas/data/index.json ({idx.get('generated')}, {idx.get('scanner')}), "
                   "atlas/reports/stage2-scan-100-per-repo.csv, stage2-scan-100.md (手作業分類), "
                   "OSV: CLI live lookup 2026-10-08 (allowlist/README.md)"),
        "note": ("検出は「パターン」であり、悪意の断定ではありません。等級は安全性スコアのみによる参考値で、"
                 "出所・保守状況は含みません。最終判断は人が行ってください。"),
        "samples": samples,
    }

    # --- validation ---
    for s in samples:
        missing = [k for k in REQUIRED if k not in s]
        assert not missing, (s["id"], missing)
        assert s["recommendation"] in ("approve", "review", "deny")
        assert len(s["findings"]) <= MAX_FINDINGS
        assert all(len(f["snippet"]) <= SNIPPET_MAX and not has_secret(f["snippet"]) for f in s["findings"])
        assert any("パターン" in r for r in s["reasons"]), s["id"]
    probe = json.loads(json.dumps(doc))
    for s in probe["samples"]:
        for o in s["osv"]:
            o.pop("summary", None)
    assert not FORBIDDEN.search(json.dumps(probe, ensure_ascii=False)), "forbidden wording outside osv[].summary"

    text = json.dumps(doc, ensure_ascii=False, indent=1)
    assert len(text.encode("utf-8")) < 200_000
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    print(f"wrote {OUT}: {len(samples)} samples, {len(text.encode('utf-8'))} bytes")
    for s in samples:
        print(f"  {s['id']:28} {s['category']:10} {s['grade']} {s['trust']!s:>3} {s['recommendation']:7} "
              f"{s['counts']} findings={len(s['findings'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
