"""Atlas trust score v0 (scan-rules-v0.md section 3) -- stdlib only.

    Trust = round(0.60*Security + 0.25*Provenance + 0.15*Maintenance), then caps

Inputs are plain dicts so callers (scanner CLI, Allowlist Builder) can share it:

    findings:    [{"rule", "sev", "ctx", "file", "line", "snippet", "title"}, ...]
    provenance:  {"verified_namespace", "repo_matches_package", "provenance_attested",
                  "pinned_launch", "osi_license", "mature_repo"}  (bools; missing = False)
    maintenance: {"scorecard": 0-10 | None, "recent_commit": bool | None,
                  "no_open_osv": bool | None}  (None everywhere -> neutral 25)
    osv_ids:     ["MAL-2025-1234", "GHSA-..."]  MAL-* = hard fail

Wording rule: verdicts say "pattern detected" (パターンを検出); only OSV MAL-*
entries may be called malicious, because that is OSV's own classification.
"""
from collections import defaultdict

W = {"critical": 40, "high": 20, "medium": 8, "low": 3, "info": 0}
C = {"src": 1.0, "skill": 1.0, "docs": 0.4, "ci": 0.3, "example": 0.3, "test": 0.15}
CTX_RANK = ["test", "example", "ci", "docs", "src", "skill"]
SEV_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

# Capability rules are disclosed as badges, not penalties (stage-1 take-away 3).
BADGE_RULES = {
    "ATL-CE-001": "shell-exec",
    "ATL-CE-002": "dynamic-code",
    "ATL-FS-001": "reads-credential-paths",
    "ATL-SK-002": "contains-code",
    "ATL-PL-001": "hooks",
    "ATL-NW-001": "binds-all-interfaces",
}
PROVENANCE_POINTS = {
    "verified_namespace": 25,
    "repo_matches_package": 20,
    "provenance_attested": 20,
    "pinned_launch": 10,
    "osi_license": 10,
    "mature_repo": 15,
}


def grade(score):
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 50:
        return "C"
    if score >= 30:
        return "D"
    return "F"


def security_score(findings):
    """Return (score, per-rule penalty breakdown)."""
    by_rule = defaultdict(list)
    for f in findings:
        if f.get("suppressed"):
            continue
        by_rule[f["rule"]].append(f)
    total = 0.0
    breakdown = []
    for rid, fs in sorted(by_rule.items()):
        sev = max((f["sev"] for f in fs), key=lambda s: SEV_ORDER.get(s, 0))
        ctx = max((f.get("ctx", "src") for f in fs), key=lambda c: CTX_RANK.index(c) if c in CTX_RANK else 3)
        w = W.get(sev, 0)
        if rid in BADGE_RULES and sev in ("medium", "low", "info"):
            w = 0  # capability disclosure, shown as badge
        pen = w * C.get(ctx, 1.0) * (1 + 0.25 * min(len(fs) - 1, 4))
        if pen:
            breakdown.append({"rule": rid, "sev": sev, "ctx": ctx, "count": len(fs), "penalty": round(pen, 1)})
        total += pen
    return max(0, round(100 - total)), breakdown


def provenance_score(p):
    p = p or {}
    return min(100, sum(pts for k, pts in PROVENANCE_POINTS.items() if p.get(k)))


def maintenance_score(m):
    m = m or {}
    if all(m.get(k) is None for k in ("scorecard", "recent_commit", "no_open_osv")):
        return 25
    s = 0
    if m.get("scorecard") is not None:
        s += min(50, 5 * float(m["scorecard"]))
    if m.get("recent_commit"):
        s += 30
    if m.get("no_open_osv"):
        s += 20
    return min(100, round(s))


def trust(findings, provenance=None, maintenance=None, osv_ids=None, up002=False):
    sec, breakdown = security_score(findings)
    prov = provenance_score(provenance)
    maint = maintenance_score(maintenance)
    score = round(0.60 * sec + 0.25 * prov + 0.15 * maint)
    caps = []
    mal = [i for i in (osv_ids or []) if str(i).upper().startswith("MAL-")]
    if mal:
        score = 0
        caps.append({"cap": 0, "reason": "OSV lists this package or a direct dependency as malicious (" + ", ".join(mal) + "); see the DP-002 finding for which"})
    crit = [f for f in findings if f["sev"] == "critical" and f.get("ctx") in ("src", "skill") and not f.get("suppressed")]
    if crit and score > 30:
        score = 30
        caps.append({"cap": 30, "reason": "critical pattern detected in src/skill; manual review needed"})
    live = [f for f in findings if not f.get("suppressed")]
    if up002 and score > 50:
        score = 50
        caps.append({"cap": 50, "reason": "behaviour changed between versions (UP-002); re-review needed"})
    live = [f for f in findings if not f.get("suppressed")]
    badges = sorted({BADGE_RULES[f["rule"]] for f in live if f["rule"] in BADGE_RULES}
                    | {f["badge"] for f in live if f.get("badge")})
    return {
        "trust": score,
        "grade": grade(score),
        "security": sec,
        "provenance": prov,
        "maintenance": maint,
        "penalties": breakdown,
        "caps": caps,
        "badges": badges,
        "quarantined": bool(mal),
        "changed_behaviour": bool(up002),
    }
