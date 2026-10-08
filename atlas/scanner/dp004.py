"""DP-004 / DP-005: published package <-> source repo comparison -- stdlib only.

    res = check(info, pkg_root, workdir)     # info from pkgfetch.resolve(); pkg_root from pkgfetch.fetch_extract()
    res["status"]      -> "clean" | "mismatch" | "not-comparable" | "no-repo"
    res["findings"]    -> ATL-DP-004 / ATL-DP-005 findings (scanner shape)
    res["repo_scan"]   -> scan.scan_repo() findings of the source repo (package subdir)
    res["pkg_scan"]    -> scan.scan_repo() findings of the published package (source "package")

Everything is read as data. The repo is shallow-cloned with hooks disabled,
LFS smudge off, https only; the package archive was extracted by pkgfetch.
Nothing is installed, imported, built or executed.

Rules
  ATL-DP-004 high    lifecycle script (preinstall/install/postinstall) present in the
                     published package but absent or different in the source repo
  ATL-DP-004 medium  source-like files only in the package or with different content
  ATL-DP-004 info    not comparable (package ships build output only)
  ATL-DP-005 low     declared repository unreachable or missing (~15% of registry repo
                     URLs were unreachable in the 100-repo test)
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import scan as _scan  # noqa: E402

LIFECYCLE = ("preinstall", "install", "postinstall")
SOURCE_EXT = (".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".py", ".sh")
BUILD_DIRS = {"dist", "build", "__pycache__"}
GENERATED = {"_version.py", "version.py"}  # commonly written at build time (setuptools_scm, hatch-vcs)
REPO_SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__"}
MAX_EXAMPLES = 10


# ---------------------------------------------------------------------------
# Repo helpers (moved from allowlist_core; core keeps aliases)
# ---------------------------------------------------------------------------
def norm_repo(u):
    if not u:
        return ""
    u = str(u).strip()
    u = re.sub(r"^git\+", "", u)
    m = re.match(r"^(?:git@|ssh://git@)([^:/]+)[:/](.+)$", u)
    if m:
        u = f"https://{m.group(1)}/{m.group(2)}"
    u = re.sub(r"^(git|http)://", "https://", u)
    u = re.sub(r"^github:", "https://github.com/", u)
    u = u.split("#")[0].rstrip("/")
    if u.endswith(".git"):
        u = u[:-4]
    return u.lower()


def split_tree_url(u):
    """https://github.com/o/r/tree/<ref>/sub/dir -> (https://github.com/o/r, sub/dir)."""
    m = re.match(r"^(https://(?:github\.com|gitlab\.com|codeberg\.org)/[\w.\-]+/[\w.\-]+)(?:/-)?/(?:tree|blob)/[^/]+/?(.*)$", str(u or ""))
    if m:
        return m.group(1), (m.group(2).strip("/") or None)
    return u, None


def find_package_dir(root, eco, name, max_depth=4):
    """Locate a monorepo package by reading manifests as text (never executed)."""
    want = (name or "").lower()
    if not want:
        return None
    for dp, dns, fns in os.walk(root):
        depth = os.path.relpath(dp, root).count(os.sep)
        dns[:] = sorted(d for d in dns if d not in _scan.SKIP_DIRS and not d.startswith(".")) if depth < max_depth else []
        try:
            if eco == "npm" and "package.json" in fns:
                with open(os.path.join(dp, "package.json"), encoding="utf-8", errors="replace") as fh:
                    if str(json.load(fh).get("name", "")).lower() == want:
                        return dp
            if eco == "pypi" and "pyproject.toml" in fns:
                with open(os.path.join(dp, "pyproject.toml"), encoding="utf-8", errors="replace") as fh:
                    m = re.search(r'^name\s*=\s*["\']([^"\']+)', fh.read(), re.M)
                if m and re.sub(r"[-_.]+", "-", m.group(1).lower()) == re.sub(r"[-_.]+", "-", want):
                    return dp
        except (OSError, ValueError, AttributeError):
            continue
    return None


GIT_SAFE = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
            "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "submodule.recurse=false"]


def _git_env():
    return dict(os.environ, GIT_LFS_SKIP_SMUDGE="1", GIT_TERMINAL_PROMPT="0", GIT_ASKPASS="true",
                GIT_CONFIG_NOSYSTEM="1")


def _check_url(repo_url):
    u = norm_repo(repo_url)
    if not re.match(r"^https://[a-z0-9.\-]+/[\w.\-]+/[\w.\-]+(/[\w.\-]+)*$", u):
        raise ValueError(f"refusing to clone non-https / unexpected URL: {repo_url!r}")
    return u


def tag_candidates(version, name=None):
    if not version:
        return []
    v = str(version).lstrip("v")
    c = ["v" + v, v]
    if name:
        base = name.split("/")[-1]
        for n in dict.fromkeys([name, base]):
            c += [f"{n}@{v}", f"{n}-v{v}", f"{n}@v{v}", f"{n}-{v}", f"{n}/v{v}"]
    c += [f"release-{v}", f"release/v{v}"]
    return list(dict.fromkeys(c))


def find_tag(repo_url, version, name=None, timeout=60):
    """Return the first matching tag name via `git ls-remote --tags` (no checkout), or None."""
    u = _check_url(repo_url)
    r = subprocess.run(GIT_SAFE + ["ls-remote", "--tags", "--refs", "--", u + ".git"], env=_git_env(),
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise OSError("git ls-remote failed: " + r.stderr.strip()[-200:])
    tags = {ln.split("refs/tags/", 1)[1] for ln in r.stdout.splitlines() if "refs/tags/" in ln}
    for c in tag_candidates(version, name):
        if c in tags:
            return c
    return None


def safe_clone(repo_url, dest, ref=None, timeout=120, name=None):
    """Shallow clone (hooks off, LFS smudge off, https only) at the version tag if one exists,
    else the default branch. Returns (commit sha, ref used) or raises."""
    u = _check_url(repo_url)
    env = _git_env()
    base = GIT_SAFE + ["clone", "--depth", "1", "--single-branch", "--no-tags", "--quiet"]
    tries = []
    if ref:
        tag = None
        try:
            tag = find_tag(u, ref, name)
        except (OSError, subprocess.TimeoutExpired):
            tag = None
        if tag:
            tries.append(["--branch", tag])
    tries.append([])
    last = None
    for extra in tries:
        if os.path.exists(dest):
            shutil.rmtree(dest, ignore_errors=True)
        r = subprocess.run(base + extra + ["--", u + ".git", dest], env=env, capture_output=True,
                           text=True, timeout=timeout)
        if r.returncode == 0:
            sha = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", dest, "rev-parse", "HEAD"],
                                 env=env, capture_output=True, text=True, timeout=30).stdout.strip()
            return sha, (extra[1] if extra else "default-branch")
        last = r.stderr.strip()[-300:]
    raise OSError(f"git clone failed: {last}")


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------
def _read_json(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _digest(p):
    try:
        with open(p, "rb") as fh:
            data = fh.read(_scan.MAX_BYTES * 5)
    except OSError:
        return None
    data = data.replace(b"\r\n", b"\n")
    return hashlib.sha256(data.rstrip()).hexdigest()


def _walk(root, skip=REPO_SKIP):
    out = {}
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in skip]
        for fn in fns:
            full = os.path.join(dp, fn)
            if os.path.islink(full):
                continue
            out[os.path.relpath(full, root).replace(os.sep, "/")] = full
    return out


def _is_source(rel):
    low = rel.lower()
    if not low.endswith(SOURCE_EXT):
        return False
    return not (low.endswith((".d.ts", ".d.mts", ".d.cts", ".min.js", ".map")))


def _is_build(rel, repo_has_lib):
    parts = rel.split("/")
    dirs = parts[:-1]
    if any(d in BUILD_DIRS or d.endswith(".egg-info") or d.endswith(".dist-info") for d in dirs):
        return True
    if dirs and dirs[0] == "lib" and not repo_has_lib:
        return True
    return parts[-1] in ("PKG-INFO",)


def _finding(sev, title, snippet, file="package", **kw):
    d = {"rule": "ATL-DP-004", "sev": sev, "file": file, "line": 0, "snippet": snippet[:200], "ctx": "src",
         "title": title, "source": "dp004", "method": "meta"}
    d.update(kw)
    return d


def compare(pkg_root, repo_root, registry_scripts=None, label="package"):
    """Compare an extracted package with the repo checkout (package subdir). Returns dict."""
    findings = []
    # 1. lifecycle scripts (tarball package.json, plus registry manifest scripts if given)
    pj = _read_json(os.path.join(pkg_root, "package.json"))
    rj = _read_json(os.path.join(repo_root, "package.json"))
    pscripts = dict((registry_scripts or {}))
    pscripts.update(pj.get("scripts") or {})
    rscripts = rj.get("scripts") or {}
    script_diffs = []
    for k in LIFECYCLE:
        v = pscripts.get(k)
        if not v:
            continue
        if k == "install" and str(v).strip() == "node-gyp rebuild" and os.path.isfile(os.path.join(pkg_root, "binding.gyp")):
            continue  # npm adds this default for native addons
        if str(rscripts.get(k) or "").strip() != str(v).strip():
            script_diffs.append(k)
            findings.append(_finding("high", "Published install script not in source repo",
                                     f"{k}: {v} (repo: {rscripts.get(k) or 'absent'})", f"{label}/package.json"))
    # 2. source-like files
    repo_files = _walk(repo_root)
    repo_has_lib = os.path.isdir(os.path.join(repo_root, "lib"))
    alt = {}
    for rel in repo_files:
        if rel.startswith("src/"):
            alt.setdefault(rel[4:], rel)
    pkg_files = _walk(pkg_root, skip={".git", "node_modules"})
    identical, differ, only_pkg, build = [], [], [], []
    for rel in sorted(pkg_files):
        if not _is_source(rel):
            continue
        if _is_build(rel, repo_has_lib):
            build.append(rel)
            continue
        if rel.rsplit("/", 1)[-1] in GENERATED and rel not in repo_files:
            continue
        rrel = rel if rel in repo_files else alt.get(rel)
        if not rrel:
            only_pkg.append(rel)
        elif _digest(pkg_files[rel]) == _digest(repo_files[rrel]):
            identical.append(rel)
        else:
            differ.append(rel)
    compared = len(identical) + len(differ) + len(only_pkg)
    stats = {"compared": compared, "identical": len(identical), "differ": len(differ),
             "only_in_package": len(only_pkg), "build_output": len(build), "script_diffs": script_diffs}
    if differ or only_pkg:
        ex = (differ + only_pkg)[:MAX_EXAMPLES]
        findings.append(_finding(
            "medium", "Published package contents differ from the source repo",
            f"{len(differ)} differ, {len(only_pkg)} only in package, {len(identical)} identical "
            f"(of {compared} source files; {len(build)} build-output files skipped): " + ", ".join(ex),
            f"{label}", examples=ex, stats=stats))
        status = "mismatch"
    elif compared == 0:
        why = "build output only" if build else "no source-like files"
        findings.append(_finding("info", f"Package vs repo: not comparable ({why})",
                                 f"not comparable ({why}): {len(build)} build-output files, 0 source files",
                                 f"{label}", stats=stats))
        status = "not-comparable"
    else:
        status = "clean"
    if script_diffs:
        status = "mismatch"
    return {"status": status, "findings": findings, "stats": stats, "identical": identical}


def dp005(reason, repo=None, label="package"):
    return {"rule": "ATL-DP-005", "sev": "low", "file": f"{label}/package.json#repository", "line": 0,
            "snippet": (f"{repo or '(none)'}: {reason}")[:200], "ctx": "src",
            "title": "Declared repository unreachable or missing", "source": "dp004", "method": "meta"}


def _snip_key(f):
    return (f["rule"], re.sub(r"\s+", " ", str(f.get("snippet", ""))).strip()[:120])


def scan_package(pkg_root, identical=(), repo_findings=()):
    """scan.scan_repo() over the extracted package with PACKAGE_SKIP_DIRS (published packages keep
    their code in dist/ or build/). Findings in files byte-identical to the repo, or with the same
    rule+snippet as a repo finding, are dropped; the rest are marked source "package"."""
    found, n, _ = _scan.scan_repo(pkg_root, skip_dirs=_scan.PACKAGE_SKIP_DIRS)
    same = set(identical)
    seen = {_snip_key(x) for x in repo_findings if not x.get("suppressed")}
    out = []
    for x in found:
        if x["file"] in same or (not x.get("suppressed") and _snip_key(x) in seen):
            continue
        x = dict(x)
        x["source"] = "package"
        out.append(x)
    return out, n


def check(info, pkg_root, workdir, clone=None, scan_repo_too=True):
    """Clone the declared repo (at the version tag if any), locate the package subdir,
    compare, and scan both trees. `clone` defaults to safe_clone (inject a fake in tests)."""
    clone = clone or safe_clone
    eco = info.get("eco") or "npm"
    name = info.get("name")
    label = f"{eco}:{name}@{info.get('version')}"
    res = {"status": "no-repo", "findings": [], "repo_scan": [], "pkg_scan": [], "repo": None, "commit": None,
           "ref": None, "subdir": None, "stats": {}, "files": 0, "pkg_files": 0}
    repo, tree_sub = split_tree_url(info.get("repo"))
    subdir = info.get("subdir") or tree_sub
    identical = []
    if not repo:
        res["findings"].append(dp005("no repository declared in registry metadata", None, label))
    else:
        dest = os.path.join(workdir, "repo")
        try:
            sha, ref = clone(repo, dest, info.get("version"), name=name)
        except Exception as e:  # noqa: BLE001 - unreachable repo is a finding, not a crash
            res["findings"].append(dp005(f"unreachable ({type(e).__name__}: {str(e)[:120]})", repo, label))
            sha = None
        if sha is not None:
            root = dest
            if subdir:
                cand = os.path.normpath(os.path.join(dest, subdir))
                if cand.startswith(dest + os.sep) and os.path.isdir(cand):
                    root = cand
            else:
                root = find_package_dir(dest, eco, name) or dest
            rel = os.path.relpath(root, dest)
            res.update(repo=norm_repo(repo), commit=sha, ref=ref, subdir=None if rel == "." else rel)
            cmp_ = compare(pkg_root, root, info.get("scripts"), label)
            identical = cmp_["identical"]
            res["status"] = cmp_["status"]
            res["stats"] = cmp_["stats"]
            res["findings"] += cmp_["findings"]
            if ref == "default-branch":
                res["note"] = "No tag matched the package version; compared with the default branch."
            if scan_repo_too:
                rf, nfiles, _ = _scan.scan_repo(root)
                res["repo_scan"], res["files"] = rf, nfiles
    res["pkg_scan"], res["pkg_files"] = scan_package(pkg_root, identical, res["repo_scan"])
    return res


def summary_line(res):
    if not res:
        return None
    s = res.get("stats") or {}
    st = res.get("status")
    if st == "no-repo":
        return "DP-004: repository unreachable or missing; package contents not verified against source"
    tail = f" @ {res.get('ref')}" if res.get("ref") else ""
    if st == "not-comparable":
        return f"DP-004: not comparable (build output only: {s.get('build_output', 0)} files){tail}"
    return (f"DP-004: {st} - {s.get('identical', 0)} identical, {s.get('differ', 0)} differ, "
            f"{s.get('only_in_package', 0)} only in package, script diffs: {', '.join(s.get('script_diffs') or []) or 'none'}{tail}")
